# Brief: Task #38 — File Manager Application

**Status:** Draft
**Author:** Product / UX
**Date:** 2026-06-10
**Dependencies:** Task #36 (Applications architecture) — ✅ Done, Task #37 (File Preview) — ✅ Done
**Scope:** Implementation of the second application (File Manager) within the Applications area

---

## 1. Context

Task #36 introduced the Applications architecture on the Sessions page:
- Split layout (50/50 on desktop ≥ 1024 px)
- Applications pane with pill tabs for app selection
- Registry pattern (`src/applications/registry.ts`)
- `applications` table in DB with `file_preview` seeded

Task #37 implemented File Preview (session-scoped file viewing).

Task #38 adds **File Manager** — a global file management tool that works across all sessions. This is a **desktop-only** application (not available on mobile).

---

## 2. Goals

1. Provide a global view of all files across all sessions (no tree structure, no folder paths, no session IDs in UI)
2. Show total disk usage and file count
3. Implement file retention policy (auto-expire after N days)
4. Allow users to extend file lifetime (prevent auto-deletion)
5. Allow users to delete files globally
6. Provide sorting/filtering by name, date, size, expiration
7. Link to session where file was used (click → navigate to session + open File Preview)

---

## 3. Architecture

### 3.1. Component structure

```
src/applications/file-manager/
├── FileManagerApp.tsx          ← Main component (registered in registry)
├── FileStatsBar.tsx            ← Top bar: total files, total size, expiring soon
├── FileList.tsx                ← Sortable table of files
├── FileRow.tsx                 ← Single file row with actions
├── ExtendButton.tsx            ← Button to extend file lifetime
├── DeleteConfirmModal.tsx      ← Confirmation dialog for deletion
└── index.ts                    ← Export FileManagerApp
```

### 3.2. Registry update

**File:** `src/applications/registry.ts`

```ts
import { FileManagerApp } from './file-manager';

export const applicationRegistry: Record<string, ApplicationComponent> = {
  file_preview: FilePreviewApp,
  file_manager: FileManagerApp,  // ← Add this
};
```

### 3.3. Desktop-only

File Manager is **only available on desktop** (in the Applications pane). On mobile (< 1024 px), the Applications pane is hidden, so File Manager is not accessible.

