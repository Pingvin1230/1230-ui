# Анализ возможностей управления сессиями в Hermes

**Дата:** 2026-06-04  
**Автор:** Product Manager

---

## Обзор

Проведён анализ трёх способов управления сессиями в Hermes:
1. **REST API** (порт 8642)
2. **CLI команды** (`hermes sessions`)
3. **Прямое подключение к SQLite** (текущий подход)

---

## 1. REST API (http://127.0.0.1:8642)

### Доступные endpoints

#### GET /api/sessions
- **Описание:** Получить список всех сессий
- **Аутентификация:** Bearer token
- **Параметры:** limit, offset
- **Возвращает:** Массив сессий с полной информацией
- **Пример:**
```bash
curl -H "Authorization: Bearer $API_KEY" http://127.0.0.1:8642/api/sessions
```

#### GET /api/sessions/:id
- **Описание:** Получить конкретную сессию по ID
- **Аутентификация:** Bearer token
- **Возвращает:** Объект сессии
- **Пример:**
```bash
curl -H "Authorization: Bearer $API_KEY" http://127.0.0.1:8642/api/sessions/api-de1f3305a7c44380
```

#### PATCH /api/sessions/:id
- **Описание:** Обновить сессию
- **Аутентификация:** Bearer token
- **Поддерживаемые поля:** `title`
- **Пример:**
```bash
curl -X PATCH \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "New Title"}' \
  http://127.0.0.1:8642/api/sessions/:id
```
- **Тестирование:** ✅ Работает корректно

#### DELETE /api/sessions/:id
- **Описание:** Удалить сессию
- **Аутентификация:** Bearer token
- **Возвращает:** `{"object": "hermes.session.deleted", "id": "...", "deleted": true}`
- **Пример:**
```bash
curl -X DELETE \
  -H "Authorization: Bearer $API_KEY" \
  http://127.0.0.1:8642/api/sessions/:id
```
- **Тестирование:** ✅ Работает корректно (каскадно удаляет сообщения)

### Преимущества REST API
- ✅ **Официальный интерфейс** — поддерживается Hermes
- ✅ **Безопасность** — валидация данных, транзакции
- ✅ **Автоматические триггеры** — обновление FTS индексов
- ✅ **Меньше зависимостей** — не нужен Python/SQLite
- ✅ **Проще тестировать** — стандартный HTTP

### Недостатки REST API
- ❌ **Зависимость от API сервера** — должен быть запущен
- ❌ **Меньше контроля** — нельзя делать произвольные SQL запросы

---

## 2. CLI команды (`hermes sessions`)

### Доступные подкоманды

#### `hermes sessions list`
- **Описание:** Список сессий
- **Параметры:**
  - `--source SOURCE` — фильтр по источнику (cli, telegram, discord, webui)
  - `--limit LIMIT` — максимальное количество
- **Вывод:** Таблица с ID, source, model, message_count, preview

#### `hermes sessions delete <session_id>`
- **Описание:** Удалить сессию
- **Параметры:**
  - `--yes, -y` — пропустить подтверждение
- **Пример:**
```bash
hermes sessions delete api-de1f3305a7c44380 --yes
```

#### `hermes sessions rename <session_id> <title>`
- **Описание:** Переименовать сессию
- **Параметры:** session_id, title (может содержать пробелы)
- **Пример:**
```bash
hermes sessions rename api-de1f3305a7c44380 "New Session Title"
```

#### `hermes sessions export`
- **Описание:** Экспорт сессий в JSONL файл
- **Применение:** Бэкап, миграция

#### `hermes sessions prune`
- **Описание:** Удалить старые сессии
- **Применение:** Очистка БД

#### `hermes sessions optimize`
- **Описание:** Оптимизировать БД (VACUUM + FTS merge)
- **Применение:** Улучшение производительности

#### `hermes sessions stats`
- **Описание:** Статистика хранилища сессий
- **Вывод:** Количество сессий, размер БД, и т.д.

