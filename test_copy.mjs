import Database from 'better-sqlite3';
import { execSync } from 'child_process';

console.log('=== Копируем state.db ===');
execSync('cp ~/.hermes/state.db /tmp/state_copy.db');
execSync('cp ~/.hermes/state.db-wal /tmp/state_copy.db-wal');
execSync('cp ~/.hermes/state.db-shm /tmp/state_copy.db-shm');
console.log('Скопировано');

console.log('\n=== Проверка копии через sqlite3 ===');
console.log(execSync('sqlite3 /tmp/state_copy.db "SELECT COUNT(*) FROM sessions;"').toString());

console.log('\n=== Проверка копии через better-sqlite3 ===');
const db = new Database('/tmp/state_copy.db');
const result = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', result.count);
const latest = db.prepare('SELECT id, title FROM sessions ORDER BY started_at DESC LIMIT 1').get();
console.log('Latest session:', latest);
db.close();
