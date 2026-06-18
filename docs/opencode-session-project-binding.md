# OpenCode — Session → Project Binding

> Analysis of how OpenCode stores and resolves the binding between a chat session and a
> project, why 1230-UI executor sessions land in the `global` project (shown as `\` / `/`)
> instead of the 1230-ui repository project (shown as `workspace`), and how to fix it.
>
> **Status:** analysis only. No code or database was modified to produce this document.
> **OpenCode version:** 1.15.4. **Host:** BIG (185.145.126.91). **Date:** 2026-06-17.

---

## TL;DR

- A session's project is **not** configured explicitly. It is derived from the session's
  **working directory** (`session.directory`) by walking up to the nearest `.git`.
- Any directory **without** a `.git` ancestor resolves to the special **`global`** project
  (worktree `/`) — this is what the UI shows as **`\`**.
- Any directory inside `/opt/1230-ui` resolves to the git project **`d4d74b28…91d9f1`** —
  this is what the UI shows as **`workspace`**. The project id is the repository's **root
  commit SHA**, persisted in the marker file `/opt/1230-ui/.git/opencode`.
- 1230-UI talks to the `opencode-1230ui` daemon (`:4097`). That **running** process was
  started **without** `--worktree` and its `cwd` is `/`, so every session it creates gets
  `directory = /` → `global`. The unit file already contains `--worktree /opt/1230-ui` but
  the daemon has **never been restarted** since the flag was added.
- The `projectID: '1230ui'` field that 1230-UI sends in `POST /session` is **not honoured**
  for project routing; the project is always re-derived from the directory. The `1230ui`
  project row exists but holds **0 sessions**.
- `/opt/1230-ui` and `/opt/1230-ui/workspace` map to the **same** project `d4d74`. The
  difference is only the recorded `directory` (the working subfolder), not the project.

---

## 1. Where the binding is stored

Both OpenCode daemons run as `root` with `HOME=/root`, so they **share a single database**:

```
/root/.local/share/opencode/opencode.db        (SQLite, ~248 MB)
```

Relevant tables:

| Table | Role |
|---|---|
| `session` | One row per chat. Carries `project_id` (FK → `project.id`) **and** `directory` (the working dir). |
| `project` | One row per git repo / fallback. Fields: `id`, `worktree`, `vcs`, `name` (empty for all here). |
| `workspace` | Experimental multi-workspace feature. **Empty** here; `experimentalWorkspaces` is disabled. |

The binding is the foreign key **`session.project_id` → `project.id`**, and the value is
decided once, at session-creation time, from `session.directory`.

Current projects in the DB:

| `id` | `worktree` | `vcs` | Meaning | Sessions |
|---|---|---|---|---|
| `global` | `/` | — | fallback project (the UI **`\`**) | 336 |
| `d4d74b2826de4939768da101e087aec73a91d9f1` | `/opt/1230-ui` | git | the 1230-ui repo project (the UI **`workspace`**) | 4 |
| `1230ui` | `/opt/1230-ui` | *(empty)* | vestigial; created from the client `projectID` field | 0 |

---

## 2. How `project_id` is resolved at creation

Reconstructed from the OpenCode binary (`/usr/local/bin/opencode`, v1.15.4), function
`Project.fromDirectory`:

```
Project.fromDirectory(directory):
  1. Walk up from `directory` looking for `.git`.
  2. If NO `.git` is found:
        return { id: "global", worktree: "/" }          # <-- the fallback
  3. If `.git` is found at <root>:
        a. read the marker file  <root>/.git/opencode
           - if present, its (trimmed) content IS the project id
           - if absent, compute project id = root commit SHA
             (git rev-list --max-parents=0 HEAD) and write it to .git/opencode
        b. worktree = git toplevel
```

Verified on disk:

```
$ cat /opt/1230-ui/.git/opencode
d4d74b2826de4939768da101e087aec73a91d9f1
$ git -C /opt/1230-ui rev-list --max-parents=0 HEAD
d4d74b2826de4939768da101e087aec73a91d9f1     # == marker content == project id

$ git -C / rev-parse --is-inside-work-tree
fatal: not a git repository ...                # so "/" always resolves to `global`
```

Consequences:

- `directory = /` → no `.git` → **`global`**.
- `directory = /opt/1230-ui` → `.git` found → **`d4d74…`**.
- `directory = /opt/1230-ui/workspace` → walks up to the same `.git` → **same `d4d74…`**.
  Only the recorded `directory` differs; the project is identical.

---

## 3. Where `session.directory` comes from

When `POST /session` does not specify a directory, the session inherits the **daemon's
working directory** (its instance/worktree directory). That directory is set by the
`--worktree` flag, or — if absent — by the process `cwd`.

There are **two** OpenCode daemons on this host:

| Service | Port | Command (`/proc/<pid>/cmdline`) | `cwd` (`/proc/<pid>/cwd`) | Sessions land in |
|---|---|---|---|---|
| `opencode.service` (`web`) | 4096 | `opencode web …` | `/root` | `/` → `global` |
| `opencode-1230ui.service` (`serve`) | 4097 | `opencode serve … --log-level INFO` **(no `--worktree`)** | **`/`** | `/` → `global` |

1230-UI connects to **`:4097`** (`config.js:26`, default `OPENCODE_URL=http://127.0.0.1:4097`;
no override in `.env` or `system_settings`).

