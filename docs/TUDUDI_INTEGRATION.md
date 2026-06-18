# Tududi Application — Integration & Developer Notes

> **Scope:** Self-hosted Tududi task/notes manager (`https://todo.thinkout.ru`) integrated as an
> Application inside 1230-UI (right split-pane, desktop only).
> Backend: Express proxy at `routes/tududi.js` mounts under `/api/tududi/*` on the 1230-UI server
> (BIG, 185.145.126.91) and forwards to Tududi with a server-side bearer token.
> Frontend: `src/applications/tududi/` (React + Zustand) with three tabs (Tasks / Notes / Projects).

---

## 1. What is done

### 1.1 Backend

- **Proxy** (`routes/tududi.js`):
  - Forwards all `*` under `/api/tududi/*` → `<Tududi URL>/api/*` with `Authorization: Bearer <tt_...>`.
  - `GET /api/tududi/health` — connectivity probe against the saved config (no token leak; returns `{configured, reachable, status}`).
  - `GET /api/tududi/config` — current `{ apiUrl, hasToken }` (token masked).
  - `POST /api/tududi/config` — body `{ apiUrl, apiToken? }`. URL-validated; token is AES-256-GCM encrypted via `lib/cloud/crypto.js` and stored in the `system_settings` table under `tududi_api_token_ct/iv/tag`. After save the in-memory `config.tududiApiUrl/Token` is mutated, so the proxy picks up the new value without a service restart. Sending `apiToken: ''` clears the token; omitting `apiToken` leaves it untouched.
  - `POST /api/tududi/test` — body `{ apiUrl?, apiToken? }`. Probes the supplied values (or the saved config if empty) **without** saving — powers the "Test connection" button in the settings page.
  - Generic pass-through: method, body, status, response headers (strips hop-by-hop, `set-cookie`, `content-encoding`).
  - 15 s timeout via `AbortController`; 504 on timeout, 502 on network error, 503 if token missing.
  - Body is forwarded as JSON; supports `GET/POST/PATCH/DELETE`.
  - Mounted in `app.js` with `apiLimiter` (100 req/min/IP).
  - The probe helper itself lives in `lib/tududi.js` (`probeTududi`) so it can be unit-tested in isolation (see `tests/tududi.test.js`).

- **Config** (`config.js`, `.env`):
  - `TUDUDI_API_URL` (default `https://todo.thinkout.ru`), `TUDUDI_API_TOKEN`, `TUDUDI_TIMEOUT_MS`.
  - Zod-validated at boot. `TUDUDI_API_TOKEN` is **optional** (the route returns 503 if absent) so the rest of 1230-UI keeps working when Tududi is not configured.
  - These env vars are only the **initial defaults**. On boot, `server.js` reads `tududi_api_url` + the encrypted `tududi_api_token_*` from `system_settings` and overrides `config.*` in memory — so values edited in the settings UI survive a service restart. The same pattern is used for executor config (OpenCode / Hermes).

- **Application registration**:
  - Seed row in `db/seed.js` — key `tududi`, icon `ListChecks`, enabled by default, desktop-only, sort order 3.

### 1.2 Frontend

- **Client** (`src/lib/api/tududi.ts`):
  - Typed client wrapping the proxy. Methods: `health`, `getConfig`, `saveConfig`, `testConfig`, `listTasks`, `getTask`, `createTask`, `createSubtask`, `updateTask`, `completeTask`, `deleteTask`, `listNotes`, `getNote`, `createNote`, `updateNote`, `deleteNote`, `listProjects`, `listTags`.
  - `TududiApiError` (status, message, detail) for non-2xx responses.

