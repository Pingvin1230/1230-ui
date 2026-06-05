import Database from 'better-sqlite3';
import { execSync } from 'child_process';

console.log('=== Шаг 1: Все сессии через sqlite3 CLI ===');
const sqlite3_sessions = execSync('sqlite3 ~/.hermes/state.db "SELECT id FROM sessions ORDER BY started_at DESC;"').toString().trim().split('\n');
console.log('sqlite3 sees:', sqlite3_sessions.length, 'sessions');

console.log('\n=== Шаг 2: Все сессии через better-sqlite3 ===');
const db = new Database('/home/pingvin1230/.hermes/state.db');
const better_sessions = db.prepare('SELECT id FROM sessions ORDER BY started_at DESC').all();
console.log('better-sqlite3 sees:', better_sessions.length, 'sessions');
db.close();

console.log('\n=== Шаг 3: Разница ===');
const better_ids = new Set(better_sessions.map(s => s.id));
const missing = sqlite3_sessions.filter(id => !better_ids.has(id));
console.log('Missing in better-sqlite3:', missing);

console.log('\n=== Шаг 4: Проверка отсутствующих сессий через sqlite3 ===');
for (const id of missing) {
  const session = execSync(`sqlite3 ~/.hermes/state.db "SELECT id, title, started_at FROM sessions WHERE id = '${id}';"`).toString();
  console.log(session.trim());
}
