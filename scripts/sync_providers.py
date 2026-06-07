#!/usr/bin/env python3
"""Sync providers and models from Hermes to 1230-ui database.

Reads ~/.hermes/.env, lists all configured providers via providers.list_providers(),
fetches each provider's model list (via profile.fetch_models() with HTTP fallback),
and upserts everything into the UI DB.

Outputs JSON to stdout on success. Never logs secret values.
"""

import sys
import os
import json
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path
from datetime import datetime

sys.path.insert(0, '/usr/local/lib/hermes-agent')

from providers import list_providers  # noqa: E402

UI_DB_PATH = os.environ.get('UI_DB_PATH', '/opt/1230-ui/data/1230-ui.db')
HERMES_ENV_FILE = Path.home() / '.hermes' / '.env'


def load_env_vars():
    env_vars = {}
    if not HERMES_ENV_FILE.exists():
        return env_vars
    for raw in HERMES_ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        k = k.strip()
        v = v.strip()
        if k and v:
            env_vars[k] = v
    return env_vars


def is_secret_env_var(name: str) -> bool:
    upper = name.upper()
    return not (upper.endswith('_BASE_URL') or upper.endswith('_URL'))


def get_configured_providers(env_vars):
    all_providers = list_providers()
    configured = []
    for profile in all_providers:
        auth_type = getattr(profile, 'auth_type', 'api_key') or 'api_key'
        if auth_type != 'api_key':
            continue
        profile_env_vars = list(getattr(profile, 'env_vars', ()) or ())
        secret_vars = [v for v in profile_env_vars if is_secret_env_var(v)]
        matched = [v for v in secret_vars if v in env_vars]
        if not matched:
            continue
        configured.append({
            'profile': profile,
            'env_var': matched[0],
            'api_key': env_vars[matched[0]],
        })
    return configured


def fetch_models_for_provider(profile, api_key, base_url_override=''):
    """Try profile.fetch_models() first; fall back to {base_url}/v1/models for chat-completions providers."""
    models = []

    # Strategy 1: profile.fetch_models()
    try:
        result = profile.fetch_models(api_key=api_key)
        if result:
            return [str(m) for m in result], 'ok'
    except Exception:
        # fetch_models() can legitimately raise on missing dep / bad key
        pass

    # Strategy 2: HTTP probe of {base_url}/v1/models
    base_url = base_url_override or getattr(profile, 'base_url', '')
    if base_url:
        try:
            models_url = base_url.rstrip('/')
            if not models_url.endswith('/models'):
                if '/v1' in models_url:
                    models_url = models_url[: models_url.rfind('/v1')] + '/v1/models'
                else:
                    models_url = models_url + '/v1/models'

            req = urllib.request.Request(
                models_url,
                headers={'Authorization': f'Bearer {api_key}'}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                if isinstance(data, dict) and 'data' in data and isinstance(data['data'], list):
                    return [m.get('id', str(m)) for m in data['data']], 'ok'
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError, OSError):
            pass
        except Exception:
            pass

    return models, 'no_models'


def sync_to_database(providers_data, ui_db_path):
    conn = sqlite3.connect(ui_db_path)
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    stats = {'providers_synced': 0, 'models_synced': 0, 'errors': []}

    for provider_data in providers_data:
        profile = provider_data['profile']
        env_var = provider_data['env_var']
        api_key = provider_data['api_key']

        try:
            models, status = fetch_models_for_provider(profile, api_key)
            if not models:
                stats['errors'].append(f"{profile.name}: no models found")
                continue

            cursor.execute('''
                INSERT INTO providers (name, display_name, env_var, base_url, sync_status, last_synced_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    display_name = excluded.display_name,
                    env_var = excluded.env_var,
                    base_url = excluded.base_url,
                    sync_status = excluded.sync_status,
                    last_synced_at = excluded.last_synced_at
            ''', (
                profile.name,
                getattr(profile, 'display_name', '') or profile.name,
                env_var,
                getattr(profile, 'base_url', ''),
                status,
                now,
            ))

            provider_id = cursor.execute(
                'SELECT id FROM providers WHERE name = ?', (profile.name,)
            ).fetchone()[0]
            stats['providers_synced'] += 1

            for model_id in models:
                display_name = model_id.replace('-', ' ').replace('_', ' ').title()
                cursor.execute('''
                    INSERT INTO models (provider_id, model_id, display_name, enabled)
                    VALUES (?, ?, ?, 1)
                    ON CONFLICT(provider_id, model_id) DO UPDATE SET
                        display_name = excluded.display_name
                ''', (provider_id, model_id, display_name))
                stats['models_synced'] += 1

        except Exception as e:
            stats['errors'].append(f"{profile.name}: {str(e)}")

    conn.commit()
    conn.close()
    return stats


def main():
    try:
        env_vars = load_env_vars()
        configured = get_configured_providers(env_vars)
        if not configured:
            result = {'success': False, 'error': 'No providers with API keys found'}
            print(json.dumps(result))
            sys.exit(1)

        stats = sync_to_database(configured, UI_DB_PATH)
        result = {
            'success': True,
            'providers_synced': stats['providers_synced'],
            'models_synced': stats['models_synced'],
            'errors': stats['errors'],
            'timestamp': datetime.now().isoformat(),
        }
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
