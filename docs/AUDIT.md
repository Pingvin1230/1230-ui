# Аудит 1230-UI

**Объект:** `1230-UI` (hermes-webui) — веб-интерфейс для Hermes Agent + OpenCode
**Версия:** `0.9.3` (2026-06-17)
**Дата аудита:** 2026-06-17
**Репозиторий:** `/opt/1230-ui` · GitHub `Pingvin1230/1230-ui`
**Стек:** React 19 + TypeScript + Vite 8 + Tailwind v4 · Express 5 + better-sqlite3 · Python-bridge к Hermes
**Метод:** read-only аудит исходного кода, ключевые находки верифицированы вручную

---

## Контекст и рамки аудита

Аудит выполнен с учётом следующей продуктовой модели (уточнена владельцем):

- **Single-user решение.** Мульти-пользовательский режим пока не планируется. Сейчас это персональное решение для одного пользователя.
- **Две аудитории:**
  - **Обычный пользователь** — пользуется уже настроенным решением (чат, ассистенты, сессии, файлы). UX оценивается с точки зрения **удобства использования готового продукта**.
  - **ИТ-специалист** — устанавливает и настраивает (Hermes venv, `.env`, executor-конфиги, reverse-proxy). В будущем — **SaaS**, где установку/настройку берёт на себя платформа.
- **Осознанные архитектурные решения (НЕ являются проблемами):**
  - 🔵 **Отсутствие встроенной авторизации** — намеренно. Защиту обеспечивает внешний слой (Authelia / reverse-proxy / будущий SaaS-gateway). Auth в приложении не требуется.
  - 🔵 **Скрытое меню настроек** (доступ через user-dropdown) — намеренно, чтобы обычный пользователь туда не ходил.
  - 🔵 **Applications только на desktop (≥1024px)** — идейное решение, sidepane по дизайну не нужен на мобильном.

> ⚠️ Следствие: часть находок классического аудита (нет auth / нет multi-user / скрытые настройки / desktop-only apps) **исключена из критики**, но отмечена там, где она влияет на что-то другое (например, на корректную работу за reverse-proxy или на readiness к SaaS).

---

# Часть 0. План работ (задачи для реализации)

> **🟢 Статус реализации (2026-06-18, релиз v0.9.3):** большая часть плана закрыта в код-аудит харденинг-проходе. Подробности — в [CHANGELOG.md](../CHANGELOG.md) §0.9.3 → «Code audit & hardening (2026-06-18)».
>
> **Сделано (✅):** A2, A3, A4 · B1, B2, B3, B4, B5, B6, B7, B9 · C1, C2, C4, C5, C6, C7, C8 (C3 — отклонение: вложенных `<button>` не оказалось, добавлен aria-label) · D1, D2, D3 (+ cleanup), D4, D5, D6-frontend, D8, D9 (backend + frontend), D10 · B8 (документация).
> **Отложено по решению владельца (⏭️):** A1 (sandbox agent-files — отдельный подход), A5 (CSP — нужна nonce-based + runtime-тест), D7 (versioned migrations — риск для live DB > ценность).
> **Не начато (блоки E/F/G):** SaaS-readiness (Docker, чистые дефолты), новые фичи (экспорт, FTS5, smart-titles, PWA), облегчение Tududi — backlog на следующие релизы.
>
> Чекбоксы ниже сохранены как исходный план; авторитетный источник состояния — CHANGELOG и этот баннер.

> **Как пользоваться:** отметь `- [x]` у задач, которые **НЕ нужны**. Остальные (`- [ ]`) — в работу.
> Задачи сгруппированы по **важности** (блоки A→F убывают) и помечены **сложностью**.
> Сокращения сложности: 🟢 легкая (< 0.5 дня) · 🟡 средняя (0.5–2 дня) · 🔴 сложная (> 2 дня).

## Блок A. P0 — Критичная безопасность (важно даже для single-user)

> Обоснование актуальности при single-user: даже у одного пользователя промпт-инъекция (через загруженный файл, агентский tool или веб-контент) может заставить LLM эксфильтрировать файлы процесса, который работает под **root**. Эти баги не про auth, а про integrity.

- [x] **A1.** 🔴 **Sandbox для agent-files** — валидировать пути из ответа LLM, запретить чтение за пределами whitelist-директорий (рабочая папка сессии / uploads / явно разрешённые). Сейчас LLM может сослаться на `/root/.hermes/.env`, `/etc/*.conf` и файл уйдёт как скачиваемая карточка. *Сложность: 🟡.* `routes/chat.js:261` (`detectAgentFiles`), `routes/files.js:300-345`
- [ ] **A2.** 🟢 **`app.set('trust proxy', 1)`** — за reverse-proxy `req.ip` сейчас всегда IP прокси, из-за чего rate-limiter'ы делят один бакет на всех и ломается per-IP cooldown. *Сложность: 🟢.* `app.js`
- [ ] **A3.** 🟢 **Убрать plaintext-fallback при ошибке шифрования** — при ошибке `encrypt()` возвращать 500/503, не сохранять секрет открытым текстом в БД. *Сложность: 🟢.* `routes/system.js:266,304`
- [ ] **A4.** 🟡 **Пересоздавать `opencodeClient`-синглтон** при смене executor-config — иначе runtime-смена URL/пароля OpenCode частично нерабочая (БД сохранится, клиент ходит со старыми кредами). *Сложность: 🟡.* `lib/opencode.js:542`, `routes/system.js`
- [ ] **A5.** 🟢 **CSP включить всегда** (не только в production) — `contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false` → просто `undefined`. *Сложность: 🟢.* `app.js:40`

