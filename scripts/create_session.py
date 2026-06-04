#!/usr/bin/env python3
"""
Create new session in Hermes state.db
Usage: create_session.py <model> [title]
Environment: HERMES_DB_PATH (optional, defaults to ~/.hermes/state.db)
"""
import sys
import sqlite3
import time
import os
import uuid
from pathlib import Path

def create_session(model: str, title: str = None):
    # Use HERMES_DB_PATH env var if set, otherwise default to ~/.hermes/state.db
    db_path_str = os.environ.get('HERMES_DB_PATH')
    if db_path_str:
        db_path = Path(db_path_str)
    else:
        db_path = Path.home() / '.hermes' / 'state.db'
    
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}", file=sys.stderr)
        sys.exit(1)
    
    # Generate unique session ID (same format as Hermes: timestamp + random)
    session_id = f"{int(time.time())}_{uuid.uuid4().hex[:8]}"
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Insert new session
        cursor.execute("""
            INSERT INTO sessions (
                id, source, model, started_at, message_count, 
                tool_call_count, input_tokens, output_tokens, title
            ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?)
        """, (session_id, 'webui', model, time.time(), title))
        
        conn.commit()
        print(session_id)
        
    except Exception as e:
        conn.rollback()
        print(f"Error creating session: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: create_session.py <model> [title]", file=sys.stderr)
        sys.exit(1)
    
    model = sys.argv[1]
    title = sys.argv[2] if len(sys.argv) > 2 else None
    
    create_session(model, title)
