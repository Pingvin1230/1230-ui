import { execSync } from 'child_process';

const HERMES_DB_PATH = '/home/pingvin1230/.hermes/state.db';

console.log('=== Тест 1: Прямой запрос через sqlite3 CLI ===');
const result1 = execSync(`sqlite3 -json ${HERMES_DB_PATH} "SELECT id, title FROM sessions ORDER BY started_at DESC LIMIT 5;"`, { encoding: 'utf-8' });
console.log('Raw result:', result1);
console.log('Parsed:', JSON.parse(result1 || '[]'));

console.log('\n=== Тест 2: Запрос с новой сессией ===');
const result2 = execSync(`sqlite3 -json ${HERMES_DB_PATH} "SELECT id, title FROM sessions WHERE title = 'test-after-sigterm-fix-88888';"`, { encoding: 'utf-8' });
console.log('Raw result:', result2);
console.log('Parsed:', JSON.parse(result2 || '[]'));

console.log('\n=== Тест 3: COUNT запрос ===');
const result3 = execSync(`sqlite3 -json ${HERMES_DB_PATH} "SELECT COUNT(*) as count FROM sessions;"`, { encoding: 'utf-8' });
console.log('Raw result:', result3);
console.log('Parsed:', JSON.parse(result3 || '[]'));