## Блок B. Быстрые победы (важно + легко, высокий ROI)

- [ ] **B1.** 🟢 **Дополнить i18n**: ru (+36), es (+18), de (+21) ключей. *Сложность: 🟢.* `src/i18n/locales/*`
- [ ] **B2.** 🟢 **Вынести хардкод в i18n**: MarkdownRenderer (RU: «Скопировано»/«Копировать»/«Показать полностью»/«Свернуть»), `aria-label="Clear search"` (EN), «Language»/«Tududi» в SettingsPage (EN), временные метки `useTimeBracketColor` (RU: «Полночь»/«Рассвет»...), английские сообщения об ошибках в `api.ts` (`:813,830,841,847,852,874`). *Сложность: 🟢.*多处
- [ ] **B3.** 🟢 **Удалить мёртвый код:** `src/store/sessionStore.ts`, `src/store/assistantsStore.ts`, `src/types/session.ts`, `src/data/mockData.ts`. *Сложность: 🟢.* `src/`
- [ ] **B4.** 🟢 **Починить баг иконок** в ApplicationsPage — `app.icon ? (Eye as ...)` всегда использует `Eye`, игнорируя `app.icon`. *Сложность: 🟢.* `src/pages/ApplicationsPage.tsx:83`
- [ ] **B5.** 🟢 **`window.confirm()` → `<Modal>`** в AssistantEditPage (для единообразия с дизайн-системой). *Сложность: 🟢.* `src/pages/AssistantEditPage.tsx:225`
- [ ] **B6.** 🟢 **Светлая тема подсветки кода** — сейчас код-блоки всегда тёмные (`github-dark.css`), диссонанс в светлом режиме приложения. Грузить `github.css`/`github-dark.css` по теме. *Сложность: 🟢.* `src/components/MarkdownRenderer.tsx`
- [ ] **B7.** 🟢 **FOUC темы** — inline-скрипт в `index.html` для предустановки класса `.dark` до первого пейнта. *Сложность: 🟢.* `index.html`, `src/store/themeStore.ts`
- [ ] **B8.** 🟢 **Синхронизировать документацию:** `TODO.md` header (0.9.2→0.9.3, дата), счётчики тестов в README (22→191) и ARCHITECTURE.md (110→191). *Сложность: 🟢.* `TODO.md`, `README.md`, `docs/ARCHITECTURE.md`
- [ ] **B9.** 🟢 **Вычистить stray-файлы из репо:** `london_weather.md`, `design/`, `workspace/`, пустой `data/ui.db`. *Сложность: 🟢.* корень репо

## Блок C. Качество и UX для обычного пользователя (важно, средне)

- [ ] **C1.** 🔴 **Виртуализация MessageList** — `react-virtuoso` в deps, но 0 использований. При длинной сессии весь список рендерится + каждый рендерит MarkdownRenderer. Реальный перфоманс-риск для power-user'а с длинными сессиями. *Сложность: 🟡.* `src/pages/ChatPage.tsx`
- [ ] **C2.** 🟡 **Leave-guard модалка через `<Modal>`** — сейчас сырой `<div>` без focus-trap/`aria-modal`. *Сложность: 🟢.* `src/pages/ChatPage.tsx:914`
- [ ] **C3.** 🟡 **Починить вложенные `<button>` в `SessionCard`** — некорректная вложенность интерактивных элементов ломает a11y-дерево. *Сложность: 🟢.* `src/components/SessionCard.tsx:143`
- [ ] **C4.** 🟡 **Per-route ErrorBoundary** — сейчас крах любой страницы валит весь `<Suspense>` + `window.location.reload()`. *Сложность: 🟡.* `src/App.tsx`
- [ ] **C5.** 🟡 **Фокус-стилы инпутов** — `input:focus, select:focus { outline: none; box-shadow: none }` снимает видимый фокус, риск при клавиатурной навигации. *Сложность: 🟢.* `src/index.css:120`
- [ ] **C6.** 🟢 **Лимит одновременных Toast** — могут накапливаться. *Сложность: 🟢.* `src/components/Toast.tsx`
- [ ] **C7.** 🟡 **`getModels` + flatten в Map** — 5 копий по страницам, вынести в хук/мемо-сервис. *Сложность: 🟢.*多处
- [ ] **C8.** 🟢 **Дедап optimistic-пузыря через `endsWith`** — хрупкий, может съесть легитимное сообщение. Усилить корреляцию. *Сложность: 🟡.* `src/pages/ChatPage.tsx:101`

