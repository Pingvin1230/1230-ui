import Database from 'better-sqlite3';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Тест 1: withHermesDb с readonly ===');
let db1 = new Database(HERMES_DB_PATH, { readonly: true });
const result1 = db1.prepare('SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 3').all();
console.log(result1);
db1.close();

console.log('\n=== Тест 2: без readonly ===');
const db2 = new Database(HERMES_DB_PATH);
const result2 = db2.prepare('SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 3').all();
console.log(result2);
db2.close();
