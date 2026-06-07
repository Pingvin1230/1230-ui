#!/usr/bin/env python3
"""List bundled model providers from Hermes registry.

Returns JSON with provider metadata (display_name, description, signup_url,
auth_type, env_vars, base_url) and which env_vars are currently configured
(present in ~/.hermes/.env). Secret VALUES are never returned.

Filters out OAuth / AWS / Copilot / external-process providers — only
auth_type == "api_key" is exposed to the UI in v1.
"""

import json
import os
import sys
from pathlib import Path

HERMES_AGENT_PATH = '/usr/local/lib/hermes-agent'
HERMES_ENV_FILE = Path.home() / '.hermes' / '.env'

sys.path.insert(0, HERMES_AGENT_PATH)

from providers import list_providers  # noqa: E402


def load_env_vars():
    """Return {KEY: True} for every non-empty, non-comment line in .env.

    Only the PRESENCE of the key is exposed — the value never leaves this
    process.
    """
    present = {}
    if not HERMES_ENV_FILE.exists():
        return present
    for raw in HERMES_ENV_FILE.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        value = value.strip()
        if key and value:
            present[key] = True
    return present


def is_secret_env_var(name: str) -> bool:
    """Exclude BASE_URL / URL overrides from the 'configured' check."""
    upper = name.upper()
    return not (upper.endswith('_BASE_URL') or upper.endswith('_URL'))


def main():
    try:
        present = load_env_vars()
        profiles = list_providers()

        result = []
        for profile in profiles:
            env_vars = list(getattr(profile, 'env_vars', ()) or ())
            if not env_vars:
                continue
            auth_type = getattr(profile, 'auth_type', 'api_key') or 'api_key'
            # v1: only api_key providers are user-configurable from the UI
            if auth_type != 'api_key':
                continue

            secret_vars = [v for v in env_vars if is_secret_env_var(v)]
            if not secret_vars:
                continue

            configured_vars = [v for v in secret_vars if v in present]
            primary = configured_vars[0] if configured_vars else secret_vars[0]

            result.append({
                'name': profile.name,
                'display_name': getattr(profile, 'display_name', '') or profile.name,
                'description': getattr(profile, 'description', '') or '',
                'signup_url': getattr(profile, 'signup_url', '') or '',
                'auth_type': auth_type,
                'env_vars': secret_vars,
                'configured_env_var': primary if configured_vars else None,
                'is_configured': bool(configured_vars),
                'base_url': getattr(profile, 'base_url', '') or '',
            })

        result.sort(key=lambda p: (not p['is_configured'], p['display_name'].lower()))
        print(json.dumps({'success': True, 'providers': result}))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