## Блок D. Техдолг и сопровождаемость (важно для разработчика)

- [ ] **D1.** 🟡 **Хук `useAsync`/react-query** — убрать дубли loading/error/cancelled-паттерна ×8 страниц. *Сложность: 🟡.* все pages
- [ ] **D2.** 🔴 **`zod`: валидировать ответы API** или убрать из deps (0 использований в `src/`). Сейчас любой drift бэкенда → рантайм-ошибки UI. *Сложность: 🟡.* `src/lib/api.ts`
- [ ] **D3.** 🟡 **Заменить глобальный `chat:*` event-bus** на store-actions/context — обход React data-flow, риск гонок. *Сложность: 🟡.* `Layout.tsx`, `ChatPage.tsx`, `ChatInput.tsx`
- [ ] **D4.** 🔴 **Разбить `ChatPage.tsx` (958 строк)** на хуки (`useChatSession`, `useChatScroll`, `useChatNavigationGuard`) + компонент `MessageList`. *Сложность: 🔴.* `src/pages/ChatPage.tsx`
- [ ] **D5.** 🟡 **`import * as LucideIcons`** → named imports / иконка-карта — тащит всю библиотеку иконок, убивая tree-shaking. *Сложность: 🟢.* `src/components/ApplicationsPane.tsx:3`
- [ ] **D6.** 🟡 **Единая обёртка `fetch` в `api.ts`** (908 строк, копия `if (!res.ok) throw` в каждом методе) + единый error-envelope на бэкенде. *Сложность: 🟡.* `src/lib/api.ts`, `routes/*`
- [ ] **D7.** 🟡 **Миграции с версионированием** — сейчас `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info`, без истории/роллбэка. *Сложность: 🟡.* `db/migrate.js`
- [ ] **D8.** 🟡 **Центральный error-middleware** на бэкенде (единый формат ответа) + `loggingMiddleware`, работающий для SSE/файл-стримов, а не только `res.json`. *Сложность: 🟡.* `app.js`
- [ ] **D9.** 🟢 **Убрать дубли:** `fixFilenameEncoding` (`files.js:110`/`globalFiles.js:32`), `middleware/security.ts` (параллель `security.js`), `handleLike` (`Navbar`/`SettingsPage`). *Сложность: 🟢.*
- [ ] **D10.** 🟡 **Тесты для routes** (`/api/sessions`, `/api/chat` end-to-end, `/api/files`, `/api/system/*`). Executor-слой покрыт отлично, routes — слабо. *Сложность: 🔴.* `tests/`

## Блок E. Готовность к SaaS / open-source (для будущего)

- [ ] **E1.** 🔴 **Docker / docker-compose** — критичен для SaaS и упрощения настройки ИТ-специалистом. *Сложность: 🟡.* (новое)
- [ ] **E2.** 🟡 **Убрать персональные URL/пути из дефолтов:** `db/seed.js` (Tududi → `todo.thinkout.ru`), `.env.example`, `ecosystem.config.json` (`/home/pingvin1230/...`, `/opt/1230-ui`). *Сложность: 🟢.*
- [ ] **E3.** 🟡 **Open-source артефакты:** `SECURITY.md`, ISSUE/PR-шаблоны, поля `repository`/`homepage`/`bugs` в `package.json`. *Сложность: 🟢.*
- [ ] **E4.** 🟡 **Tududi сделать opt-in** (не сидировать как default-приложение) — пользователь без Tududi видит ред-статус-дот и не понимает, что это. См. блок G (Tududi). *Сложность: 🟢.* `db/seed.js`
- [ ] **E5.** 🟡 **Единый assumption о пути Hermes** в `install.sh` (проверяет `~/.hermes/...`, но default `/usr/local/lib/hermes-agent`). *Сложность: 🟢.* `install.sh`
- [ ] **E6.** 🟢 **Не тегать v1.0.0** до закрытия блока A + синхронизации доков. Честная бета — v0.9.x. *Сложность: 🟢.*

## Блок F. Новые фичи (backlog, по приоритету)

- [ ] **F1.** 🟡 **Экспорт сессий** в Markdown/JSON (важно для portability / backup). *Сложность: 🟡.*
- [ ] **F2.** 🔴 **FTS5-поиск по сессиям на сервере** (сейчас только client-side). *Сложность: 🟡.*
- [ ] **F3.** 🟡 **Smart titles** (LLM-генерация заголовка сессии). *Сложность: 🟡.*
- [ ] **F4.** 🟡 **PWA** (manifest + service worker) — mobile-опыт. *Сложность: 🟡.*
- [ ] **F5.** 🔴 **Health-check провайдеров** (зелёный/жёлтый/красный бейдж в настройках). *Сложность: 🟡.*
- [ ] **F6.** 🔴 **Ветвления/редактирование сообщений** (message edit / branch). *Сложность: 🔴.*
- [ ] **F7.** 🟡 **Настройки температуры/top_p/max_tokens** в UI. *Сложность: 🟢.*
- [ ] **F8.** 🔴 **Теги/папки** для организации сессий. *Сложность: 🟡.*

