import Database from 'better-sqlite3';
import { execSync } from 'child_process';

console.log('=== Шаг 1: Сессии через better-sqlite3 (первые 10) ===');
const db = new Database('/home/pingvin1230/.hermes/state.db');
const better_sessions = db.prepare('SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 10').all();
console.log(better_sessions);
db.close();

console.log('\n=== Шаг 2: Сессии через sqlite3 CLI (первые 10) ===');
const sqlite3_sessions = execSync('sqlite3 ~/.hermes/state.db "SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 10;"').toString();
console.log(sqlite3_sessions);

console.log('\n=== Шаг 3: Есть ли сессии из better-sqlite3 в sqlite3? ===');
const db2 = new Database('/home/pingvin1230/.hermes/state.db');
const all_better = db2.prepare('SELECT id FROM sessions ORDER BY started_at DESC').all();
console.log('better-sqlite3 total:', all_better.length);

for (const session of all_better.slice(0, 5)) {
  const exists = execSync(`sqlite3 ~/.hermes/state.db "SELECT COUNT(*) FROM sessions WHERE id = '${session.id}';"`).toString().trim();
  console.log(`${session.id}: ${exists === '1' ? 'EXISTS' : 'MISSING'} in sqlite3`);
}
db2.close();
