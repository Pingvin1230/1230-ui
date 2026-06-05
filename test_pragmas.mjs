import Database from 'better-sqlite3';
import { execSync } from 'child_process';

console.log('=== Шаг 1: Проверка через sqlite3 CLI ===');
console.log(execSync('sqlite3 ~/.hermes/state.db "SELECT COUNT(*) FROM sessions;"').toString().trim());

console.log('\n=== Шаг 2: better-sqlite3 с разными PRAGMA ===');

const db1 = new Database('/home/pingvin1230/.hermes/state.db');
db1.pragma('cache_size=0');
db1.pragma('temp_store=MEMORY');
db1.pragma('mmap_size=0');
const count1 = db1.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('With cache_size=0, temp_store=MEMORY, mmap_size=0:', count1.count);
db1.close();

console.log('\n=== Шаг 3: better-sqlite3 с readonly=false ===');
const db2 = new Database('/home/pingvin1230/.hermes/state.db', { readonly: false, fileMustExist: true });
const count2 = db2.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('With readonly=false:', count2.count);
db2.close();

console.log('\n=== Шаг 4: better-sqlite3 с WAL mode ===');
const db3 = new Database('/home/pingvin1230/.hermes/state.db');
db3.pragma('journal_mode=WAL');
db3.pragma('wal_autocheckpoint=0');
const count3 = db3.prepare('SELECT COUNT(*) as count FROM sessions').get();
console.log('With WAL mode:', count3.count);
db3.close();

console.log('\n=== Шаг 5: Проверка размера файла ===');
console.log(execSync('stat ~/.hermes/state.db | grep -E "(Size|Modify)"').toString());
