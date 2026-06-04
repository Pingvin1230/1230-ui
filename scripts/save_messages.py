#!/usr/bin/env python3
"""
Save messages to Hermes state.db
Usage: save_messages.py <session_id> <role> <content> [tool_name]
Environment: HERMES_DB_PATH (optional, defaults to ~/.hermes/state.db)
"""
import sys
import sqlite3
import time
import os
from pathlib import Path

def save_message(session_id: str, role: str, content: str, tool_name: str = None):
    # Use HERMES_DB_PATH env var if set, otherwise default to ~/.hermes/state.db
    db_path_str = os.environ.get('HERMES_DB_PATH')
    if db_path_str:
        db_path = Path(db_path_str)
    else:
        db_path = Path.home() / '.hermes' / 'state.db'
    
    if not db_path.exists():
        print(f"Error: Database not found at {db_path}", file=sys.stderr)
        sys.exit(1)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Insert message
        cursor.execute("""
            INSERT INTO messages (session_id, role, content, tool_name, timestamp)
            VALUES (?, ?, ?, ?, ?)
        """, (session_id, role, content, tool_name, time.time()))
        
        # Update session message_count
        cursor.execute("""
            UPDATE sessions 
            SET message_count = message_count + 1
            WHERE id = ?
        """, (session_id,))
        
        conn.commit()
        message_id = cursor.lastrowid
        print(f"Saved message {message_id}")
        
    except Exception as e:
        conn.rollback()
        print(f"Error saving message: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: save_messages.py <session_id> <role> <content> [tool_name]", file=sys.stderr)
        sys.exit(1)
    
    session_id = sys.argv[1]
    role = sys.argv[2]
    content = sys.argv[3]
    tool_name = sys.argv[4] if len(sys.argv) > 4 else None
    
    save_message(session_id, role, content, tool_name)