## Блок G. Tududi — облегчение (по запросу владельца)

> Tududi нужен владельцу. Цель — сделать его «легче» технически, не убирая функциональность. Сейчас ~2800 LOC (`TasksView` 1065 + `NotesView` 820 + `TaskDetail` 554 + `ProjectsView` 338), всё статически импортируется в реестр → попадает в основной бандл.

- [ ] **G1.** 🟢 **Lazy-load `TududiApp` через `React.lazy`** — код Tududi грузится только когда пользователь открывает приложение. Реальный бандл основного чата похудеет на ~2800 LOC. *Сложность: 🟢.* `src/applications/registry.ts` + сделать все приложения lazy.
- [ ] **G2.** 🟡 **Lazy-load тяжёлых вьюх внутри Tududi** (`TasksView`, `NotesView`, `TaskDetail`) — подгружать по переключению таба, а не сразу. *Сложность: 🟡.* `src/applications/tududi/TududiApp.tsx`
- [ ] **G3.** 🟢 **Tududi opt-in (см. E4)** — не сидировать как default-приложение. У владельца оно включено, у остальных — отключено и не мешает. *Сложность: 🟢.* `db/seed.js`
- [ ] **G4.** 🟡 **i18n Tududi** — часть текстов inline-английские без i18н-ключей. *Сложность: 🟡.* `src/applications/tududi/`
- [ ] **G5.** 🟡 **Вынести подтверждение/exec-модал** в общий компонент (сейчас дубли между SettingsPage и HermesSettingsPage затрагивает и Tududi-настройки). *Сложность: 🟢.*

---

# Часть 1. Executive Summary

1230-UI — **технически сильный проект** с выдающейся для своего возраста инженерной культурой: чистая архитектура адаптеров, продуманный per-session streaming, AES-256-GCM шифрование секретов at rest, аккуратная диагностическая документация. За 13 дней проделан путь от MVP (0.1.0) до 0.9.3 при высоком качестве рефакторингов (server.js сократился с 1911 до ~148 строк).

В рамках уточнённой модели (single-user, настраивает ИТ-специалист, в будущем SaaS) проект **хорошо соответствует своему назначению** как персональный инструмент. Решения «нет auth / скрытые настройки / desktop-only apps» осознанны и корректны.

**Что всё же требует внимания** — это не продуктовые пробелы, а:
1. **Integrity-баги безопасности**, актуальные даже для одного пользователя (agent-file read, plaintext-fallback, поломанный rate-limit).
2. **Качество сопровождения** (мёртвый код, дубли, несогласованный i18n, раздутые компоненты).
3. **Готовность к SaaS/open-source** (Docker, вычистить персональные дефолты, синхронизировать доки).

**Итоговые оценки (из 10) с учётом модели:**

| Перспектива | Оценка | Комментарий |
|---|---|---|
| Техническая (архитектура, код) | **8.0** | Зрелая архитектура адаптеров; 3 integrity-бага требуют фикса |
| UX для обычного пользователя | **7.5** | Высокий полировочный уровень (стриминг, скелетоны, empty-states, a11y) |
| UX для ИТ-настройки | **7.0** | Хорошо, но SettingsPage перегружен (714 строк), дрифт доков |
| Продукт (как single-user / будущий SaaS) | **7.0** | Сильный персональный инструмент; до SaaS нужен Docker + чистые дефолты |

**Топ-3 критичных находки (подтверждены вручную, актуальны при single-user):**

1. 🔴 **Arbitrary file read через agent-files** — промпт-инъекция может заставить LLM сослаться на `/root/.hermes/.env`, `/etc/*.conf`, конфиги, и они отдадутся как скачиваемые файлы (`routes/chat.js:261` + `routes/files.js:300-345`). Процесс работает под **root**.
2. 🔴 **Нет `trust proxy`** — за reverse-proxy все rate-limiter'ы бесполезны (единый бакет), пер-IP cooldown сломан. (Auth намеренно отсутствует — это ОК; но trust-proxy — это про корректность работы за прокси, а не про auth.)
3. 🟠 **Plaintext-fallback при ошибке шифрования** — секреты сохраняются открытым текстом в БД (`routes/system.js:266,304`).

---

# Часть 2. Технический аудит

Объём: ~6 400 LOC бэкенд (31 файл), ~18 000 LOC фронтенд. Метрики верифицированы.

## 2.1. Архитектура

### Слои и поток запуска
Чёткое разделение: `server.js` (оркестратор) → `app.js` (сборка Express) → `routes/` → `lib/` (адаптеры/сервисы) → `db/`.

### Слой БД — грамотное разделение
`db/connections.js` открывает **три** соединения better-sqlite3:

| Соединение | Файл | Режим | Назначение |
|---|---|---|---|
| `db` | Hermes `state.db` | `readonly: true` | SELECT сессий/сообщений |
| `hermesDbWrite` | Hermes `state.db` | WAL, `busy_timeout=1000` | DELETE/INSERT (не мешает WAL Hermes) |
| `uiDb` | `data/1230-ui.db` | writable | UI-состояние |