- **Application** (`src/applications/tududi/`):
  - `TududiApp` — header with 3 tabs + health dot + settings + external link.
  - **Tasks view** — list grouped by project, sorted by `due_date ASC, priority DESC, created_at DESC`. Hides `done (2)`, `cancelled (5)`, `archived (3)` and subtasks (`parent_task_id` set). Click row → `TaskDetail` (full-page view inside the panel).
   - **TaskDetail** — compact single-task view: inline name edit, status dropdown (color-coded dots), due date inline, priority buttons (L/M/H), project selector, collapsible note/tags/subtasks sections, delete with confirmation.
   - **StatusControl** — direct port of Tududi's `TaskStatusControl.tsx` (534 lines): Play/Check quick buttons that reveal on `group-hover` (desktop only), chevron dropdown with all 6 statuses, `isCompletingTask` 1.2 s check animation, color tokens from Tududi's `statusStyles.ts` (gray/blue/purple/yellow/green/red), `bg-{color}-50` outline + `bg-{color}-100` filled for active option, `border-l-2 border-current` accent on selected option.
    - **Notes view** — project filter chips + 2-column card grid; click card → read-only preview; edit button → inline editor with Markdown live preview (via `MarkdownRenderer`), auto-save 1 s debounce, color picker (10 colors), project selector, delete with confirmation, search + sort dropdown.
   - **Projects view** — card grid showing all projects with progress bars (done/total tasks), due dates, note counts; each card has "Tasks" / "Notes" buttons to navigate to the filtered view. "New Project" button at bottom opens a creation form.
    - **SettingsModal** — shows proxy path, upstream URL (loaded live from `GET /api/tududi/config`), and the health probe result; links out to the Tududi UI.

- **Recurring-task name fix**:
  - Tududi returns `name: "Monthly"` (or `"Daily"`/`"Weekly"`/`"Yearly"`) on recurrence instances, with the real name in `original_name`. `displayName(task)` detects this and prefers `original_name`. Same fix is used in the list and in `TaskDetail.NameCard`.

### 1.3 Infrastructure

- Tududi is **not** fronted by Authelia (its own session-based auth). The bearer token lives in `/opt/1230-ui/.env` (`TUDUDI_API_TOKEN=tt_...`) and never reaches the browser.
- The 1230-UI service is a systemd unit (`1230-ui.service`) running on BIG, listening on `0.0.0.0:3001`. No PM2. Restart via `systemctl restart 1230-ui`.

---

## 2. What still needs to be done

### 2.1 Tasks — next

