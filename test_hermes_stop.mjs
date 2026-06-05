import Database from 'better-sqlite3';
import { execSync } from 'child_process';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Шаг 1: Проверка до остановки Hermes ===');
const db1 = new Database(HERMES_DB_PATH);
const count1 = db1.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count1.count);
db1.close();

console.log('\n=== Шаг 2: Остановка Hermes API ===');
console.log(execSync('sudo systemctl stop hermes-api').toString());
console.log('Hermes API остановлен');

console.log('\n=== Шаг 3: Проверка во время остановки ===');
const db2 = new Database(HERMES_DB_PATH);
const count2 = db2.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count2.count);

const latest = db2.prepare('SELECT id, title FROM sessions ORDER BY started_at DESC LIMIT 3').all();
console.log('Latest sessions:', latest);
db2.close();

console.log('\n=== Шаг 4: Запуск Hermes API обратно ===');
console.log(execSync('sudo systemctl start hermes-api').toString());
console.log('Hermes API запущен');

console.log('\n=== Шаг 5: Проверка после запуска ===');
const db3 = new Database(HERMES_DB_PATH);
const count3 = db3.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count3.count);
db3.close();