Разделение Hermes-БД (readonly) и UI-БД — правильное решение.

**⚠️ Нет системы версионированных миграций.** Вместо неё — `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info(...)` перед `ALTER TABLE ADD COLUMN` (`db/migrate.js:82-192`). Идемпотентно, но без истории/роллбэка. (Задача D7.)

### Паттерн «адаптеры» (executor) — strongest point
`lib/adapters/base.js` определяет `ExecutorAdapter` с контрактом `chat(ctx) → AsyncGenerator<ChatEvent>`. Реализации: `HermesAdapter` (`spawn python run_chat.py`, NDJSON) и `OpenCodeAdapter` (HTTP+SSE к `opencode serve`). Реестр `ADAPTERS` (`lib/adapters/index.js`). Добавление третьего executor'а — одно изменение в реестре. Production-grade дизайн.

**⚠️ Баг:** синглтон `opencodeClient` (`lib/opencode.js:542`) строится из **начального** `config` и **не пересоздаётся** при `POST /api/system/executor-config/opencode-1230`. (Задача A4.)

## 2.2. Безопасность

### 🔴 2.2.1. Arbitrary file read через agent-files (A1)
`detectAgentFiles()` (`routes/chat.js:261-350`) парсит абсолютные пути из ответа LLM. Помимо backtick-паттерна есть **широкий fallback** `BARE_PATH_PATTERN` — любой абсолютный путь с whitelisted-расширением (`.md`, `.json`, `.log`, `.conf`, `.txt`, `.csv`…). Каждый найденный путь → `fs.statSync` → если существует → `INSERT` с `stored_name = candidate, source = 'agent'`.

Эндпоинты отдачи (`routes/files.js:300-345`):
```js
if (source === 'agent') {
  absolutePath = row.stored_name;   // путь, который назвала LLM
}
res.download(absolutePath, row.filename, ...);
```

**Вектор при single-user:** промпт-инъекция (через загруженный документ, агентский tool, веб-контент, который агент читает) заставляет LLM упомянуть `/root/.hermes/.env`, `/root/.ssh/...`, конфиги `.conf/.json/.log` — и они становятся скачиваемыми. Процесс под root → тяжёлые последствия. **Решение:** sandbox/whitelist директорий, не доверять тексту модели. (Задача A1.)

### 🔴 2.2.2. Нет `trust proxy` (A2)
`app.set('trust proxy', ...)` отсутствует (верифицировано). За reverse-proxy `req.ip` всегда IP прокси → все rate-limiter'ы (api/chat/exec/provider/like) делят **единый бакет**; per-IP cooldown в `likes.js` глобален.

> Это **не** про отсутствие auth (auth намеренно делегирована внешнему слою — это корректно для single-user + Authelia/SaaS). Это про корректную работу за прокси. (Задача A2.)

### 🟠 2.2.3. Plaintext-fallback при ошибке шифрования (A3)
`routes/system.js:266-268` и `:304-306` (верифицировано):
```js
try { encrypted = encrypt(apiKey); }
catch { encrypted = { ct: apiKey, iv: '', tag: '' }; }   // ← plaintext в БД
```
Должно быть жёсткой ошибкой 500, а не тихим сохранением. (Задача A3.)

### 🟡 2.2.4. Прочие аспекты
| Аспект | Состояние |
|---|---|
| **helmet** | ✅ включён, ⚠️ CSP off вне production (`app.js:40`). (A5) |
| **CORS** | ✅ allowlist из `CORS_ORIGINS`. |
| **Rate-limiting** | ✅ тированный; ⚠️ эффективность ограничена A2. |
| **SQL** | ✅ параметризованный везде; 5 шаблонных интерполяций — все безопасны. SQL-инъекций нет. |
| **multer** | ✅ `stored_name = crypto.randomUUID() + ext` — path traversal при аплоаде исключён. Лимит 50 MB, whitelist расширений + MIME. |
| **Subprocess** | ✅ `spawn` (не `exec`), argv-массив, `shell` off; `command` в `/api/system/exec` валидируется whitelist `['update','doctor']`. |
| **xss-sanitize** | 🟡 рекурсивная очистка `req.body` (depth cap 10), но только body. Defense-in-depth. |
| **Криптография** | ✅ AES-256-GCM + HKDF-SHA256 + `timingSafeEqual`. Качественно. |
| **Раскрытие internals** | 🟡 `error.message`/`stderr`/`fullOutput` наружу (`sessions.js:259,642`, `models.js:118`, `system.js:138`). |
| **`process.env` целиком** в дочерние Python-процессы | 🟡 секреты в окружении спавнящихся процессов. Для Hermes намеренно, для `save_messages.py`/`sync_providers.py` избыточно. |
| **eval/execSync** | ✅ не найдены. |

