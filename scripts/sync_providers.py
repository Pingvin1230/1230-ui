#!/usr/bin/env python3
"""Sync providers and models from Hermes to 1230-ui database."""

import sys
import os
import json
import sqlite3
from pathlib import Path
from datetime import datetime

# Add hermes-agent to path
sys.path.insert(0, '/usr/local/lib/hermes-agent')

UI_DB_PATH = os.environ.get('UI_DB_PATH', '/opt/1230-ui/data/1230-ui.db')
HERMES_ENV_FILE = Path.home() / '.hermes' / '.env'


def load_env_vars():
    """Load environment variables from ~/.hermes/.env"""
    env_vars = {}
    if HERMES_ENV_FILE.exists():
        for line in HERMES_ENV_FILE.read_text().splitlines():
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                env_vars[k.strip()] = v.strip()
    return env_vars


def get_configured_providers(env_vars):
    """Find providers with API keys configured."""
    from providers import list_providers, get_provider_profile
    
    all_providers = list_providers()
    configured = []
    
    for profile in all_providers:
        profile_env_vars = getattr(profile, 'env_vars', ()) or ()
        matched_keys = [ev for ev in profile_env_vars if ev in env_vars]
        
        if matched_keys:
            configured.append({
                'profile': profile,
                'env_var': matched_keys[0],
                'api_key': env_vars[matched_keys[0]]
            })
    
    return configured


def fetch_models_for_provider(profile, api_key, env_vars):
    """Fetch models for a provider using multiple strategies."""
    models = []
    
    # Strategy 1: Try fetch_models() method
    try:
        result = profile.fetch_models(api_key=api_key)
        if result:
            return [str(m) for m in result], 'ok'
    except Exception as e:
        pass
    
    # Strategy 2: Direct HTTP request to {base_url}/models
    base_url = getattr(profile, 'base_url', '')
    if base_url:
        try:
            import urllib.request
            import urllib.error
            
            # Try OpenAI-compatible /v1/models endpoint
            models_url = base_url.rstrip('/')
            if not models_url.endswith('/models'):
                models_url = models_url.replace('/v1', '') + '/v1/models'
            
            req = urllib.request.Request(
                models_url,
                headers={'Authorization': f'Bearer {api_key}'}
            )
            
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read())
                if 'data' in data:
                    return [m.get('id', str(m)) for m in data['data']], 'ok'
        except Exception as e:
            pass
    
    return models, 'no_models'


def sync_to_database(providers_data, ui_db_path):
    """Sync providers and models to 1230-ui database."""
    conn = sqlite3.connect(ui_db_path)
    cursor = conn.cursor()
    
    now = datetime.now().isoformat()
    stats = {'providers_synced': 0, 'models_synced': 0, 'errors': []}
    
    for provider_data in providers_data:
        profile = provider_data['profile']
        env_var = provider_data['env_var']
        api_key = provider_data['api_key']
        
        try:
            # Fetch models
            models, status = fetch_models_for_provider(profile, api_key, {})
            
            if not models:
                stats['errors'].append(f"{profile.name}: no models found")
                continue
            
            # Upsert provider
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
                now
            ))
            
            provider_id = cursor.execute('SELECT id FROM providers WHERE name = ?', (profile.name,)).fetchone()[0]
            stats['providers_synced'] += 1
            
            # Upsert models
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
    """Main sync function."""
    try:
        # Load environment
        env_vars = load_env_vars()
        
        # Get configured providers
        configured = get_configured_providers(env_vars)
        
        if not configured:
            result = {'success': False, 'error': 'No providers with API keys found'}
            print(json.dumps(result))
            sys.exit(1)
        
        # Sync to database
        stats = sync_to_database(configured, UI_DB_PATH)
        
        result = {
            'success': True,
            'providers_synced': stats['providers_synced'],
            'models_synced': stats['models_synced'],
            'errors': stats['errors'],
            'timestamp': datetime.now().isoformat()
        }
        
        print(json.dumps(result))
        sys.exit(0)
        
    except Exception as e:
        result = {'success': False, 'error': str(e)}
        print(json.dumps(result))
        sys.exit(1)


if __name__ == '__main__':
    main()
