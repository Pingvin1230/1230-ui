import Database from 'better-sqlite3';
import { execSync } from 'child_process';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Тест 1: PRAGMA wal_checkpoint(PASSIVE) ===');
try {
  const db1 = new Database(HERMES_DB_PATH);
  const result1 = db1.pragma('wal_checkpoint(PASSIVE)', { simple: true });
  console.log('Checkpoint result:', result1);
  const count1 = db1.prepare('SELECT COUNT(*) as count FROM sessions').get();
  console.log('Total sessions:', count1.count);
  db1.close();
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n=== Тест 2: PRAGMA wal_checkpoint(FULL) ===');
try {
  const db2 = new Database(HERMES_DB_PATH);
  const result2 = db2.pragma('wal_checkpoint(FULL)', { simple: true });
  console.log('Checkpoint result:', result2);
  const count2 = db2.prepare('SELECT COUNT(*) as count FROM sessions').get();
  console.log('Total sessions:', count2.count);
  db2.close();
} catch (e) {
  console.log('Error:', e.message);
}

console.log('\n=== Тест 3: sqlite3 checkpoint ===');
console.log(execSync('sqlite3 ~/.hermes/state.db "PRAGMA wal_checkpoint(TRUNCATE);"').toString());
console.log(execSync('sqlite3 ~/.hermes/state.db "SELECT COUNT(*) FROM sessions;"').toString());