## 2.3. Качество кода (бэкенд)
- **Обработка ошибок:** единый паттерн `try/catch + res.status(500)`, но **нет центрального error-middleware**. SSE-путь (`chat.js`) — тщательный: watchdog (90s без вывода, 10min хард-лимит), rescue-done, очистка orphan-row, отмена OC-сессии при disconnect. (D8)
- **Валидация:** zod только в `config.js` (образцово); в route-хендлерах ручная и неравномерная.
- **Логирование:** JSON-лог через monkey-patch `res.json` — **не покрывает** SSE/файл-стримы (весь `/api/chat` и download). (D8)

## 2.4. API-дизайн
RESTful в целом, но несогласованный: mix `camelCase`/`kebab-case`/двойное `models`, RPC-стил (`POST /:id/archive`), нет единой error-envelope. (D6)

## 2.5. Масштабируемость
🟠 **`GET /api/sessions`** (`sessions.js:75-146`) вытягивает все строки Hermes-БД + коррелированные подзапросы, затем фильтрует/сортирует/slice'ит в JS. O(N) по памяти/CPU. На большой истории тормозит.

## 2.6. Сильные стороны бэкенда
Грамотная архитектура адаптеров; параметризованный SQL; криптография by-the-book; zod-валидация env (fail-fast); in-flight dedup; SSE-watchdog'и; graceful shutdown; whitelist-валидация; безопасный multer; без `TODO`/`eval`/`execSync`.

---

# Часть 3. UX/UI аудит

Метрики (верифицированы): ~18 000 LOC фронтенд, 13 zustand-сторов, 4 языка, 191 тест. Крупнейшие файлы: `TasksView.tsx` (1065), `ChatPage.tsx` (958), `api.ts` (908), `NotesView.tsx` (820), `SettingsPage.tsx` (714).

## 3.1. UX для обычного пользователя (готовый продукт)

### Стриминг и чат — best-in-class
- **Per-session streaming** через module-level `streamControllers: Map` — стрим **переживает размонтирование ChatPage** при навигации. Recovery-poll при возврате. Зрелое решение.
- 🔴 **Сообщения НЕ виртуализированы** (`react-virtuoso` в deps, 0 использований). При длинной сессии весь список в DOM + MarkdownRenderer. Реальный перфоманс-риск. (C1)

### Markdown и рендеринг
`MarkdownRenderer.tsx` (332 строки) — мощный: `react-markdown` + `remark-gfm` + **lazy-import `rehype-highlight`** (бандл-экономия).
- 🔴 Хардкод русский в UI: «Скопировано»/«Копировать»/«Показать полностью». (B2)
- 🔴 Тема код-блоков всегда тёмная — диссонанс в светлом режиме. (B6)

### Состояния — высокий уровень
✅ Скелетоны везде с `animate-pulse`; empty-states с иллюстрациями; `ErrorMessage` — один из лучших error-UI (иконки по типу, expandable details, retry); `ErrorBoundary` топ-уровневый.
🟡 Нет per-route ErrorBoundary — крах страницы валит весь `<Suspense>` + reload. (C4)

### Доступность
**✅ Хорошо:** `Modal` с focus-trap и восстановлением фокуса; `Toast` с `role="status"`; `prefers-reduced-motion`; safe-area для iPhone; 86 `aria-*`.
**🔴 Плохо:**
- Leave-guard модалка — сырой `<div>` без focus-trap, хотя есть готовый `Modal`. (C2)
- Вложенные `<button>` в `SessionCard` ломают a11y-дерево. (C3)
- Фокус-стилы инпутов сняты глобально — риск невидимого фокуса. (C5)
- Хардкод aria-labels. (B2)

### Уведомления и формы
- `useNotifications` (Web Notifications + Badding API) — корректно; `Toast` без лимита. (C6)
- `ChatInput` (461 строка): корректный drag-and-drop, валидация, прогресс по чипсам, авто-resize. **Сильная форма.**
- 🔴 `AssistantEditPage` — `window.confirm()` вместо `Modal`. (B5)
- 🔴 Общение `ChatPage` ↔ `ChatInput` через глобальный `window.dispatchEvent('chat:*')` — антипаттерн. (D3)

### Тема
- `themeStore` (persist), дефолт dark. FOUC-риск при reload. (B7)

## 3.2. UX для ИТ-специалиста (настройка)

- ✅ Executor-config с **AES-256-GCM encrypted password at rest**; runtime-смена Hermes-конфига работает.
- ⚠️ Runtime-смена OpenCode-конфига частично нерабочая (синглтон `opencodeClient`). (A4)
- ⚠️ `SettingsPage` 714 строк — перегружен, сложно навигировать. Подфактор для сопровождения.
- ⚠️ Дрифт документации (TODO 0.9.2 vs реальная 0.9.3; счётчики тестов 22/110 vs 191). (B8)
- ⚠️ Два assumption о пути Hermes в одном `install.sh`. (E5)
- ⚠️ `ecosystem.config.json` с захардкоженными личными путями. (E2)

> 🔵 **Скрытое меню настроек** — корректное решение для модели (обычный пользователь туда не ходит). Критики не подлежит.

## 3.3. Архитектура фронтенда (для разработчика)

