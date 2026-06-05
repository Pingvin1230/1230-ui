import { execSync } from 'child_process';

const HERMES_API_URL = 'http://127.0.0.1:8642';
const HERMES_API_KEY = '1230-ui-secret-key-2026';

const title = 'test-hermes-api-create-' + Date.now();

console.log('=== Шаг 1: Создание сессии через Hermes API ===');
try {
  const result = execSync(`curl -s -X POST ${HERMES_API_URL}/api/sessions -H "Authorization: Bearer ${HERMES_API_KEY}" -H "Content-Type: application/json" -d '{"model":"qwen3.6-plus","title":"${title}"}'`, { encoding: 'utf-8' });
  console.log('Result:', result);
  const data = JSON.parse(result);
  const sessionId = data.session?.id || data.id;
  
  console.log('\n=== Шаг 2: Проверка через sqlite3 CLI ===');
  const check1 = execSync(`sqlite3 /home/pingvin1230/.hermes/state.db "SELECT id, title FROM sessions WHERE id = '${sessionId}';"`, { encoding: 'utf-8' });
  console.log('sqlite3 result:', check1 || '(empty)');
  
  console.log('\n=== Шаг 3: Проверка через Hermes API ===');
  const check2 = execSync(`curl -s ${HERMES_API_URL}/api/sessions/${sessionId} -H "Authorization: Bearer ${HERMES_API_KEY}"`, { encoding: 'utf-8' });
  console.log('API result:', check2);
  
} catch (e) {
  console.log('Error:', e.message);
}
