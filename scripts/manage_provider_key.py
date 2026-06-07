#!/usr/bin/env python3
"""Set or remove a single API-key entry in ~/.hermes/.env.

Set:    argv = set <PROVIDER_NAME> <ENV_VAR> <VALUE>
Remove: argv = remove <PROVIDER_NAME> <ENV_VAR>

For "set" we delegate to hermes_cli.config.save_env_value(), which:
  - writes atomically (tempfile + os.replace)
  - chmod 600
  - invalidates the in-process env cache
  - rejects writes under denylisted paths

For "remove" we re-implement the atomic read-modify-replace in pure Python
because Hermes only exposes save_env_value (no delete).

The provider NAME is informational only — we never touch the registry or
config.yaml. Output: JSON {success, env_var, masked} on stdout, never
logs the value.
"""

import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path

HERMES_AGENT_PATH = '/usr/local/lib/hermes-agent'
sys.path.insert(0, HERMES_AGENT_PATH)

from hermes_cli.config import save_env_value  # noqa: E402

HERMES_ENV_FILE = Path.home() / '.hermes' / '.env'

ENV_VAR_RE = re.compile(r'^[A-Z][A-Z0-9_]*$')
NON_ASCII_RE = re.compile(r'[^\x20-\x7e]')


def mask(value: str) -> str:
    """Return ••••last4 — the same pattern Hermes' TUI uses."""
    if not value:
        return ''
    if len(value) <= 4:
        return '•' * len(value)
    return '•' * 4 + value[-4:]


def validate_env_var(name: str) -> None:
    if not ENV_VAR_RE.match(name):
        raise ValueError(f'invalid env var name: {name!r}')


def validate_value(value: str) -> None:
    if not value:
        raise ValueError('value is empty')
    if NON_ASCII_RE.search(value):
        raise ValueError('value contains non-ASCII characters')


def set_key(env_var: str, value: str) -> None:
    validate_env_var(env_var)
    validate_value(value)
    save_env_value(env_var, value)


def remove_key(env_var: str) -> None:
    validate_env_var(env_var)
    if not HERMES_ENV_FILE.exists():
        return

    original_lines = HERMES_ENV_FILE.read_text().splitlines()
    kept = []
    removed = False
    for line in original_lines:
        stripped = line.lstrip()
        if not removed and not stripped.startswith('#') and '=' in stripped:
            key = stripped.split('=', 1)[0].strip()
            if key == env_var:
                removed = True
                continue
        kept.append(line)

    if not removed:
        return

    # Atomic write: tempfile in the same directory, fsync, os.replace
    fd, tmp_path = tempfile.mkstemp(
        dir=str(HERMES_ENV_FILE.parent), prefix='.env.', suffix='.tmp'
    )
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write('\n'.join(kept))
            if kept and not kept[-1].endswith('\n'):
                f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, HERMES_ENV_FILE)
        os.chmod(HERMES_ENV_FILE, stat.S_IRUSR | stat.S_IWUSR)
    except Exception:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'success': False, 'error': 'usage: manage_provider_key.py {set|remove} ...'}))
        sys.exit(2)

    action = sys.argv[1]
    try:
        if action == 'set':
            if len(sys.argv) != 5:
                raise ValueError('usage: manage_provider_key.py set <provider> <env_var> <value>')
            _, _, provider, env_var, value = sys.argv
            set_key(env_var, value)
            print(json.dumps({
                'success': True,
                'action': 'set',
                'provider': provider,
                'env_var': env_var,
                'masked': mask(value),
            }))
        elif action == 'remove':
            if len(sys.argv) != 4:
                raise ValueError('usage: manage_provider_key.py remove <provider> <env_var>')
            _, _, provider, env_var = sys.argv
            remove_key(env_var)
            print(json.dumps({
                'success': True,
                'action': 'remove',
                'provider': provider,
                'env_var': env_var,
            }))
        else:
            print(json.dumps({'success': False, 'error': f'unknown action: {action!r}'}))
            sys.exit(2)
        sys.exit(0)

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()