### Zustand-сторы (13)
- `chatInputStore` (главный, core), `workspaceStore`, persist-сторы настроек, статусы executor'ов, панели — рабочие.
- 🔴 **`sessionStore` и `assistantsStore` — мёртвые** (верифицировано: только файлы-определения, ни одного использования). (B3)
- Несогласованность персиста (часть `persist`, часть ручной `localStorage`).
- Селекторы в основном корректные, кроме `useThemeStore()` целиком.

### Data fetching — главный техдолг
Ручной `useEffect + useState + api.x()` в каждой странице, дубли loading/error ×8. Нет react-query/SWR. `api.ts` — моно-объект 908 строк. (D1)
🟠 Несогласованная i18n ошибок в `api.ts` (часть `i18n.t()`, часть хардкод-EN). (B2)

### Система приложений
`applications/registry.ts` (12 строк), 4 приложения. **Статический реестр** (хардкод-импорты) — это модульная декомпозиция, не плагины. (G1)
🔴 `ApplicationsPane.tsx:3` — `import * as LucideIcons` тащит всю библиотеку иконок. (D5)

> 🔵 **Applications только desktop (≥1024px)** — идейное решение. Sidepane не нужен на мобильном. Критики не подлежит.

## 3.4. Конкретные баги (верифицированы)
1. 🔴 `ApplicationsPage.tsx:83` — иконка всегда `Eye`, игнорирует `app.icon`. (B4)
2. 🔴 `Navbar.tsx:324` — кнопка «Logout» только закрывает дропдаун (для single-user + Authelia стоит сделать редирект на authelia-logout, либо убрать кнопку). 
3. 🔴 `Navbar.tsx:243` — `aria-label="Clear search"` хардкод-EN. (B2)
4. 🔴 `SettingsPage.tsx:299,405` — «Language»/«Tududi» хардкод-EN. (B2)
5. 🔴 `useTimeBracketColor.ts:11` — метки только по-русски. (B2)
6. 🟠 `chatInputStore.ts:280` — `assistantId = Date.now() + 1` (генерация ID на клиенте, коллизии). (C8)

## 3.5. Мёртвый код и дубли
1. 🔴 `react-virtuoso` в deps, 0 использований. Либо виртуализировать (C1), либо убрать.
2. 🔴 `zod` в deps, 0 использований в `src/`. Либо валидировать API (D2), либо убрать.
3. 🔴 Дубли типов `Session`/`Message` (`types/api.ts` vs `types/session.ts`). (B3)
4. 🔴 Loading/error паттерн ×8. (D1)
5. `handleLike` дублирован (`Navbar`/`SettingsPage`). (D9)
6. `getModels` + flatten — 5 копий. (C7)
7. `data/mockData.ts` (95 строк) — мёртвый. (B3)

## 3.6. i18n
Структура хороша (i18next, 4 языка, plurals для ru).
🔴 **Неполнота** (верифицировано): ru −36, es −18, de −21 ключей. Десятки хардкод-строк вне i18n. (B1, B2)

## 3.7. Сильные стороны фронтенда
Per-session streaming; lazy-load `rehype-highlight`; доступный `Modal`; лучший `ErrorMessage`; скелетоны + empty-states; аккуратный `useSwipe`; почти полное отсутствие `any`/`console.log`/`TODO`; `prefers-reduced-motion`/safe-area/print.

---

# Часть 4. Продуктовый аудит (single-user → SaaS)

## 4.1. Позиционирование
Тонкий Node.js/Express фронтенд, порождающий Python-сабпроцесс `run_chat.py` внутри venv Hermes на каждый ход. Это осознанный обход бага Hermes `api_server` (игнорирует per-request model).

**Дифференциаторы:** (1) dual-executor (Hermes + OpenCode) с единым UI; (2) приложения в sidepane; (3) per-session streaming; (4) обход routing-бага Hermes.

## 4.2. Инвентарь функций
- **Чат:** streaming, Markdown+подсветка, tool-call, reasoning, per-session streaming (2 concurrent), system prompt, rescue-path. ❌ нет ветвлений/редактирования (F6), нет temperature/top_p в UI (F7).
- **Ассистенты:** CRUD, color/icon/style/depth, **fork-on-edit** (audit trail), archive/restore/duplicate, 3 starter. ❌ нет импорта/экспорта.
- **Сессии:** CRUD, pin/archive, bulk, swipe, группировка по дате. 🔴 поиск только client-side (F2). ❌ нет тегов/папок (F8), smart-titles (F3), экспорта (F1).
- **Провайдеры/модели:** 24 Hermes-bundled, ключи chmod 600, never-return-secrets (маска `••••last4`), UX-обфускация жаргона. ❌ нет health-check (F5).
- **Applications:** File Preview (9 viewers), File Manager, Cloud Connect (WebDAV, AES-256-GCM), Tududi (proxy).
- **Multi-executor:** adapter pattern, Workspace (3 вкладки, dual-mount), executor-статус dot'ы. В 0.9.3 исправлен набор data-loss багов OpenCode-коннектора. ⚠️ `OPENCODE_AUTO_APPROVE_TOOLS=1` по умолчанию.
- **Файлы:** drag-drop, 50 MB/файл, retention 30 дней, global files.