#### `hermes sessions browse`
- **Описание:** Интерактивный выбор сессии
- **Применение:** Поиск и возобновление сессий

### Преимущества CLI
- ✅ **Официальный интерфейс** — часть Hermes
- ✅ **Не требует API сервера** — работает напрямую с БД
- ✅ **Дополнительные функции** — export, prune, optimize
- ✅ **Интерактивность** — browse команда

### Недостатки CLI
- ❌ **Медленнее REST API** — запуск процесса каждый раз
- ❌ **Сложнее парсить вывод** — текстовый формат
- ❌ **Требует shell exec** — less portable

---

## 3. Прямое подключение к SQLite

### Текущая реализация

Используем Python скрипты для прямого доступа к `~/.hermes/state.db`:

#### `scripts/create_session.py`
```python
# Создание сессии
cursor.execute("""
    INSERT INTO sessions (id, source, model, started_at, title)
    VALUES (?, ?, ?, ?, ?)
""", (session_id, 'webui', model, time.time(), title))
```

#### `scripts/save_messages.py`
```python
# Сохранение сообщения
cursor.execute("""
    INSERT INTO messages (session_id, role, content, timestamp)
    VALUES (?, ?, ?, ?)
""", (session_id, role, content, time.time()))
```

### Структура БД

#### Таблица `sessions`
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,           -- cli, telegram, discord, webui, api_server
    user_id TEXT,
    model TEXT,
    model_config TEXT,
    system_prompt TEXT,
    parent_session_id TEXT,
    started_at REAL NOT NULL,
    ended_at REAL,
    end_reason TEXT,
    message_count INTEGER DEFAULT 0,
    tool_call_count INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    reasoning_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL,
    actual_cost_usd REAL,
    api_call_count INTEGER DEFAULT 0,
    title TEXT,                      -- ⭐ Можно изменять
    archived INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (parent_session_id) REFERENCES sessions(id)
);
```

#### Таблица `messages`
```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL,              -- user, assistant, system
    content TEXT,
    tool_call_id TEXT,
    tool_calls TEXT,                 -- JSON массив tool calls
    tool_name TEXT,
    timestamp REAL NOT NULL,
    token_count INTEGER,
    finish_reason TEXT,
    reasoning TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

**Важно:** Есть `ON DELETE CASCADE` — при удалении сессии автоматически удаляются все сообщения.

### Преимущества прямого подключения
- ✅ **Полный контроль** — можно делать любые SQL запросы
- ✅ **Не зависит от API сервера** — работает всегда
- ✅ **Быстро** — нет overhead от HTTP
- ✅ **Гибкость** — можно JOIN'ить таблицы, агрегировать

### Недостатки прямого подключения
- ❌ **Обход защитных механизмов** — нет валидации
- ❌ **Риск повреждения БД** — если ошибка в SQL
- ❌ **Не обновляются FTS индексы автоматически** — нужно вручную
- ❌ **Зависимость от схемы БД** — если изменится, сломается
- ❌ **Требует Python** — дополнительная зависимость

---

## Сравнительная таблица

| Критерий | REST API | CLI | SQLite Direct |
|----------|----------|-----|---------------|
| **Безопасность** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Надёжность** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Производительность** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Гибкость** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Простота использования** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Зависимости** | HTTP client | Shell + Hermes | Python + SQLite |
| **Автоматические триггеры** | ✅ | ✅ | ❌ (вручную) |
| **Валидация данных** | ✅ | ✅ | ❌ |
| **Официальная поддержка** | ✅ | ✅ | ❌ |

---

## Рекомендации для задач 0 и 0.5

### Задача 0: Умные заголовки сессий

#### Текущий подход (create_session.py)
```python
# Прямое подключение к БД
cursor.execute("INSERT INTO sessions ...", (session_id, 'webui', model, time.time(), title))
```

