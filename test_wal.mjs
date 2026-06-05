import Database from 'better-sqlite3';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Проверка WAL файлов ===');
import { execSync } from 'child_process';
console.log(execSync('ls -lh ~/.hermes/state.db*').toString());

console.log('\n=== Тест 1: без checkpoint ===');
let db1 = new Database(HERMES_DB_PATH);
const result1 = db1.prepare('SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 3').all();
console.log(result1);
db1.close();

console.log('\n=== Тест 2: с PRAGMA wal_checkpoint ===');
const db2 = new Database(HERMES_DB_PATH);
db2.pragma('wal_checkpoint(TRUNCATE)');
const result2 = db2.prepare('SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 3').all();
console.log(result2);
db2.close();

console.log('\n=== Тест 3: sqlite3 CLI ===');
console.log(execSync('sqlite3 ~/.hermes/state.db "SELECT id, title, started_at FROM sessions ORDER BY started_at DESC LIMIT 3;"').toString());
