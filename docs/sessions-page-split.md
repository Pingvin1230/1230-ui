# Sessions Page — Split Layout Design

## Overview

The Sessions page is split vertically into two panes on desktop:

- **Left pane** — Chat with the agent (always visible, cannot be closed or hidden).
- **Right pane** — Applications area (selector at the top + app content below).

On mobile, only the chat pane is shown; the applications area is hidden.

The **ChatInput** and **MobileNav** stay at their current positions and span the full width of the screen — this keeps the existing Layout architecture intact.

---

## Desktop — Bottombar mode (primary)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ≡  1230UI  │  Sessions  │  📋 Archived   ☑ Select  │ 🔍 🟢  🟢 U │  ← Header (50px)
├──────────────────────────────────┬──────────────────────────────────┤
│                                  │  [▾ Application Name         ]   │  ← App selector
│                                  ├──────────────────────────────────┤
│                                  │                                  │
│    💬  Chat Messages             │                                  │
│                                  │                                  │
│    Agent: Here is the result...  │                                  │
│    ┌─ tool_call ───────────┐     │                                  │
│    │  read_file: main.py   │     │        Application Area          │
│    └───────────────────────┘     │        (scrollable content       │
│    Agent: I've updated the file. │         of the selected app)     │
│                                  │                                  │
│    You: Now add tests please     │                                  │
│                                  │                                  │
│                                  │                                  │
│         ≈ 55% width              │            ≈ 45% width           │
├──────────────────────────────────┴──────────────────────────────────┤
│  📎  Type a message...                                          [➤] │  ← ChatInput (full width)
├─────────────────────────────────────────────────────────────────────┤
│        🏠 Home         💬 Sessions         ➕ New                    │  ← MobileNav (50px)
└─────────────────────────────────────────────────────────────────────┘
```

---

## Desktop — Sidebar mode (alternative)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ≡  1230UI  │  Sessions  │  📋 Archived   ☑ Select  │ 🔍 🟢  🟢 U │
├────────┬─────────────────────────┬──────────────────────────────────┤
│  🏠    │                         │  [▾ Application Name         ]   │
│  Home  │                         ├──────────────────────────────────┤
│        │  💬  Chat Messages      │                                  │
│  💬    │                         │                                  │
│  Sess. │  Agent: Here is the...  │                                  │
│        │  ┌─ tool_call ────┐     │                                  │
│  ➕    │  │ read_file: m.py │     │        Application Area          │
│  New   │  └─────────────────┘     │                                  │
│        │  Agent: Updated.        │                                  │
│  ⚙️    │                         │                                  │
│  Set.  │  You: Add tests please  │                                  │
│        │                         │                                  │
│  🌙/☀️ │                         │                                  │
├────────┴─────────────────────────┴──────────────────────────────────┤
│  📎  Type a message...                                          [➤] │  ← ChatInput (full width)
└─────────────────────────────────────────────────────────────────────┘
  ↑ Sidebar (288px)   ↑ Chat ≈ 55%         ↑ Apps ≈ 45%
```

---

## Mobile (< 1024 px)

```
┌───────────────────────────────────────┐
│  ≡  1230UI  │  Title ✏️  │ 🔍 🟢  🟢 U │  ← Header (50px)
├───────────────────────────────────────┤
│                                       │
│    💬  Chat Messages                  │
│                                       │
│    Agent: Here is the result...       │
│    ┌─ tool_call ────────────────┐     │
│    │  read_file: main.py        │     │
│    └────────────────────────────┘     │
│    Agent: I've updated the file.      │
│                                       │
│    You: Now add tests please          │
│                                       │
│           100% width (apps hidden)    │
├───────────────────────────────────────┤
│  📎  Type a message...           [➤]  │  ← ChatInput (fixed)
├───────────────────────────────────────┤
│      🏠 Home    💬 Sessions    ➕ New  │  ← MobileNav (50px, fixed)
└───────────────────────────────────────┘
```

---

## Feature matrix

| Element              | Desktop (bottombar)                | Desktop (sidebar)                  | Mobile                       |
|----------------------|------------------------------------|------------------------------------|------------------------------|
| **Header**           | full width                         | full width                         | full width                   |
| **Chat messages**    | ≈ 55 %                             | ≈ 55 % (after sidebar)             | 100 %                        |
| **Applications**     | ≈ 45 %, right of chat              | ≈ 45 %, right of chat              | hidden                       |
| **App selector**     | top of right pane (dropdown/icons) | top of right pane (dropdown/icons) | —                            |
| **ChatInput**        | full width, in flow at the bottom  | full width, in flow at the bottom  | fixed above MobileNav        |
| **MobileNav**        | fixed bottom, 50 px                | —                                  | fixed bottom, 50 px          |
| **Sidebar**          | —                                  | 288 px, left side                  | overlay (hamburger toggle)   |

---

## Key constraints

1. **Chat pane cannot be closed or hidden** — it is the primary surface.
2. **ChatInput stays full-width** — no structural change to Layout.tsx; the split happens only inside `<main>`.
3. **MobileNav is available on desktop too** when the user chose the bottombar nav style in Settings.
4. **Applications area is desktop-only** for now; mobile may get a toggle/tab in a future iteration.
5. **The app selector is extensible** — starts with one application, but must support N applications from the start (dropdown or icon row).
