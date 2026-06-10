# Brief: Applications Architecture on Sessions Page

**Status:** Draft
**Author:** Product / UX
**Date:** 2026-06-10
**Scope:** Architecture only. Creation of the first application (File Preview) is a separate task.

---

## 1. Context

The Sessions page will evolve from a single chat view into a **split-pane workspace**:

- **Left pane** — Chat with the agent (unchanged, cannot be closed or hidden).
- **Right pane** — **Applications area**, hosting one or more applications.

The first application (File Preview) will be implemented in a follow-up task. This brief covers only the **architecture and infrastructure** required to host applications.

### Design reference

See `docs/sessions-page-split.md` for the visual layout and feature matrix.

---

## 2. Goals

1. Introduce a split-pane layout on the Sessions page (desktop only).
2. Build an **applications system** that is extensible from day one — adding a new application must not require changes to the layout or selector code.
3. Persist applications in the database with metadata and visibility settings.
4. Allow the user to **enable/disable** individual applications and control their **display order**.
5. Hide the applications area entirely on mobile (< 1024 px).

---

## 3. Layout (Sessions page)

### Desktop (≥ 1024 px)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Header (unchanged, full width)                                     │
├───────────────────────────────┬─────────────────────────────────────┤
│                               │  ┌───────────────────────────────┐  │
│                               │  │  App selector (top bar)       │  │
│                               │  └───────────────────────────────┘  │
│    Chat messages (≈ 55 %)     │  ┌───────────────────────────────┐  │
│                               │  │                               │  │
│                               │  │  Application content area     │  │
│                               │  │  (≈ 45 % of page width)       │  │
│                               │  │                               │  │
├───────────────────────────────┴─────────────────────────────────────┤
│  ChatInput (unchanged, full width, in flow)                         │
├─────────────────────────────────────────────────────────────────────┤
│  MobileNav (unchanged, full width, fixed bottom)                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Mobile (< 1024 px)

Applications area is **not rendered**. The page remains identical to the current layout.

### Implementation notes

- Split happens **inside `<main>`** in `Layout.tsx`. ChatInput and MobileNav stay in their current positions and span the full width — no structural changes to them.
- The left pane (chat) is **always visible and non-closable**.
- The right pane is a new `<ApplicationsPane />` component, rendered only when `!isMobile`.
- Proportions: ~55 % / ~45 % (flex-based, not hardcoded pixels).

---

## 4. Data model

### 4.1. Table: `applications`

```sql
CREATE TABLE IF NOT EXISTS applications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  key           TEXT    NOT NULL UNIQUE,    -- stable component key, e.g. 'file_preview'
  name          TEXT    NOT NULL,           -- display name, e.g. 'File Preview'
  icon          TEXT,                       -- lucide icon name OR emoji
  description   TEXT,                       -- short description for settings UI
  enabled       INTEGER NOT NULL DEFAULT 1, -- 1 = visible in sessions, 0 = hidden
  sort_order    INTEGER NOT NULL DEFAULT 0, -- controls order in selector
  desktop_only  INTEGER NOT NULL DEFAULT 1, -- 1 = desktop only (reserved, always 1 for now)
  config        TEXT,                       -- JSON blob for app-specific settings
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_applications_enabled_order
  ON applications(enabled DESC, sort_order ASC);
```

**Design decisions:**

- `key` is the **contract between DB and frontend registry**. The frontend component registers under the same key.
- `enabled` controls visibility in the Sessions page selector. Disabled apps are still accessible via API (for settings UI, future use cases).
- `sort_order` defines the order in the app selector. Lower = first.
- `config` is a JSON column for per-app settings (e.g., default view mode, theme). Schema-less at this layer.
- `desktop_only` is reserved for future mobile support — when we build a mobile variant, this flag will distinguish desktop-only apps.

### 4.2. Seed data

On first run (or migration), insert the first application row:

```sql
INSERT INTO applications (key, name, icon, description, enabled, sort_order)
VALUES ('file_preview', 'File Preview', 'Eye', 'Preview session files inline', 1, 0);
```

Future applications will be added via migrations or a seed script.

---

## 5. Backend API

All endpoints under `/api/applications`.

### 5.1. `GET /api/applications`

Returns all applications, ordered by `sort_order ASC`.

**Response:**
```json
{
  "applications": [
    {
      "id": 1,
      "key": "file_preview",
      "name": "File Preview",
      "icon": "Eye",
      "description": "Preview session files inline",
      "enabled": 1,
      "sortOrder": 0,
      "desktopOnly": 1,
      "config": {}
    }
  ]
}
```

**Query params:**
- `enabled` (optional, `0` or `1`) — filter by enabled status. Default: return all.

### 5.2. `PATCH /api/applications/:id`

Update application metadata. Used by the settings UI.

**Request body (partial):**
```json
{
  "enabled": 0,
  "sortOrder": 1,
  "name": "File Preview",
  "icon": "Eye",
  "description": "...",
  "config": { "defaultView": "split" }
}
```