#### Рекомендуемый подход (REST API)
```javascript
// 1. Создание сессии через API
POST http://127.0.0.1:8642/api/sessions
{
  "model": "qwen3.6-plus",
  "title": "Initial Title"
}

// 2. Обновление заголовка через API
PATCH http://127.0.0.1:8642/api/sessions/:id
{
  "title": "Generated by LLM"
}
```

**Преимущества:**
- ✅ Не нужен Python скрипт
- ✅ Автоматическое обновление FTS индексов
- ✅ Валидация данных
- ✅ Проще тестировать

#### Реализация

**Backend (server.js):**
```javascript
// Создание сессии
app.post('/api/sessions', async (req, res) => {
  const { model, title } = req.body;
  
  const response = await fetch(`${HERMES_API_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${HERMES_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, title, source: 'webui' })
  });
  
  const data = await response.json();
  res.json({ sessionId: data.session.id });
});

// Обновление заголовка
app.patch('/api/sessions/:id/title', async (req, res) => {
  const { title } = req.body;
  
  const response = await fetch(`${HERMES_API_URL}/api/sessions/${req.params.id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${HERMES_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });
  
  const data = await response.json();
  res.json(data.session);
});
```

**Frontend (api.ts):**
```typescript
async createSession(model: string, title: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, title })
  });
  const data = await res.json();
  return data.sessionId;
}

async updateSessionTitle(sessionId: string, title: string): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${sessionId}/title`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
}
```

---

### Задача 0.5: Управление сессиями (CRUD)

#### Удаление сессии

**Backend (server.js):**
```javascript
app.delete('/api/sessions/:id', async (req, res) => {
  const response = await fetch(`${HERMES_API_URL}/api/sessions/${req.params.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${HERMES_API_KEY}`
    }
  });
  
  const data = await response.json();
  res.json(data);
});
```

**Frontend (api.ts):**
```typescript
async deleteSession(sessionId: string): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
    method: 'DELETE'
  });
}
```

#### Переименование сессии

Уже покрыто в задаче 0 (см. выше).

---

## Миграция с текущего подхода

### Шаг 1: Удалить Python скрипты
- `scripts/create_session.py` → REST API POST /api/sessions
- `scripts/save_messages.py` → оставить (нет REST API для сообщений)

### Шаг 2: Обновить server.js
- Заменить вызовы `spawn('python3', ['create_session.py', ...])` на `fetch(HERMES_API_URL + '/api/sessions')`

### Шаг 3: Тестирование
- Проверить создание сессий через REST API
- Проверить обновление заголовков
- Проверить удаление сессий
- Проверить, что FTS индексы обновляются корректно

---

## Выводы

### Для задачи 0 (Умные заголовки)
✅ **Использовать REST API** для создания и обновления сессий
- Убрать `create_session.py`
- Добавить endpoint PATCH /api/sessions/:id/title
- Генерировать заголовок через LLM после первого ответа
- Обновлять title через REST API

### Для задачи 0.5 (CRUD сессий)
✅ **Использовать REST API** для всех операций
- DELETE /api/sessions/:id для удаления
- PATCH /api/sessions/:id для переименования
- GET /api/sessions для списка (уже есть)

### Оставить прямое подключение к БД для:
- **Сохранение сообщений** (`save_messages.py`) — нет REST API для этого
- **Чтение сессий/сообщений** — быстрее для больших объёмов
- **Аналитика** — сложные SQL запросы

---

## Следующие шаги

1. **Протестировать REST API** для создания сессий (POST /api/sessions)
2. **Реализовать задачу 0** с использованием REST API
3. **Реализовать задачу 0.5** с использованием REST API
4. **Мигрировать create_session.py** на REST API
5. **Оставить save_messages.py** как есть

---

**Рекомендация:** Использовать REST API для всех операций, где он доступен. Это безопаснее, надёжнее и проще в поддержке.
