import { execSync } from 'child_process';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

const sessionId = 'test_python_direct_1780605150758';

console.log('=== Шаг 1: Проверка без checkpoint ===');
const check1 = execSync(`sqlite3 ${HERMES_DB_PATH} "SELECT id, title FROM sessions WHERE id = '${sessionId}';"`, { encoding: 'utf-8' });
console.log('Result:', check1 || '(empty)');

console.log('\n=== Шаг 2: WAL checkpoint через sqlite3 ===');
try {
  const checkpoint = execSync(`sqlite3 ${HERMES_DB_PATH} "PRAGMA wal_checkpoint(TRUNCATE);"`, { encoding: 'utf-8' });
  console.log('Checkpoint result:', checkpoint);
} catch (e) {
  console.log('Checkpoint error:', e.message);
}

console.log('\n=== Шаг 3: Проверка после checkpoint ===');
const check2 = execSync(`sqlite3 ${HERMES_DB_PATH} "SELECT id, title FROM sessions WHERE id = '${sessionId}';"`, { encoding: 'utf-8' });
console.log('Result:', check2 || '(empty)');

console.log('\n=== Шаг 4: Проверка WAL файлов ===');
console.log(execSync('ls -lh ~/.hermes/state.db*').toString());
