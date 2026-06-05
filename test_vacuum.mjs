import Database from 'better-sqlite3';
import { execSync } from 'child_process';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Шаг 1: Проверка WAL файла до VACUUM ===');
console.log(execSync('ls -lh ~/.hermes/state.db*').toString());

console.log('\n=== Шаг 2: VACUUM через sqlite3 CLI ===');
console.log(execSync('sqlite3 ~/.hermes/state.db "VACUUM;"').toString());

console.log('\n=== Шаг 3: Проверка WAL файла после VACUUM ===');
console.log(execSync('ls -lh ~/.hermes/state.db*').toString());

console.log('\n=== Шаг 4: Проверка через sqlite3 CLI ===');
console.log(execSync('sqlite3 ~/.hermes/state.db "SELECT COUNT(*) FROM sessions;"').toString());

console.log('\n=== Шаг 5: Проверка через better-sqlite3 ===');
const db = new Database(HERMES_DB_PATH);
const count = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count.count);

const latest = db.prepare('SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 3').all();
console.log('Latest sessions:', latest);
db.close();

console.log('\n=== Шаг 6: Размер основного файла ===');
console.log(execSync('stat ~/.hermes/state.db | grep -E "(Size|Modify)"').toString());