- **Filter by tag** — chip filters in the list header (multi-tag OR).
- **Drag-to-reorder subtasks** — Tududi accepts `order` field, currently always appending.
- **Tags chip in list rows with click → filter** — already display, need click handler.
- **Recurrence / defer-until UI** — Tududi supports them on the data model, but the UI only shows them as text. Need an editor (inline card with form like Tududi's `RecurrenceDisplay.tsx` / `TaskDeferUntil.tsx`).
- **Bulk select + bulk status change** — Tududi supports single-task PATCH only; bulk is just a frontend loop.

### 2.2 Notes — done ✅

All items from the original plan have been implemented in the rewritten `NotesView.tsx`:
- **Markdown live preview** — rendered above the textarea using `MarkdownRenderer` (GFM, code highlighting, links).
- **Auto-save 1 s** — debounce on every edit; status indicator (`Saving… / Saved`) in the editor header.
- **Delete with confirmation** — inline confirmation panel in the editor header.
- **Search** — instant filter on title and content, with clear button.
- **Color picker** — 10 predefined colors (amber, pink, blue, green, purple, orange, red, lime, indigo + none), shown as dots in the editor and as card background in the grid.
- **Sort dropdown** — by `updated_at` (default) / `title` / `created_at`.
- **Project link on a note** — project selector in the editor; project name + folder icon on grid cards; project filter chips at the top (first 3 + "…" for more).

Remaining (future):
- **Tags on notes** — Tududi supports `tags` on notes; UI does not yet expose tag editing.
- **Note-to-task conversion** — could be a future "→ Task" button in the editor.

### 2.3 Projects — done ✅

- **Project cards** — grid layout with name, description, progress bar (done/total), due date, note count.
- **Navigation** — "Tasks" / "Notes" buttons on each card to switch to the filtered view.
- **New Project** — dedicated page with name, description, due date fields.
- **createProject API** — `POST /api/project` (may return 400 in some versions; schema varies).

### 2.4 Inbox

Removed — not used in 1230-UI. Inbox management is done via the Tududi web UI.

### 2.5 Cross-cutting

- **Drag-to-resize the right application pane** — would require changes in `Layout.tsx` / `ApplicationsPane.tsx`.
- **Tests** — no unit tests yet for the proxy or the Tududi client. Recommend `vitest` with a mock for `global.fetch`:
  - `routes/tududi.test.js` — happy path, timeout, 502, 503, 401 from upstream.
  - `src/lib/api/tududi.test.ts` — wraps the proxy, asserts on request shape.
- **i18n** — strings in components are English literals. Add keys to `src/i18n/*.json` when translations are needed.
- **Recurring-task edits** — when a user edits a recurring instance, Tududi's behaviour is to update the parent template (not the instance). The current `updateTask` sends `name` from the form, which would overwrite the placeholder `"Monthly"` with the real name and break future instances. Should explicitly send `original_name` if it differs from `name` to preserve the template.
- **Color / theme audit** — many of the 1230UI semantic tokens (`bg-bg-primary`, `text-fg-secondary`, `border-border-default`) are reused; verify in both light and dark mode.

---

## 3. Tududi API — observed contract

> Snapshot from `chrisvel/tududi:latest` (container running on VPS, started 2026-06-02). Not 100% documented upstream; many shapes were probed via `curl` and documented in commit history.

### 3.1 Auth

- `Authorization: Bearer tt_<hex>` header. Token created in Tududi UI (Profile → Settings → API Keys) or via `POST /api/profile/api-keys` with a session cookie. Only **one token** is needed for the whole app.
- Inside 1230-UI the token is set via **Settings → Tududi** (`POST /api/tududi/config`). It is AES-256-GCM encrypted with `CLOUD_CONNECT_KEY` and stored in the `system_settings` table. The plaintext token is held only in the server's in-memory `config` object.
- `.env` (`TUDUDI_API_TOKEN`) is still read at boot as the initial default; if the same key exists in `system_settings`, the DB value wins.
- Tokens are user-scoped — only the owning user can see / modify their tasks and notes. There is exactly one user (`pingvin1230@thinkout.ru`) on the production instance.

### 3.2 Endpoint quirks (important!)

The Tududi backend uses **inconsistent singular/plural** paths. The pattern observed:

| Action | Path | Returns |
| --- | --- | --- |
| List | `GET /api/tasks` | `{ tasks: TududiTask[] }` (envelope) |
| List | `GET /api/notes` | `TududiNote[]` (bare array) |
| List | `GET /api/projects` | `{ projects: TududiProject[] }` |
| List | `GET /api/tags` | `TududiTag[]` (bare array) |
| List | `GET /api/areas` | bare array |
| Read | `GET /api/task/:uid` | `TududiTask` (bare) |
| Read | `GET /api/note/:uid` | `TududiNote` (bare) |
| Read | `GET /api/project/:uid` | 404 (not implemented in this version) |
| Create | `POST /api/task` | `TududiTask` (bare) |
| Create | `POST /api/note` | `TududiNote` (bare) |
| Create | `POST /api/project` | `TududiProject` (bare) — may return 400 in some versions |
| Create | `POST /api/inbox` | inbox item |
| Update | `PATCH /api/task/:uid` | `TududiTask` (bare) |
| Update | `PATCH /api/note/:uid` | `TududiNote` (bare) |
| Delete | `DELETE /api/task/:uid` | `{ message }` |
| Delete | `DELETE /api/note/:uid` | `{ message }` |

**Two rules to remember when extending the client:**

1. **Singular for write paths**: `/api/task`, `/api/note`, `/api/inbox` (note: inbox is plural). `/api/project` and `/api/tag` POSTs return 400 in the deployed version.
2. **Bare objects on write** (POST/PATCH return the entity directly, not wrapped in `{task}` / `{note}`). The earlier mistake of assuming `r.task.uid` is what triggered the runtime error `can't access property "uid", e is undefined`.
3. **Singular `parent_task_id` on subtask creation**: must be the **numeric id** of the parent, not its uid. Sending the uid string yields `400 "Invalid parent task."`.

### 3.3 Task fields (TududiTask)

```ts
{
  id: number;                       // numeric primary key
  uid: string;                       // public id used in URLs (always present)
  name: string;                      // for recurring instances, this is "Monthly" / "Daily" / "Weekly" / "Yearly"
  original_name: string | null;      // real name for recurring instances
  note: string | null;               // free-form text (plain, NOT markdown)
  status: number;                    // 0=not_started, 1=in_progress, 2=done, 3=archived, 4=waiting, 5=cancelled, 6=planned
  priority: number | null;           // 0=low, 1=medium, 2=high, null=unspecified
  due_date: string | null;           // 'YYYY-MM-DD'
  defer_until: string | null;
  completed_at: string | null;       // ISO
  created_at: string | null;         // ISO
  updated_at: string | null;         // ISO
  project_id: number | null;
  parent_task_id: number | null;     // subtasks: 1 level deep
  Project: { id, uid, name, status? } | null;   // joined
  tags: string[];                    // array of tag name strings
  subtasks: TududiTask[];
  recurrence_type: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
  recurrence_interval: number | null;
  recurrence_end_date: string | null;
  recurrence_weekday: number | null;
  recurrence_weekdays: number[] | null;
  recurrence_month_day: number | null;
  recurrence_week_of_month: number | null;
  completion_based: boolean;
  habit_mode: boolean;
  // ... habit_* fields
}
```

### 3.4 Note fields (TududiNote)

```ts
{
  id: number;
  uid: string;
  title: string | null;
  content: string | null;            // Markdown
  project_id: number | null;
  tags: string[];
  color: string | null;              // hex like '#fef3c7', 10 predefined colors
  created_at: string | null;
  updated_at: string | null;
}
```

### 3.5 Status enum (also defined in `src/lib/api/tududi.ts`)

```ts
export const TUDUDI_STATUS: Record<number, string> = {
  0: 'not_started', 1: 'in_progress', 2: 'done', 3: 'archived',
  4: 'waiting', 5: 'cancelled', 6: 'planned',
};

export const TUDUDI_PRIORITY: Record<number, 'low' | 'medium' | 'high'> = {
  0: 'low', 1: 'medium', 2: 'high',
};
```

---

## 4. Implementation gotchas

1. **JIT Tailwind + dynamic class strings.**
   The Tududi status control builds its `quickButtonClasses` via template literals. With Tailwind v4 + `@tailwindcss/vite`, the JIT scanner can fail to pick up classes that are only ever assembled at runtime. Initially the Play / Check buttons were invisible (`md:opacity-0 md:pointer-events-none md:w-0`) and never re-revealed on hover. Fix: keep the class list as one literal string in JSX. Verify the compiled CSS contains the exact selectors (e.g. `md\:group-hover\:w-auto`) before shipping.

2. **The Play / Check buttons are hidden by design.**
   Tududi's status control intentionally swallows clicks on the main label for `not_started` / `in_progress` tasks (so you can't accidentally "complete" by clicking the label). The only way to advance the status is the Play button (set in progress) or the Check button (mark as done), which are revealed only on desktop `group-hover`. On mobile / no-hover devices the user can only use the chevron dropdown.