**Response:** Updated application object.

### 5.3. `POST /api/applications` (admin, future)

Create a new application entry. Not needed for the first application (seeded via migration), but the endpoint should exist for future extensibility.

### 5.4. `DELETE /api/applications/:id` (admin, future)

Soft-delete or hard-delete. Reserved for future.

---

## 6. Frontend architecture

### 6.1. Application registry

Each application is a **React component** registered in a central registry. The registry maps `key` → component.

```
src/applications/
├── registry.ts            ← central registry, maps key → component
├── types.ts               ← ApplicationComponentProps, ApplicationMeta
├── file_preview/          ← first application (separate task)
│   ├── FilePreviewApp.tsx
│   └── index.ts
└── ...future apps/
```

**`registry.ts`:**
```ts
import type { ApplicationComponent } from './types';
import { FilePreviewApp } from './file_preview';

export const applicationRegistry: Record<string, ApplicationComponent> = {
  file_preview: FilePreviewApp,
  // future: 'terminal': TerminalApp, 'diagrams': DiagramsApp, ...
};
```

Adding a new application = adding one entry to this map. No changes to layout, selector, or settings code.

### 6.2. Application component contract

Every application component receives the same props:

```ts
interface ApplicationComponentProps {
  sessionId: string | null;
  config: Record<string, unknown>;  // from DB `config` column
}

type ApplicationComponent = React.ComponentType<ApplicationComponentProps>;
```

`sessionId` is passed so the application can fetch session-scoped data (e.g., files for the current session).

### 6.3. Applications pane component

`<ApplicationsPane />` — the right-side container on the Sessions page.

**Responsibilities:**
1. Fetch the list of enabled applications from the API (cached in store).
2. Render the **app selector** (top bar).
3. Render the **selected application's component** from the registry.
4. Handle the case where no applications are enabled (show empty state or hide the pane entirely).

**App selector UI:**
- Horizontal list of icons or a dropdown — **TBD in the application design task**.
- Default to the first enabled application on mount.
- Remember the last selected application per session (in store or localStorage).

### 6.4. Zustand store

`src/store/applicationsStore.ts`

```ts
interface ApplicationsState {
  applications: ApplicationMeta[];
  selectedKey: string | null;
  loading: boolean;
  error: string | null;

  fetchApplications: () => Promise<void>;
  selectApplication: (key: string) => void;
  updateApplication: (id: number, patch: Partial<ApplicationMeta>) => Promise<void>;
}
```

- `fetchApplications` is called once on Sessions page mount.
- `selectedKey` persists across session switches (user preference).
- `updateApplication` calls `PATCH /api/applications/:id` and updates the local state.

---

## 7. Settings UI

Users must be able to control which applications appear in the Sessions page.

**Location:** Settings page → new section "Applications" (or integrate into existing "Interface" section).

**UI:**
- List of all applications (enabled + disabled).
- Toggle switch for `enabled`.
- Drag-and-drop or up/down buttons for `sort_order`.
- Optional: edit `name`, `icon`, `description` (low priority, can be deferred).

This is a standard CRUD/settings UI — no special constraints.

---

## 8. Responsive behavior

| Breakpoint | Chat pane | Applications pane |
|------------|-----------|-------------------|
| ≥ 1024 px  | ≈ 55 %    | ≈ 45 %            |
| < 1024 px  | 100 %     | not rendered      |

Use the existing `useMobile()` hook (`max-width: 1023px, pointer: coarse and hover: none`).

---

## 9. Out of scope (separate tasks)

- Implementation of the **File Preview** application (content, file list, viewers).
- Mobile variant of the applications area (swipe, tab, drawer).
- Drag-to-resize pane splitter.
- Per-session application state persistence (beyond `selectedKey`).
- Admin UI for creating/deleting applications (only settings for existing apps).

---

## 10. Acceptance criteria

1. Sessions page renders as a split pane on desktop (≥ 1024 px).
2. Left pane (chat) is unchanged and non-closable.
3. Right pane shows an app selector and the selected application's content.
4. Applications are stored in the `applications` table with `key`, `name`, `icon`, `enabled`, `sort_order`, `config`.
5. Backend exposes `GET /api/applications` and `PATCH /api/applications/:id`.
6. Frontend registry pattern allows adding a new application by adding one file and one registry entry.
7. Settings page allows enabling/disabling applications and reordering them.
8. On mobile (< 1024 px), the applications pane is not rendered.
9. If all applications are disabled, the right pane is hidden (chat goes full width).
10. ChatInput and MobileNav remain full-width and unchanged.

---

## 11. Open questions

1. **App selector UI** — icons row, dropdown, or tabs? (To be decided in the application design task.)
2. **Pane proportions** — fixed 55/45, or user-adjustable via drag? (Fixed for v1, resizable as future enhancement.)
3. **Settings location** — dedicated "Applications" section, or part of "Interface"? (TBD with UX.)
4. **Application icon format** — lucide icon name, emoji, or both? (Recommend: lucide name, with emoji fallback.)
