import Database from 'better-sqlite3';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Проверка прав доступа ===');
import { execSync } from 'child_process';
console.log(execSync('ls -la ~/.hermes/state.db*').toString());
console.log(execSync('id').toString());

console.log('\n=== Тест 1: readonly=false, fileMustExist=false ===');
try {
  const db1 = new Database(HERMES_DB_PATH, { readonly: false, fileMustExist: false });
  const result1 = db1.prepare('SELECT COUNT(*) as count FROM sessions').get();
  console.log('Total sessions:', result1.count);
  const latest = db1.prepare('SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 1').get();
  console.log('Latest session:', latest);
  db1.close();
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n=== Тест 2: sqlite3 с теми же правами что и у нас ===');
console.log(execSync('sqlite3 -readonly ~/.hermes/state.db "SELECT COUNT(*) FROM sessions;"').toString());
console.log(execSync('sqlite3 -readonly ~/.hermes/state.db "SELECT id, title FROM sessions ORDER BY started_at DESC LIMIT 1;"').toString());
