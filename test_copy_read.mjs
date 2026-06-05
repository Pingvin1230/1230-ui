import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import { cpSync } from 'fs';

console.log('=== Шаг 1: Копируем state.db в /tmp ===');
cpSync('/home/pingvin1230/.hermes/state.db', '/tmp/state_test.db');
console.log('Скопировано');

console.log('\n=== Шаг 2: Проверка копии через sqlite3 CLI ===');
console.log(execSync('sqlite3 /tmp/state_test.db "SELECT COUNT(*) FROM sessions;"').toString().trim());

console.log('\n=== Шаг 3: Проверка копии через better-sqlite3 ===');
const db = new Database('/tmp/state_test.db');
const count = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count.count);
db.close();

console.log('\n=== Шаг 4: Проверка оригинала через better-sqlite3 ===');
const db2 = new Database('/home/pingvin1230/.hermes/state.db');
const count2 = db2.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count2.count);
db2.close();

console.log('\n=== Шаг 5: Размер файлов ===');
console.log(execSync('ls -lh /tmp/state_test.db ~/.hermes/state.db').toString());