## 4.3. Сильные стороны продукта
1. Архитектурная зрелость адаптеров (best-in-class), `docs/EXECUTOR_ADAPTERS.md` — образец документации.
2. Per-session streaming.
3. Глубокая диагностическая документация (`TROUBLESHOOTING.md` 804 строки).
4. Security hygiene (ключи chmod 600, AES-256-GCM at rest, HMAC-signed URLs).
5. Velocity: 0.1.0 → 0.9.3 за 13 дней, 14 релизов.
6. Осознанный tracking техдолга (`D1-D7, C1-C5` с RESOLVED).
7. 191 тест, executor-слой покрыт отлично.

## 4.4. Что нужно для SaaS / open-source readiness

> В рамках single-user модели «нет auth / нет multi-user» — **НЕ пробелы**. Для SaaS их обеспечит платформенный слой. Ниже — что реально нужно.

| Что | Зачем | Задача |
|---|---|---|
| 🔴 **Docker / docker-compose** | Упростить настройку ИТ-специалистом + базис для SaaS | E1 |
| 🟡 **Чистые дефолты** (убрать `todo.thinkout.ru`, `/home/pingvin1230/...`) | Чтобы чужая установка не сломалась сразу | E2 |
| 🟡 **Tududi opt-in** | Чтобы пользователь без Tududi не видел ред-дот непонятного приложения | E4 / G3 |
| 🟡 **Open-source артефакты** (SECURITY.md, шаблоны, package.json metadata) | Готовность к комьюнити | E3 |
| 🟢 **Синхронизация доков** | Доверие к документации | B8 |
| 🟢 **Не тегать v1.0.0** до закрытия блока A | Честная бета v0.9.x | E6 |

## 4.5. Релизы и инженерия
- **Velocity:** 14 релизов за 13 дней.
- **CI/CD:** `.github/workflows/ci.yml` (Lint→Typecheck→Test→Build), `release.yml` (tarball + GitHub Release по тегу). ❌ нет auto-deploy, matrix, npm publish.
- **Установка:** `install.sh` (главный), PM2 (`ecosystem.config.json` — личные пути!), systemd вручную.

## 4.6. Open-source здоровье
✅ MIT, `CONTRIBUTING.md`, ESLint-enforced code-style, контракт расширяемости задокументирован, tracking техдолга.
🔴 Все коммиты от одного автора (de facto single-vendor); дефолты захардкожены под авторскую инфру; нет SECURITY.md/шаблонов/package.json metadata; нет демо-инстанса.

---

# Часть 5. Tududi — облегчение (по запросу)

Tududi нужен владельцу (~2800 LOC вьюх). Идеи сделать «легче» **без потери функциональности**:

1. **G1 — Lazy-load `TududiApp` (React.lazy).** Самый эффективный и дешёвый шаг. Сейчас Tududi статически импортируется в реестр → весь его код (~2800 LOC) попадает в основной бандл, хотя большинству сессий он не нужен. Через `React.lazy` он будет грузиться только при открытии приложения. Заодно стоит перевести весь реестр приложений на lazy-imports. 🟢 легко, большой ROI по размеру бандла.

2. **G2 — Lazy-load тяжёлых вьюх внутри Tududi.** `TasksView`/`NotesView`/`TaskDetail` подгружать по переключению таба, а не сразу при монтировании `TududiApp`. 🟡 средне.

3. **G3 — Tududi opt-in.** Не сидировать как default-приложение (`db/seed.js`). У владельца — включено, у остальных — отключено и не мозолит глаза ред-дотом. 🟢 легко. (Связано с E2/E4.)

4. **G4 — i18n Tududi.** Часть текстов inline-английские без ключей. 🟡 средне.

5. **G5 — Общий компонент exec/confirm-модалки** (устраняет дубли, затрагивающий и Tududi-настройки). 🟢 легко.

> Архитектурно Tududi не нужно «резать» — нужно просто не тянуть его код в бандл, пока он не нужен (lazy), и не показывать тем, у кого его нет (opt-in).

---

# Приложение. Метрики проекта (верифицированы)

| Метрика | Значение |
|---|---|
| Версия | 0.9.3 (2026-06-17) |
| LOC бэкенд | ~6 400 (31 файл) |
| LOC фронтенд | ~18 000 |
| Тесты | 191 |
| Языки i18n | 4 (en/ru/es/de), 626 ключей в en |
| Версии за 13 дней | 14 (0.1.0 → 0.9.3) |
| Зависимости | React 19, Express 5, TS 6, Vite 8, Tailwind v4 |
| Лицензия | MIT |
| Внешние контрибьюторы | 0 |

---

*Аудит проведён 2026-06-17 на инсталляции `/opt/1230-ui` (BIG 185.145.126.91). Ключевые находки верифицированы вручную через чтение исходного кода. Модель уточнена владельцем: single-user, настраивает ИТ-специалист, в будущем SaaS.*