---

## 4. Root cause: the `:4097` daemon is stale

The unit file `/etc/systemd/system/opencode-1230ui.service` contains the desired command:

```
ExecStart=/usr/local/bin/opencode serve --hostname 127.0.0.1 --port 4097 --log-level INFO --worktree /opt/1230-ui
```

But the **running** process was started **before** `--worktree /opt/1230-ui` was added and
has never been restarted:

```
process pid 1442495  started: Thu Jun 11 13:12:11 2026   (elapsed ~6 days)
unit file mtime      :      Jun 11 13:14:45 2026   (--worktree added ~2.5 min AFTER start)
running cmdline      : opencode serve --hostname 127.0.0.1 --port 4097 --log-level INFO   # no --worktree
running cwd          : /
```

So the live daemon's instance directory is `/`, every session it creates gets
`directory = /`, and `Project.fromDirectory("/")` returns `global`. Hence all current
1230-UI executor sessions (titles like `1230ui-…`) appear under **`\`**, not `workspace`.

---

## 5. The three sessions in question

| Session | Created in | `project_id` | `directory` | Why |
|---|---|---|---|---|
| `ses_14922df41ffeHBBS4oBShvCSBG` | opencode server | `d4d74…` | `/opt/1230-ui/workspace` | created 2026-06-11 when the daemon ran with instance dir `/opt/1230-ui`; `.git` found → project `d4d74` |
| `ses_12a532d62ffe10bzDQAJiYsIw5` | 1230-UI | `global` | `/` | created after the daemon fell back to cwd `/`; no `.git` → `global` |
| `ses_12ac9abb4ffe6fSTrd6aRYTVlI` | opencode server | `global` | `/` | same reason as above |

All recent sessions (including `@general subagent` ones up to 2026-06-17 16:03) are in
`global` with `directory = /`.

---

## 6. Why `projectID: '1230ui'` in `POST /session` does not help

`lib/opencode.js:150-157` sends `{ title, projectID: '1230ui' }` when creating a session:

```js
async createSession(title) {
  return this._fetch('POST', '/session', {
    body: { title: title ?? undefined, projectID: this.projectId },  // projectId === '1230ui'
  });
}
```

OpenCode does **not** use this field to route the session into a project. The project is
always re-derived from the directory (`Project.fromDirectory`). The `1230ui` project row
(same `worktree=/opt/1230-ui`, but `vcs` empty and **0 sessions**) is a side effect of that
field being accepted/stored as project metadata without affecting directory-based routing.

---

## 7. `/opt/1230-ui` vs `/opt/1230-ui/workspace`

These are **not** different projects. They both resolve to project `d4d74` because
`.git` lives at `/opt/1230-ui/.git`. The only difference is the value recorded in
`session.directory` (the working subfolder). The UI label `workspace` is derived from the
directory path (basename of `/opt/1230-ui/workspace`); it is not a separate project or
workspace entity (`experimentalWorkspaces` is off, the `workspace` table is empty, and no
session has a `workspace_id`).

To land in project `d4d74`, the session only needs `directory` to be **anywhere under
`/opt/1230-ui`**. The worktree root `/opt/1230-ui` is the natural value because that is
what `--worktree /opt/1230-ui` produces.

---

## 8. Recommendations

These are **proposed actions** — none have been applied (analysis-only scope).

### R1. Restart `opencode-1230ui` so `--worktree /opt/1230-ui` takes effect (primary fix)

```bash
systemctl restart opencode-1230ui
```

After restart the daemon's instance directory becomes `/opt/1230-ui`, so new 1230-UI
sessions will get `directory = /opt/1230-ui` and resolve to project `d4d74` (`workspace`).

Verify the running command and cwd:

```bash
pid=$(systemctl show -p MainPID --value opencode-1230ui)
tr '\0' ' ' < /proc/$pid/cmdline        # must include --worktree /opt/1230-ui
readlink /proc/$pid/cwd                 # should be / (cwd) — fine, --worktree overrides instance dir
```

Then create one test session through 1230-UI and confirm via the API:

```bash
curl -s http://127.0.0.1:4097/session | jq '.[0] | {id, projectID, directory}'
# expect projectID == "d4d74b28…" and directory == "/opt/1230-ui"
```

> The daemon's own startup log already demonstrated this works when the flag is active:
> `creating instance { directory: "/opt/1230-ui" }` (2026-06-11, when the flag was present).

### R2. Pin the working directory in the unit (belt-and-suspenders)

Add `WorkingDirectory=/opt/1230-ui` to `[Service]` in
`/etc/systemd/system/opencode-1230ui.service` so the process `cwd` is correct even if the
`--worktree` flag semantics change between OpenCode versions. Then `systemctl daemon-reload
&& systemctl restart opencode-1230ui`.

### R3. Decide what to do with the `projectID: '1230ui'` field

It is currently a no-op for routing. Options:

- **Leave it** — harmless; OpenCode ignores it for project derivation.
- **Remove it** from `lib/opencode.js` (`createSession`) and the `OpenCodeClient` ctor to
  avoid confusion and the stray `1230ui` project row.

Either way, the stray `1230ui` project (0 sessions) can be ignored or cleaned up later.

### R4. Consolidate stranded history (optional, tracked as TODO A3)

336 sessions, including earlier 1230-UI ones (`1230ui-…` titles), are stuck in `global`
from the period the daemon ran from `/`. If historical continuity matters, a one-time
migration script can reassign them:

```sql
-- DRAFT — review before running. Moves sessions whose directory is under /opt/1230-ui
-- from the global project into the 1230-ui repo project.
-- UPDATE session
--   SET project_id = 'd4d74b2826de4939768da101e087aec73a91d9f1'
--   WHERE project_id = 'global' AND directory LIKE '/opt/1230-ui%';
```

Note: OpenCode itself performs this kind of reassignment automatically
(`UPDATE session SET project_id = <resolved> WHERE project_id = 'global' AND directory =
<worktree>`) whenever it re-discovers a project, so simply using the daemon with the
correct worktree may migrate matching rows on its own. Verify behaviour before running any
manual SQL, and **back up `opencode.db` first**.

### R5. Keep both daemons' intent explicit

Because both daemons share one database, sessions created from the user's own `opencode web`
(`:4096`, cwd `/root`) will continue to land in `global`. That is expected for ad-hoc work
outside the repo. If you want the `:4096` UI to also default to the 1230-ui project, start
it with `--worktree /opt/1230-ui` (or `WorkingDirectory=/opt/1230-ui`) as well — but only if
that matches the intended usage of that UI.

---

## 9. Quick reference — the binding in one line

```
session.directory  --(walk up to .git)-->  project.id
        |                                        |
        |  no .git  ------>  project.id = "global"   (worktree "/", UI label "\")
        |  .git found -->  project.id = <root commit SHA>
        |                                  read from <root>/.git/opencode
```