This is consistent with the Applications architecture (Task #36).

---

## 4. Backend changes

### 4.1. Database migration

**File:** `db/migrate.js`

Add two columns to `session_files`:

```sql
ALTER TABLE session_files ADD COLUMN expires_at INTEGER;  -- epoch ms, NULL = never expires
ALTER TABLE session_files ADD COLUMN extended_count INTEGER NOT NULL DEFAULT 0;
```

**Notes:**
- `expires_at = NULL` means the file never expires (technical capability, no UI to set this)
- `extended_count` tracks how many times the file has been extended (for debugging/analytics)

### 4.2. Configuration

**File:** `.env` (and `.env.example`)

```env
# File retention policy (days)
# Files are automatically deleted after this many days
# Set to 0 to disable auto-deletion
FILE_RETENTION_DAYS=30
```

**File:** `config.js`

```js
fileRetentionDays: parseInt(process.env.FILE_RETENTION_DAYS) || 30,
```

### 4.3. Auto-set expiration on upload

**File:** `routes/files.js` (POST `/api/sessions/:id/files`)

When inserting into `session_files`, set:

```js
const expiresAt = config.fileRetentionDays > 0
  ? uploadedAt + (config.fileRetentionDays * 24 * 60 * 60 * 1000)
  : null;

uiDb.prepare(`
  INSERT INTO session_files (session_id, filename, stored_name, mime_type, size, uploaded_at, expires_at, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'user')
`).run(sessionId, filename, storedName, mimeType, size, uploadedAt, expiresAt);
```

### 4.4. Startup cleanup

**File:** `server.js` (or separate `scripts/cleanupExpiredFiles.js`)

On server startup, delete expired files:

```js
function cleanupExpiredFiles() {
  const now = Date.now();
  const expired = uiDb.prepare(`
    SELECT id, session_id, stored_name, source FROM session_files
    WHERE expires_at IS NOT NULL AND expires_at < ?
  `).all(now);

  for (const file of expired) {
    // Delete from disk (only user files, not agent files)
    if (file.source !== 'agent') {
      try {
        fs.unlinkSync(path.join(uploadsDir, file.session_id, file.stored_name));
      } catch (err) {
        if (err.code !== 'ENOENT') console.warn('Failed to delete expired file:', err);
      }
    }
    // Delete from DB
    uiDb.prepare('DELETE FROM session_files WHERE id = ?').run(file.id);
  }

  if (expired.length > 0) {
    console.log(`Cleaned up ${expired.length} expired file(s)`);
  }
}

// Call on startup
cleanupExpiredFiles();
```

**Optional:** Schedule daily cleanup with `setInterval(cleanupExpiredFiles, 24 * 60 * 60 * 1000)`.

### 4.5. New API endpoints

**File:** `routes/files.js` (or new `routes/globalFiles.js`)

#### `GET /api/files`

List all files across all sessions (with session title).

**Query params:**
- `sort` (optional): `name`, `date`, `size`, `expires` (default: `date`)
- `order` (optional): `asc`, `desc` (default: `desc`)
- `filter` (optional): `all`, `expiring` (< 7 days), `images`, `code`, `documents` (default: `all`)
- `search` (optional): search by filename

**Response:**
```json
{
  "files": [
    {
      "id": 1,
      "sessionId": "abc123",
      "sessionTitle": "Debug Python script",
      "filename": "script.py",
      "mimeType": "text/x-python",
      "size": 12345,
      "uploadedAt": 1718000000000,
      "expiresAt": 1720592000000,
      "extendedCount": 0,
      "source": "user"
    }
  ],
  "stats": {
    "totalFiles": 42,
    "totalSize": 1048576,
    "expiringSoon": 5
  }
}
```

**SQL query:**
```sql
SELECT
  f.id,
  f.session_id,
  s.title AS session_title,
  f.filename,
  f.mime_type,
  f.size,
  f.uploaded_at,
  f.expires_at,
  f.extended_count,
  f.source
FROM session_files f
LEFT JOIN sessions s ON f.session_id = s.id
ORDER BY f.uploaded_at DESC
```

#### `PATCH /api/files/:fileId/extend`

Extend file expiration by `FILE_RETENTION_DAYS`.

**Logic:**
```js
const file = uiDb.prepare('SELECT * FROM session_files WHERE id = ?').get(fileId);
if (!file) return res.status(404).json({ error: 'File not found' });

const extensionMs = config.fileRetentionDays * 24 * 60 * 60 * 1000;
const newExpiresAt = (file.expires_at || file.uploaded_at) + extensionMs;

uiDb.prepare(`
  UPDATE session_files
  SET expires_at = ?, extended_count = extended_count + 1
  WHERE id = ?
`).run(newExpiresAt, fileId);

res.json({ success: true, expiresAt: newExpiresAt });
```

**Notes:**
- If `expires_at` is NULL (never expires), set it to `uploaded_at + extension`
- Increment `extended_count`

#### `DELETE /api/files/:fileId`

Delete file globally (from disk + DB).

**Logic:**
```js
const file = uiDb.prepare('SELECT * FROM session_files WHERE id = ?').get(fileId);
if (!file) return res.status(404).json({ error: 'File not found' });

// Delete from disk (only user files)
if (file.source !== 'agent') {
  try {
    fs.unlinkSync(path.join(uploadsDir, file.session_id, file.stored_name));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('Failed to delete file:', err);
  }
}

// Delete from DB
uiDb.prepare('DELETE FROM session_files WHERE id = ?').run(fileId);

res.status(204).end();
```

### 4.6. API client methods

**File:** `src/lib/api.ts`

```ts
interface GlobalFile {
  id: number;
  sessionId: string;
  sessionTitle: string | null;
  filename: string;
  mimeType: string | null;
  size: number;
  uploadedAt: number;
  expiresAt: number | null;
  extendedCount: number;
  source: 'user' | 'agent';
}

interface FileStats {
  totalFiles: number;
  totalSize: number;
  expiringSoon: number;
}

async getGlobalFiles(params?: {
  sort?: 'name' | 'date' | 'size' | 'expires';
  order?: 'asc' | 'desc';
  filter?: 'all' | 'expiring' | 'images' | 'code' | 'documents';
  search?: string;
}): Promise<{ files: GlobalFile[]; stats: FileStats }>

async extendFile(fileId: number): Promise<{ success: boolean; expiresAt: number }>

async deleteGlobalFile(fileId: number): Promise<void>
```

---

## 5. Frontend implementation

### 5.1. FileManagerApp — Main component

**Props:** `ApplicationComponentProps { sessionId: string | null; config: Record<string, unknown> }`

**State:**
- `files: GlobalFile[]` — list of all files
- `stats: FileStats` — total files, total size, expiring soon
- `loading: boolean`
- `error: string | null`
- `sort: 'name' | 'date' | 'size' | 'expires'` (default: `'date'`)
- `order: 'asc' | 'desc'` (default: `'desc'`)
- `filter: 'all' | 'expiring' | 'images' | 'code' | 'documents'` (default: `'all'`)
- `search: string` (default: `''`)

**Behavior:**
1. On mount, fetch files via `api.getGlobalFiles({ sort, order, filter, search })`
2. Render layout:
   ```
   ┌─────────────────────────────────────────┐
   │  FileStatsBar (top)                     │
   ├─────────────────────────────────────────┤
   │  [Sort: ▼] [Filter: ▼] [Search: ___]   │
   ├─────────────────────────────────────────┤
   │  FileList (scrollable table)            │
   │  - FileRow                              │
   │  - FileRow                              │
   │  - ...                                  │
   └─────────────────────────────────────────┘
   ```
3. Handle edge cases:
   - `files.length === 0` → "No files yet"
   - `loading` → skeleton rows
   - `error` → error message with retry

### 5.2. FileStatsBar — Top bar

**Props:** `{ stats: FileStats }`

**Render:**
```tsx
<div className="flex items-center gap-4 px-4 py-3 bg-bg-secondary border-b border-border-default">
  <span className="text-sm text-fg-secondary">
    <FolderOpen className="w-4 h-4 inline mr-1" />
    {stats.totalFiles} files
  </span>
  <span className="text-sm text-fg-secondary">
    💾 {formatFileSize(stats.totalSize)}
  </span>
  {stats.expiringSoon > 0 && (
    <span className="text-sm text-orange-600 dark:text-orange-400">
      ⚠️ {stats.expiringSoon} expiring soon
    </span>
  )}
</div>
```

### 5.3. FileList — Sortable table

**Props:** `{ files: GlobalFile[]; sort; order; filter; search; onSortChange; onFilterChange; onSearchChange }`

**Render:**
```tsx
<div className="flex-1 overflow-y-auto">
  {/* Controls bar */}
  <div className="sticky top-0 flex items-center gap-2 px-4 py-2 bg-bg-primary border-b border-border-default">
    <select value={sort} onChange={e => onSortChange(e.target.value)}>
      <option value="date">Date</option>
      <option value="name">Name</option>
      <option value="size">Size</option>
      <option value="expires">Expiration</option>
    </select>
    <button onClick={() => onOrderChange(order === 'asc' ? 'desc' : 'asc')}>
      {order === 'asc' ? <ArrowUp /> : <ArrowDown />}
    </button>
    <select value={filter} onChange={e => onFilterChange(e.target.value)}>
      <option value="all">All files</option>
      <option value="expiring">Expiring soon</option>
      <option value="images">Images</option>
      <option value="code">Code</option>
      <option value="documents">Documents</option>
    </select>
    <input
      type="text"
      placeholder="Search..."
      value={search}
      onChange={e => onSearchChange(e.target.value)}
      className="flex-1 px-2 py-1 text-sm border border-border-default rounded"
    />
  </div>

  {/* File rows */}
  <div className="divide-y divide-border-default">
    {files.map(file => (
      <FileRow key={file.id} file={file} />
    ))}
  </div>
</div>
```

### 5.4. FileRow — Single file row

**Props:** `{ file: GlobalFile }`

**Render:**
```tsx
<div className="flex items-center gap-3 px-4 py-3 hover:bg-bg-secondary transition-colors">
  {/* Icon */}
  <div className="flex-shrink-0">
    {getFileIcon(file.mimeType)}
  </div>

  {/* Filename + session */}
  <div className="flex-1 min-w-0">
    <div className="text-sm font-medium text-fg-primary truncate">
      {file.filename}
    </div>
    <div className="text-xs text-fg-muted truncate">
      {file.sessionTitle || 'Unknown session'}
    </div>
  </div>

  {/* Size */}
  <div className="flex-shrink-0 text-sm text-fg-secondary">
    {formatFileSize(file.size)}
  </div>

  {/* Expiration */}
  <div className="flex-shrink-0 text-sm">
    {file.expiresAt ? (
      <ExpirationBadge expiresAt={file.expiresAt} />
    ) : (
      <span className="text-fg-muted">∞</span>
    )}
  </div>

  {/* Actions */}
  <div className="flex items-center gap-2">
    <ExtendButton fileId={file.id} onExtend={() => handleExtend(file.id)} />
    <button
      onClick={() => handleDelete(file)}
      className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
</div>
```

**Click handler (navigate to session + open File Preview):**
```ts
function handleClick() {
  // Navigate to session
  navigate(`/chat/${file.sessionId}`);

  // Open File Preview app
  filePreviewStore.setOpenFile(file.id);
  applicationsStore.selectApplication('file_preview');
}
```

### 5.5. ExpirationBadge — Color-coded expiration

**Props:** `{ expiresAt: number }`

**Logic:**
```ts
const now = Date.now();
const daysLeft = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));

if (daysLeft < 0) return { color: 'red', text: 'Expired' };
if (daysLeft === 0) return { color: 'red', text: 'Today' };
if (daysLeft <= 7) return { color: 'orange', text: `${daysLeft} days left` };
if (daysLeft <= 14) return { color: 'yellow', text: `${daysLeft} days left` };
return { color: 'green', text: `${daysLeft} days left` };
```

**Render:**
```tsx
<span className={`px-2 py-0.5 rounded text-xs ${colorClasses[color]}`}>
  {text}
</span>
```

### 5.6. ExtendButton — Extend file lifetime

**Props:** `{ fileId: number; onExtend: () => void }`

**Behavior:**
1. On click, call `api.extendFile(fileId)`
2. Show loading spinner while extending
3. On success, call `onExtend()` to refresh file list
4. Show toast: "File extended by 30 days"

**Render:**
```tsx
<button
  onClick={handleExtend}
  disabled={extending}
  className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded disabled:opacity-50"
  title="Extend by 30 days"
>
  {extending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
</button>
```

### 5.7. DeleteConfirmModal — Confirmation dialog

**Props:** `{ file: GlobalFile | null; onConfirm: () => void; onCancel: () => void }`

**Render:**
```tsx
<Modal isOpen={file !== null} onClose={onCancel} title="Delete file?">
  <div className="p-4">
    <p className="text-sm text-fg-secondary mb-2">
      Are you sure you want to delete <strong>{file?.filename}</strong>?
    </p>
    <p className="text-xs text-fg-muted mb-4">
      This action cannot be undone.
    </p>
    <div className="flex gap-2 justify-end">
      <button onClick={onCancel} className="px-4 py-2 text-sm bg-bg-secondary rounded">
        Cancel
      </button>
      <button
        onClick={onConfirm}
        className="px-4 py-2 text-sm bg-red-600 text-white rounded"
      >
        Delete
      </button>
    </div>
  </div>
</Modal>
```

---

## 6. UI/UX details

### 6.1. Layout within Applications pane

```
┌─────────────────────────────────────────────────────────────┐
│  📊 42 files · 1.2 MB · 5 expiring soon                    │  ← FileStatsBar
├─────────────────────────────────────────────────────────────┤
│  [Sort: ▼ Date] [Filter: All ▼] [Search: ___________]      │  ← Controls
├─────────────────────────────────────────────────────────────┤
│  📄 script.py          12 KB   5 days left   [⏰] [🗑]      │  ← FileRow
│  📄 data.csv           45 KB   12 days left  [⏰] [🗑]      │
│  🖼 screenshot.png     234 KB  2 days left   [⏰] [🗑]      │
│  📄 notes.md           8 KB    ∞             [⏰] [🗑]      │
└─────────────────────────────────────────────────────────────┘
```

### 6.2. Empty states

- **No files:** "No files yet. Upload files in a chat session to see them here."
- **No files match filter:** "No files match your filter."
- **Search empty:** "No files found for '{search}'."

### 6.3. Loading states

- **Fetching files:** Skeleton rows (5 rows)
- **Extending file:** Spinner on ExtendButton
- **Deleting file:** Spinner on Delete button

### 6.4. Error states

- **Failed to load:** "Failed to load files" + retry button
- **Failed to extend:** Toast error "Failed to extend file"
- **Failed to delete:** Toast error "Failed to delete file"

### 6.5. Color coding for expiration

- 🟢 **Green** (> 14 days): "15 days left"
- 🟡 **Yellow** (7-14 days): "10 days left"
- 🟠 **Orange** (1-7 days): "5 days left"
- 🔴 **Red** (< 1 day): "12 hours left" or "Expired"
- ⚪ **Gray** (∞): "Never expires"

---

## 7. i18n keys

Add to `src/i18n/locales/{en,ru,es,de}/translation.json`:

```json
{
  "fileManager": {
    "title": "File Manager",
    "stats": {
      "files": "{{count}} file",
      "files_plural": "{{count}} files",
      "size": "{{size}}",
      "expiringSoon": "{{count}} expiring soon"
    },
    "sort": {
      "label": "Sort",
      "name": "Name",
      "date": "Date",
      "size": "Size",
      "expires": "Expiration"
    },
    "filter": {
      "label": "Filter",
      "all": "All files",
      "expiring": "Expiring soon",
      "images": "Images",
      "code": "Code",
      "documents": "Documents"
    },
    "search": "Search files...",
    "extend": "Extend by 30 days",
    "delete": "Delete file",
    "deleteConfirm": {
      "title": "Delete file?",
      "message": "Are you sure you want to delete <strong>{{filename}}</strong>?",
      "warning": "This action cannot be undone."
    },
    "empty": {
      "noFiles": "No files yet",
      "noFilesDesc": "Upload files in a chat session to see them here.",
      "noMatch": "No files match your filter",
      "noSearch": "No files found for '{{query}}'"
    },
    "expiration": {
      "expired": "Expired",
      "today": "Today",
      "daysLeft": "{{count}} day left",
      "daysLeft_plural": "{{count}} days left",
      "hoursLeft": "{{count}} hour left",
      "hoursLeft_plural": "{{count}} hours left",
      "never": "Never expires"
    },
    "toast": {
      "extended": "File extended by 30 days",
      "deleted": "File deleted",
      "extendFailed": "Failed to extend file",
      "deleteFailed": "Failed to delete file"
    }
  }
}
```

---

## 8. Database seed

**File:** `db/seed.js`

Add to `seedStarterApplications()`:

```js
const fileManagerExists = uiDb.prepare("SELECT id FROM applications WHERE key = 'file_manager'").get();
if (!fileManagerExists) {
  uiDb.prepare(`
    INSERT INTO applications (key, name, icon, description, enabled, sort_order, desktop_only, config)
    VALUES ('file_manager', 'File Manager', 'FolderOpen', 'Manage all session files', 1, 1, 1, '{}')
  `).run();
}
```

---

## 9. Settings integration

The File Manager application will automatically appear in the Settings → Applications page (`/applications`) because it's registered in the `applications` table.

Users can:
- Enable/disable File Manager (toggle)
- Reorder applications (move up/down)

No additional Settings UI is needed — the existing Applications management page handles it.

---

## 10. Acceptance criteria

1. `session_files` table has `expires_at` and `extended_count` columns
2. `FILE_RETENTION_DAYS` config is read from `.env` (default 30)
3. New files get `expires_at = uploaded_at + FILE_RETENTION_DAYS`
4. Expired files are deleted on server startup
5. `GET /api/files` returns all files with session title, stats
6. `PATCH /api/files/:id/extend` extends expiration by `FILE_RETENTION_DAYS`
7. `DELETE /api/files/:id` deletes file from disk + DB
8. File Manager is registered in `registry.ts` as `file_manager`
9. File Manager renders in Applications pane (desktop only)
10. FileStatsBar shows total files, total size, expiring soon count
11. FileList is sortable (name, date, size, expiration)
12. FileList is filterable (all, expiring, images, code, documents)
13. FileList is searchable (by filename)
14. FileRow shows icon, filename, session title, size, expiration badge, actions
15. Expiration badge is color-coded (green/yellow/orange/red/gray)
16. ExtendButton extends file lifetime (+30 days)
17. Delete button opens confirmation modal
18. Click file → navigate to session + open File Preview
19. Empty states are handled (no files, no match, no search results)
20. Loading states are shown (skeleton rows, spinners)
21. Error states are handled (toast errors)
22. All text is localized (4 languages)
23. File Manager appears in Settings → Applications (toggle, reorder)
24. Desktop-only: hidden on mobile (< 1024 px)

---

## 11. Out of scope (future enhancements)

- Mobile support (separate page `/files`)
- Bulk delete (checkboxes + bulk actions)
- Pin/unpin files (UI for `expires_at = NULL`)
- File preview within File Manager (inline preview, not navigate to session)
- File download from File Manager
- File upload from File Manager
- File rename
- File move between sessions
- File tags / categories
- Disk usage chart / visualization
- Export file list (CSV, JSON)
- Advanced search (by content, by session, by date range)

---

## 12. Implementation order

1. **Backend:** Migration (add `expires_at`, `extended_count` to `session_files`)
2. **Backend:** Config (`FILE_RETENTION_DAYS` in `.env` + `config.js`)
3. **Backend:** Auto-set `expires_at` on file upload
4. **Backend:** Startup cleanup (delete expired files)
5. **Backend:** `GET /api/files` endpoint
6. **Backend:** `PATCH /api/files/:id/extend` endpoint
7. **Backend:** `DELETE /api/files/:id` endpoint
8. **Frontend:** API client methods (`getGlobalFiles`, `extendFile`, `deleteGlobalFile`)
9. **Frontend:** `FileManagerApp` skeleton (state, fetch, layout)
10. **Frontend:** `FileStatsBar`
11. **Frontend:** `FileList` (controls: sort, filter, search)
12. **Frontend:** `FileRow` (icon, filename, session, size, expiration, actions)
13. **Frontend:** `ExpirationBadge` (color-coded)
14. **Frontend:** `ExtendButton` (with optimistic update)
15. **Frontend:** `DeleteConfirmModal`
16. **Frontend:** Integration with File Preview (click → navigate + open preview)
17. **Frontend:** Registry update (`file_manager: FileManagerApp`)
18. **Backend:** Seed `file_manager` application
19. **i18n:** Add translation keys (4 languages)
20. **Testing:** Manual verification (all features, empty states, errors)

---

## 13. References

- **Task #36 brief:** `docs/brief-applications-architecture.md`
- **Task #37 brief:** `docs/brief-task-37-file-preview.md`
- **Layout design:** `docs/sessions-page-split.md`
- **Existing file handling:** `routes/files.js`, `src/lib/api.ts`
- **Application contract:** `src/applications/types.ts`
- **Registry pattern:** `src/applications/registry.ts`
- **File Preview integration:** `src/store/filePreviewStore.ts`
