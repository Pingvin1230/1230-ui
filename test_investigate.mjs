import Database from 'better-sqlite3';
import { execSync } from 'child_process';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Информация о БД ===');
const db = new Database(HERMES_DB_PATH);

console.log('\nSQLite version:', db.pragma('compile_options', { simple: false }));
console.log('Journal mode:', db.pragma('journal_mode', { simple: true }));
console.log('Locking mode:', db.pragma('locking_mode', { simple: true }));
console.log('Synchronous:', db.pragma('synchronous', { simple: true }));

console.log('\n=== Проверка блокировок ===');
try {
  const locks = db.pragma('lock_status');
  console.log('Lock status:', locks);
} catch (e) {
  console.log('Cannot get lock status:', e.message);
}

console.log('\n=== Проверка WAL файлов ===');
console.log(execSync('ls -lh ~/.hermes/state.db*').toString());

console.log('\n=== Запрос последних сессий ===');
const sessions = db.prepare('SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 5').all();
console.log(sessions);

db.close();

console.log('\n=== Проверка через sqlite3 CLI ===');
console.log(execSync('sqlite3 ~/.hermes/state.db "PRAGMA compile_options;" | head -5').toString());
console.log(execSync('sqlite3 ~/.hermes/state.db "SELECT id, title FROM sessions ORDER BY started_at DESC LIMIT 5;"').toString());
