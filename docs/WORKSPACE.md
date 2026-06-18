# Workspace

The Workspace is the primary surface on `/sessions` (v0.9.3+). It is a single shell that owns a 3-tab header and mounts both executor chats simultaneously so the user can switch between Sessions, Hermes, and OpenCode without losing an in-flight turn.

For the per-session stream store that makes the dual mount safe (navigation never aborts a running turn), see the **Per-session streaming store** subsection in [ARCHITECTURE.md](ARCHITECTURE.md) and `src/store/chatInputStore.ts`.

## Routes

| Route | Component | Behaviour |
|---|---|---|
| `/sessions` | `Workspace` (`src/components/Workspace.tsx`) | Renders the shell. The active tab (Sessions / Hermes / OpenCode) is driven by `workspaceStore.activeTab`. |
| `/chat/:id` | `ChatRouteResolver` (`src/components/ChatRouteResolver.tsx`) | Resolves the session's executor, claims it as the active session for that executor, switches to the matching tab, then `navigate('/sessions', { replace: true })`. The Workspace is the only thing the user ever sees. |

Deep links (`/chat/:id`) therefore resolve the executor server-side (`GET /api/sessions/:id` returns `executor`), claim the active session, and redirect into the Workspace on the correct tab. The resolver shows a spinner while resolving and a "session not found" screen if the id is unknown.

## The 3-tab header

```
┌─────────────────────────────────────────────────────────────────────┐
│ Workspace header                                                    │
│  ● Sessions    🟢 Hermes    🟢 OpenCode        [ass’t] [model] [📎][◫][🗑] │
│   ▲ tab header (left)                       ▲ WorkspaceSessionControls (right) │
├─────────────────────────────────────────────────────────────────────┤
│  [pill] [pill] [pill]  …        ← ExecutorToolbar (executors only)  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   <ChatPage sessionId=… isActive=…/>   (one per executor, dual mount)│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

- **Left of each executor tab** — an `ExecutorStatusDot` (green/red/grey, or a spinner while the status poll resolves). The Sessions tab has no dot. The global Navbar no longer carries Hermes/OpenCode status indicators.
- **Right of the header** — `WorkspaceSessionControls`, shown only when an executor tab is active **and** that executor has an active session.

## Dual-mount of `ChatPage`

Every executor tab renders its own `<ChatPage>` instance; all of them stay mounted for the lifetime of the Workspace, toggled with `hidden` (not unmounted):

```tsx
<ChatPage sessionId={activeSessionByExecutor[executor]} isActive={activeTab === executor} />
```

This is deliberate: a turn streaming on OpenCode must keep updating its bubble while the user is reading the Hermes tab. Two safety mechanisms prevent the two mounted chats from stepping on each other:

1. **`isActive` gating of send/stop.** `ChatPage` registers its `chat:send` / `chat:stop` window listeners exactly once on mount, but every handler is guarded by an `isActiveRef` that tracks the `isActive` prop. Only the chat whose tab is currently active will act on a send or stop. The inactive chat keeps rendering but ignores input.
2. **The active-session claim.** Each executor has at most one active session id in `activeSessionByExecutor`. The `WorkspaceSessionControls`, the nav metadata (`chatInputStore.navSessionMeta`), and the session actions (`chatInputStore.sessionActions`) all follow whichever chat is active, so the header always reflects the visible chat.

## `workspaceStore`

`src/store/workspaceStore.ts` — a Zustand store, persisted to `localStorage`.

```ts
type WorkspaceTab = 'sessions' | 'hermes' | 'opencode-1230';

interface WorkspaceState {
  activeTab: WorkspaceTab;                                     // '1230-workspace-active-tab'
  activeSessionByExecutor: Record<ExecutorSlug, string|null>;  // '1230-workspace-session-<executor>'
  setActiveTab(tab): void;
  setActiveSession(executor, sessionId): void;
  clearActiveSession(executor): void;
}
```

`WORKSPACE_EXECUTORS = ['hermes', 'opencode-1230']` is the single source of truth for which tabs exist; the header and the dual mount both `.map()` over it.

## `ExecutorToolbar`

`src/components/ExecutorToolbar.tsx` — sits directly under the header on each executor tab.

- Fetches the 3 most recent sessions for the executor (`api.getSessions(3, 0, false, 'lastMessage', executor)`) and renders them as **recent-session pills**. The pill matching the current active session is highlighted; clicking any pill calls `setActiveSession(executor, id)`.
- The trailing **`…` button** is a filter link: it sets the active tab back to `sessions` and navigates to `/sessions?executor=<executor>` so the Sessions list opens pre-filtered to that executor.

## `ExecutorStatusDot`

`src/components/ExecutorStatusDot.tsx` — the small dot inside each executor tab. Reads the Hermes status store (`useHermesStatusStore`) or the OpenCode status store (`useOpenCodeStatusStore`) depending on its `executor` prop, and renders green (`connected`), red (`disconnected`), or grey (`unknown`), with a spinner while the first poll is in flight.

## `WorkspaceSessionControls`

`src/components/WorkspaceSessionControls.tsx` — the cluster of session controls that used to live in the global Navbar, now in the Workspace header (right side). It reads entirely from `chatInputStore` and is rendered only for the active executor tab:

- assistant-name badge + model badge,
- the session-files popover (`NavSessionFilesBar`),
- the Applications-pane toggle (desktop only),
- delete with a two-step confirm.

## `/chat/:id` deep-link resolution

```
/chat/:id
   │
   ▼
ChatRouteResolver
   │  api.getSession(id)  →  { executor, … }
   │
   ├─ setActiveSession(executor, id)
   ├─ setActiveTab(executor)
   └─ navigate('/sessions', { replace: true })
                 │
                 ▼
              Workspace opens on the matching executor tab with the session claimed
```

The executor is derived server-side from the session's assistant (`free-chat` sessions resolve to `hermes`). The resolver never renders a chat itself — it only translates a session id into a Workspace tab + active-session claim and hands control to the Workspace.
