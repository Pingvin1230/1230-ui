import { execSync } from 'child_process';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Шаг 1: Создание сессии через Python скрипт ===');
const sessionId = 'test_python_direct_' + Date.now();
const result = execSync(`python3 /opt/1230-ui/scripts/create_session.py ${sessionId} 'webui' 'test-python-direct-title'`, { encoding: 'utf-8' });
console.log('Python result:', result);

console.log('\n=== Шаг 2: Проверка через sqlite3 CLI ===');
const check1 = execSync(`sqlite3 -json ${HERMES_DB_PATH} "SELECT id, title, source FROM sessions WHERE id = '${sessionId}';"`, { encoding: 'utf-8' });
console.log('sqlite3 result:', check1);

console.log('\n=== Шаг 3: Проверка через sqlite3 без -json ===');
const check2 = execSync(`sqlite3 ${HERMES_DB_PATH} "SELECT id, title, source FROM sessions WHERE id = '${sessionId}';"`, { encoding: 'utf-8' });
console.log('sqlite3 raw result:', check2);

console.log('\n=== Шаг 4: Проверка WAL файлов ===');
console.log(execSync('ls -lh ~/.hermes/state.db*').toString());
