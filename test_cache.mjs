import Database from 'better-sqlite3';
import { execSync } from 'child_process';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Тест 1: Открытие с cache_size=-2000 (как sqlite3 CLI) ===');
const db1 = new Database(HERMES_DB_PATH);
db1.pragma('cache_size=-2000');
const count1 = db1.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count1.count);
db1.close();

console.log('\n=== Тест 2: Открытие с cache_size=0 (без кэша) ===');
const db2 = new Database(HERMES_DB_PATH);
db2.pragma('cache_size=0');
const count2 = db2.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count2.count);
db2.close();

console.log('\n=== Тест 3: Открытие с cache_spill=ON ===');
const db3 = new Database(HERMES_DB_PATH);
db3.pragma('cache_spill=ON');
db3.pragma('cache_size=-2000');
const count3 = db3.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count3.count);
db3.close();

console.log('\n=== Тест 4: Проверка размера основного файла ===');
console.log(execSync('ls -lh ~/.hermes/state.db').toString());
console.log(execSync('stat ~/.hermes/state.db | grep -E "(Size|Modify)"').toString());

console.log('\n=== Тест 5: Прямое чтение файла через sqlite3 ===');
console.log(execSync('sqlite3 ~/.hermes/state.db "PRAGMA integrity_check;"').toString());
console.log(execSync('sqlite3 ~/.hermes/state.db "VACUUM;"').toString());
console.log(execSync('sqlite3 ~/.hermes/state.db "SELECT COUNT(*) FROM sessions;"').toString());