3. **Subtask creation uses numeric `parent_task_id`.**
   `POST /api/task` with `parent_task_id: <uid_string>` → 400. Must be the parent's numeric `id` (e.g. `36`), not its `uid`. The UI uses `task.id` (numeric) when calling `createSubtask(parentId, name)`.

4. **`/api/task/:uid` returns the bare object, not `{ task: ... }`.**
   This was the cause of the runtime crash `can't access property "uid", e is undefined`. The client must treat `updateTask` / `getTask` / `createTask` as returning `TududiTask` directly. Same for `updateNote` / `getNote` / `createNote`.

5. **`displayName` for recurring tasks.**
   `task.name` is `"Monthly"` for a recurrence instance, while `task.original_name` holds the real title. Use `displayName(task)` everywhere the user sees a task name. Do not send `name: original_name` on PATCH unless you mean to rewrite the parent template (Tududi's behaviour).

6. **The 1230-UI panel is desktop-only.**
   The `ApplicationsPane` is hidden on `< 1024 px` (mobile-first layout). The Tududi app inherits this; on phones, the app is not reachable.

7. **Tag creation on task create.**
   `POST /api/task` with `tags: ['urgent']` returns 400 (`Invalid tag names: "undefined" (Tag name is required)`). Tags must be created implicitly (by applying them to a note) and then referenced by name. As a result, the current UI does not let you set tags on task creation — only via the inline editor in `TaskDetail.TagsCard`, which also relies on the implicit-creation side-effect of PATCH.

8. **Authelia + Tududi.**
   Tududi is not behind Authelia. The proxy is the only place the bearer token is read. The token never touches the browser; the proxy strips `set-cookie` and `authorization` from responses before forwarding to the client.

9. **Tududi's `due_date` is `YYYY-MM-DD` only** (no time). The current UI uses `<input type="date">` and the value flows through unchanged. Don't try to push an ISO datetime.

10. **`TUDUDI_API_TOKEN` is optional in `.env`.**
    If absent, the proxy returns 503 with `tududi_not_configured`. This keeps 1230-UI bootable even without Tududi. The frontend shows a red status dot and a failure banner in the relevant view.

11. **CORS.**
    The proxy lives on the same origin as the 1230-UI front-end (both served from `/` on port 3001, behind Authelia at `kesha.thinkout.ru`). No CORS headers needed. The proxy's outgoing fetch to `https://todo.thinkout.ru` is a server-side call.

12. **Service management.**
    The 1230-UI service runs under systemd. After any `dist/` change, `systemctl restart 1230-ui` picks up the new bundle. There is no PM2 / nodemon in production. Vite emits content-hashed filenames (`index-AbCdEf12.js`), so the cached `index.html` is always served `no-cache` and the browser always picks up the latest assets.

13. **Source layout.**
    ```
    routes/tududi.js                          # proxy
    src/lib/api/tududi.ts                     # typed client
    src/applications/tududi/
      TududiApp.tsx                           # header + tab routing
      SettingsModal.tsx                       # proxy / health / open external
      views/
        TasksView.tsx                         # project filters + card grid + new task page (rewritten 2026-06-16)
        TaskDetail.tsx                        # compact single-task view (rewritten 2026-06-16)
        NotesView.tsx                         # project filters + card grid + inline editor (rewritten 2026-06-16)
        ProjectsView.tsx                      # project cards with progress, due dates, nav to tasks/notes
      index.ts                                # exports TududiApp
    ```

14. **Tests.**
    The Tududi integration is covered by `tests/tududi.test.js` (`lib/tududi.js` — `probeTududi` happy path / 401 / 500 / timeout / network error / no-token / no-url / trailing-slash / custom timeout) and `tests/tududi-routes.test.js` (the proxy: health, config validation/save/hot-reload/encrypt, test, hop-by-hop stripping, 502/503/504 mapping). The typed client `src/lib/api/tududi.ts` itself is not yet unit-tested.

15. **Docs upstream.**
    The Tududi documentation at <https://docs.tududi.com> describes features and some behaviours but does not exhaustively document REST endpoints or response shapes. The github repo `chrisvel/tududi` is the source of truth for the front-end behaviour we copy (status control, notes auto-save, etc.).
