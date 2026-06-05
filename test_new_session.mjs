import Database from 'better-sqlite3';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Тест 1: Открытие нового коннекта (как в withHermesDb) ===');
const db = new Database(HERMES_DB_PATH, { readonly: true });
const sessions = db.prepare('SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 5').all();
console.log(sessions);
db.close();

console.log('\n=== Тест 2: Есть ли новая сессия? ===');
const db2 = new Database(HERMES_DB_PATH, { readonly: true });
const newSession = db2.prepare('SELECT * FROM sessions WHERE id = ?').get('api_1780604827608_0z6bc6zo');
console.log('New session:', newSession);
db2.close();

console.log('\n=== Тест 3: Сколько всего сессий? ===');
const db3 = new Database(HERMES_DB_PATH, { readonly: true });
const count = db3.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count.count);
db3.close();
