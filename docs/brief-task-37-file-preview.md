# Brief: Task #37 — File Preview Application

**Status:** Draft
**Author:** Product / UX
**Date:** 2026-06-10
**Dependencies:** Task #36 (Applications architecture) — ✅ Done
**Scope:** Implementation of the first application (File Preview) within the Applications area

---

## 1. Context

Task #36 introduced the Applications architecture on the Sessions page:
- Split layout (50/50 on desktop ≥ 1024 px)
- Applications pane with pill tabs for app selection
- Registry pattern (`src/applications/registry.ts`)
- `applications` table in DB with `file_preview` seeded

Currently, `file_preview` is registered to `PlaceholderApp`. Task #37 replaces it with a real implementation that:
1. Lists all files in the current session
2. Renders inline previews based on file type
3. Supports all file types already accepted by the upload system

---

## 2. Goals

1. Display a list of session files (user-uploaded + agent-created)
2. Render inline previews for each file type without requiring download
3. Reuse existing rendering libraries (MarkdownRenderer, highlight.js)
4. Handle all supported file types gracefully (preview or fallback)
5. Provide a smooth UX within the Applications pane (no layout breakage)

---

## 3. Architecture

### 3.1. Component structure

```
src/applications/file-preview/
├── FilePreviewApp.tsx          ← Main component (registered in registry)
├── FileList.tsx                ← Top bar: list of files (clickable)
├── FilePreview.tsx             ← Router: detects mimeType, delegates to viewer
├── viewers/
│   ├── ImageViewer.tsx         ← <img> for image/*
│   ├── MarkdownViewer.tsx      ← Reuses MarkdownRenderer
│   ├── CodeViewer.tsx          ← highlight.js + <pre>
│   ├── JSONViewer.tsx          ← highlight.js (language: json)
│   ├── TextViewer.tsx          ← <pre> monospace
│   ├── CSVViewer.tsx           ← Parse CSV → <table>
│   ├── HTMLViewer.tsx          ← Sandboxed <iframe>
│   ├── PDFViewer.tsx           ← <iframe> / <embed>
│   └── UnsupportedViewer.tsx   ← Fallback: icon + filename + download button
└── index.ts                    ← Export FilePreviewApp
```

### 3.2. Registry update

**File:** `src/applications/registry.ts`

```ts
import { FilePreviewApp } from './file-preview';

export const applicationRegistry: Record<string, ApplicationComponent> = {
  file_preview: FilePreviewApp,  // ← Replace PlaceholderApp
};
```

---

## 4. Backend changes

### 4.1. New endpoint: `GET /api/sessions/:id/files/:fileId/content`

**Purpose:** Serve file content inline (for preview), not as attachment.

**Difference from `/download`:**
- `/download` sets `Content-Disposition: attachment` (forces download)
- `/content` sets `Content-Disposition: inline` (browser renders if possible)
- Both set correct `Content-Type` from `mime_type` column

**Implementation:**
- Reuse the existing download logic in `routes/files.js`
- Change `res.download()` to `res.sendFile()` with appropriate headers
- Or: copy the download handler, remove the `Content-Disposition: attachment` header

**Response:**
- `200 OK` with file content as body
- `Content-Type: <mime_type>` (from DB)
- `Content-Length: <size>`
- `Content-Disposition: inline; filename="<filename>"`

**Security:**
- Same ownership check as `/download` (session must exist, file must belong to session)
- No additional auth needed (user already authenticated)

### 4.2. API client method

**File:** `src/lib/api.ts`

