import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import { cpSync } from 'fs';

console.log('=== Шаг 1: Копируем все три файла ===');
cpSync('/home/pingvin1230/.hermes/state.db', '/tmp/state_full.db');
cpSync('/home/pingvin1230/.hermes/state.db-wal', '/tmp/state_full.db-wal');
cpSync('/home/pingvin1230/.hermes/state.db-shm', '/tmp/state_full.db-shm');
console.log('Скопировано');

console.log('\n=== Шаг 2: Проверка через sqlite3 CLI ===');
console.log(execSync('sqlite3 /tmp/state_full.db "SELECT COUNT(*) FROM sessions;"').toString().trim());

console.log('\n=== Шаг 3: Проверка через better-sqlite3 ===');
const db = new Database('/tmp/state_full.db');
const count = db.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('Total sessions:', count.count);
db.close();

console.log('\n=== Шаг 4: Размер файлов ===');
console.log(execSync('ls -lh /tmp/state_full.db* ~/.hermes/state.db*').toString());