```ts
// Get file content URL for inline preview (images, PDF, etc.)
getFileContentUrl(sessionId: string, fileId: number): string {
  return `/api/sessions/${sessionId}/files/${fileId}/content`;
}

// Fetch file content as text (for code, markdown, JSON, etc.)
async getFileContent(sessionId: string, fileId: number): Promise<string> {
  const res = await fetch(this.getFileContentUrl(sessionId, fileId), {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch file content: ${res.status}`);
  return res.text();
}
```

---

## 5. Frontend implementation

### 5.1. FilePreviewApp — Main component

**Props:** `ApplicationComponentProps { sessionId: string | null; config: Record<string, unknown> }`

**State:**
- `files: SessionFile[]` — list of files for the session
- `selectedFileId: number | null` — currently selected file
- `loading: boolean` — fetching files
- `error: string | null` — error message

**Behavior:**
1. On mount (or when `sessionId` changes), fetch files via `api.listSessionFiles(sessionId)`
2. Auto-select the first file if none selected
3. Render layout:
   ```
   ┌──────────────────────────────────┐
   │  FileList (top bar, horizontal)  │
   ├──────────────────────────────────┤
   │                                  │
   │  FilePreview (content area)      │
   │                                  │
   └──────────────────────────────────┘
   ```
4. Handle edge cases:
   - `sessionId === null` → "Select a session to preview files"
   - `files.length === 0` → "No files in this session"
   - `loading` → spinner
   - `error` → error message with retry

### 5.2. FileList — Top bar

**Layout:** Horizontal scrollable list of file pills (like the app selector in ApplicationsPane)

**Each pill:**
- Icon (based on mimeType: image, code, text, pdf, etc.)
- Filename (truncated if too long)
- Size (formatted: KB, MB)
- Active state: highlighted if selected

**Behavior:**
- Click → select file, update `selectedFileId`
- Scroll horizontally if many files

**Styling:**
- Use existing pill/tab styles from ApplicationsPane
- `flex gap-2 overflow-x-auto px-3 py-2 bg-bg-secondary border-b border-border-default`

### 5.3. FilePreview — Router component

**Props:** `{ file: SessionFile; sessionId: string }`

**Logic:**
```ts
function getFileViewer(mimeType: string | null): ViewerComponent {
  if (!mimeType) return UnsupportedViewer;
  
  if (mimeType.startsWith('image/')) return ImageViewer;
  if (mimeType === 'text/markdown') return MarkdownViewer;
  if (mimeType === 'application/json') return JSONViewer;
  if (mimeType === 'text/csv') return CSVViewer;
  if (mimeType === 'text/html') return HTMLViewer;
  if (mimeType === 'application/pdf') return PDFViewer;
  
  // Code files (by extension)
  const ext = file.filename.split('.').pop()?.toLowerCase();
  if (['py', 'js', 'ts', 'jsx', 'tsx', 'sh', 'sql', 'xml', 'yml', 'yaml', 'css'].includes(ext)) {
    return CodeViewer;
  }
  
  // Plain text
  if (mimeType.startsWith('text/') || ext === 'txt' || ext === 'log') {
    return TextViewer;
  }
  
  return UnsupportedViewer;
}
```

**Rendering:**
```tsx
const Viewer = getFileViewer(file.mimeType);
return <Viewer file={file} sessionId={sessionId} />;
```

### 5.4. Viewers

#### ImageViewer
- **Props:** `{ file: SessionFile; sessionId: string }`
- **Render:** `<img src={api.getFileContentUrl(sessionId, file.id)} alt={file.filename} />`
- **Styling:** `max-w-full max-h-full object-contain` (fit within container, no zoom)
- **Loading:** skeleton placeholder while image loads
- **Error:** fallback to UnsupportedViewer

#### MarkdownViewer
- **Props:** `{ file: SessionFile; sessionId: string }`
- **Behavior:** Fetch content via `api.getFileContent(sessionId, file.id)`, render with `<MarkdownRenderer content={text} />`
- **Loading:** skeleton
- **Error:** show error message

#### CodeViewer
- **Props:** `{ file: SessionFile; sessionId: string }`
- **Behavior:** Fetch content, detect language from extension, render with highlight.js
- **Implementation:** Reuse the code block rendering logic from MarkdownRenderer (or copy the pattern)
- **Styling:** `<pre><code>` with highlight.js classes, monospace font, scrollable
- **Line numbers:** No (keep it simple)

#### JSONViewer
- **Props:** `{ file: SessionFile; sessionId: string }`
- **Behavior:** Fetch content, parse JSON, pretty-print with 2-space indent, render with highlight.js (language: json)
- **Error:** If JSON is invalid, show raw text with error message

#### TextViewer
- **Props:** `{ file: SessionFile; sessionId: string }`
- **Render:** `<pre>{content}</pre>` with monospace font
- **Styling:** `whitespace-pre-wrap break-words`

#### CSVViewer
- **Props:** `{ file: SessionFile; sessionId: string }`
- **Behavior:** Fetch content, parse with **papaparse** (`Papa.parse(content, { header: true })`), render as `<table>`
- **Render:** First row as `<thead>`, rest as `<tbody>`
- **Styling:** Bordered table, striped rows, scrollable if large
- **Library:** `papaparse` (+ `@types/papaparse`)

#### HTMLViewer
- **Props:** `{ file: SessionFile; sessionId: string }`
- **Render:** `<iframe src={api.getFileContentUrl(sessionId, file.id)} sandbox="allow-scripts" />`
- **Styling:** `w-full h-full border-0`
- **Security:** `sandbox="allow-scripts"` allows JS execution but isolates in iframe (no same-origin, no forms, no popups)

#### PDFViewer
- **Props:** `{ file: SessionFile; sessionId: string }`
- **Render:** `<iframe src={api.getFileContentUrl(sessionId, file.id)} />`
- **Styling:** `w-full h-full border-0`
- **Fallback:** If browser doesn't support PDF embedding, show message "Your browser does not support PDF preview" + download button
- **Detection:** Use `<object>` tag with fallback content, or check `navigator.mimeTypes`

#### UnsupportedViewer
- **Props:** `{ file: SessionFile; sessionId: string }`
- **Render:** Icon + filename + size + download button
- **Download link:** `href={/api/sessions/${sessionId}/files/${file.id}/download} download={file.filename}`
- **Styling:** Centered content, similar to AgentFileCard

---

## 6. File type support matrix

| MIME Type | Extensions | Viewer | Notes |
|-----------|------------|--------|-------|
| `image/png`, `image/jpeg`, `image/gif`, `image/webp` | png, jpg, jpeg, gif, webp | ImageViewer | Inline `<img>`, fit-to-container |
| `text/markdown` | md | MarkdownViewer | Reuse MarkdownRenderer |
| `text/x-python` | py | CodeViewer | highlight.js (language: python), no line numbers |
| `text/javascript` | js, jsx | CodeViewer | highlight.js (language: javascript) |
| `text/x-typescript`, `text/typescript` | ts, tsx | CodeViewer | highlight.js (language: typescript) |
| `text/x-shellscript` | sh | CodeViewer | highlight.js (language: bash) |
| `application/sql` | sql | CodeViewer | highlight.js (language: sql) |
| `text/xml`, `application/xml` | xml | CodeViewer | highlight.js (language: xml) |
| `text/yaml`, `application/x-yaml` | yml, yaml | CodeViewer | highlight.js (language: yaml) |
| `text/css` | css | CodeViewer | highlight.js (language: css) |
| `application/json` | json | JSONViewer | highlight.js (language: json) |
| `text/csv` | csv | CSVViewer | **papaparse** → `<table>` |
| `text/html` | html | HTMLViewer | iframe with `sandbox="allow-scripts"` |
| `application/pdf` | pdf | PDFViewer | iframe + fallback message with download |
| `text/plain` | txt, log | TextViewer | `<pre>` monospace |
| Other | — | UnsupportedViewer | Icon + download button |

---

## 7. UI/UX details

### 7.1. Layout within Applications pane

```
┌──────────────────────────────────┐
│  [📄 main.py] [📄 utils.js] ... │  ← FileList (top bar, horizontal scroll)
├──────────────────────────────────┤
│                                  │
│  Code preview area               │
│  (syntax highlighted)            │
│                                  │
│                                  │
└──────────────────────────────────┘
```

- FileList: `h-12` (48px), `overflow-x-auto`, `bg-bg-secondary`, `border-b`
- Preview area: `flex-1 min-h-0 overflow-y-auto` (scrollable if content is large)

### 7.2. Empty states

- **No session selected:** "Select a session to preview files" (centered, muted text)
- **No files in session:** "No files in this session" (centered, muted text, icon)
- **File not found (error):** "Failed to load file" + retry button

### 7.3. Loading states

- **Fetching files list:** Spinner in FileList area
- **Fetching file content:** Skeleton placeholder in preview area
- **Image loading:** Skeleton placeholder until `<img>` loads

### 7.4. Responsive behavior

- On mobile (< 1024 px), the Applications pane is hidden (handled by Layout.tsx)
- FileList should wrap or scroll horizontally on narrow screens
- Preview area should be scrollable vertically and horizontally (for wide code blocks)

---

## 8. i18n keys

Add to `src/i18n/locales/{en,ru,es,de}/translation.json`:

```json
{
  "filePreview": {
    "title": "File Preview",
    "noSession": "Select a session to preview files",
    "noFiles": "No files in this session",
    "loading": "Loading files...",
    "error": "Failed to load file",
    "retry": "Retry",
    "download": "Download",
    "unsupported": "Preview not available for this file type"
  }
}
```

---

## 9. Acceptance criteria

1. FilePreviewApp is registered in `registry.ts` and replaces PlaceholderApp
2. FileList displays all files in the session (user + agent)
3. Clicking a file in FileList shows its preview in the content area
4. Images render inline (no download required)
5. Markdown files render with MarkdownRenderer (formatted, not raw)
6. Code files render with syntax highlighting (highlight.js)
7. JSON files render formatted and highlighted
8. CSV files render as a table
9. HTML files render in a sandboxed iframe
10. PDF files render in an iframe/embed
11. Plain text files render in a monospace `<pre>`
12. Unsupported file types show a fallback with download button
13. Empty states are handled (no session, no files, error)
14. Loading states are shown (spinner, skeleton)
15. All text is localized (4 languages)
16. No layout breakage within the Applications pane
17. Works on desktop (≥ 1024 px); hidden on mobile (handled by Layout)

---

## 10. Out of scope (future enhancements)

- Bulk download (multiple files → zip)
- File search within the session
- File versioning (multiple versions of the same file)
- "Send file back to agent" button
- Global files view across sessions
- File annotations / comments
- Drag-and-drop reordering of files
- Image lightbox (zoom, pan)
- PDF text selection / search
- CSV export to Excel
- Code file line numbers / minimap

---

## 11. Design decisions (resolved)

| Question | Decision | Rationale |
|----------|----------|-----------|
| **CSV parsing** | papaparse | Handles escaping, newlines in values, different delimiters. +5 KB gzip |
| **HTML sandbox** | `allow-scripts` in iframe | Agent-generated dashboards need JS. Risk contained by iframe sandbox |
| **PDF fallback** | Message + Download button | Simple, works everywhere. pdf.js (~200 KB) deferred to future |
| **Image zoom** | fit-to-container | Simple, works on all devices. Lightbox deferred to future |
| **Code line numbers** | No line numbers | Simpler implementation, less visual noise. Deferred to future |

**New dependency:** `papaparse` (+ type `@types/papaparse`)

---

## 12. Implementation order

1. **Backend:** Add `/content` endpoint (copy download handler, change headers)
2. **Install:** `npm install papaparse @types/papaparse`
3. **Frontend:** Create FilePreviewApp skeleton (state, file list fetch, layout)
4. **Frontend:** Implement FileList (top bar with pills)
5. **Frontend:** Implement FilePreview router (mimeType detection)
6. **Frontend:** Implement viewers one by one:
   - ImageViewer (easiest, just `<img>`, fit-to-container)
   - TextViewer (simple `<pre>`)
   - MarkdownViewer (reuse MarkdownRenderer)
   - CodeViewer (highlight.js, no line numbers)
   - JSONViewer (highlight.js)
   - CSVViewer (papaparse + `<table>`)
   - HTMLViewer (iframe with `sandbox="allow-scripts"`)
   - PDFViewer (iframe + fallback message with download button)
   - UnsupportedViewer (fallback)
7. **Frontend:** Update registry.ts
8. **i18n:** Add translation keys (4 languages)
9. **Testing:** Manual verification (all file types, empty states, errors)

---

## 13. References

- **Task #36 brief:** `docs/brief-applications-architecture.md`
- **Layout design:** `docs/sessions-page-split.md`
- **Existing file handling:** `routes/files.js`, `src/lib/api.ts` (listSessionFiles, SessionFile type)
- **Existing rendering:** `src/components/MarkdownRenderer.tsx` (markdown + code highlighting)
- **Application contract:** `src/applications/types.ts` (ApplicationComponentProps)
- **Registry pattern:** `src/applications/registry.ts`
