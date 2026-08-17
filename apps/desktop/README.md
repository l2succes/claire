# Claire Desktop (Electron)

An Electron shell that hosts the Claire client's React Native Web build. One UI runs on iOS,
Android, the browser, and the desktop; this app supplies the native capabilities the browser
cannot.

It is intended to replace `desktop/macos` (the React Native macOS host) on macOS, Windows, and
Linux. `desktop/macos` stays in the repository, frozen, until the parity table below is green.

## How it loads the UI

There is no separate desktop UI bundle. The renderer is the Claire client's web build.

- **Development** — the window points at the Expo web dev server, so Fast Refresh works inside
  Electron. Set `CLAIRE_DEV_SERVER_URL`.
- **Packaged** — the `expo export -p web` output is served from a custom `claire-app://` scheme.

### Why a custom scheme instead of `file://`

This is load-bearing, not a style choice. The client persists its Supabase session through
AsyncStorage, which is `localStorage` on web. Under `file://` the page gets an *opaque origin*,
where `localStorage` is unreliable or throws — a signed-in user would be signed out on every
relaunch. Registering `claire-app://` as `standard` + `secure` gives the renderer a stable secure
origin, which also makes `fetch` to the Claire API and Supabase behave normally.

`claire-app://` is deliberately distinct from `claire://`, which is already the Expo app's
deep-link scheme (`apps/client/app.json`) and is reserved here for OAuth callbacks.

## Running it

```sh
# 1. Start the client's web dev server (from apps/client)
cd apps/client && bunx expo start --web --port 8081

# 2. Start Electron against it (from apps/desktop)
cd apps/desktop && bun run dev
```

`bun run dev` sets `CLAIRE_DEV_SERVER_URL=http://localhost:8081`. If Expo picked a different
port, pass it explicitly:

```sh
CLAIRE_DEV_SERVER_URL=http://localhost:8083 bun run dev
```

Packaged run, with no dev server:

```sh
bun run bundle:renderer   # expo export -p web -> apps/desktop/renderer
bun run start
```

Distributables:

```sh
bun run package           # -> apps/desktop/release
```

## Security model

The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
Its entire privileged surface is the `window.claireDesktop` object defined in `src/preload.ts`,
typed by `src/shared/ipc.ts`.

**Electron main is the new native module.** Credentials, and eventually the iMessage database and
attachment bytes, live in main and never reach the renderer — exactly as they never reach the
React Native layer in `desktop/macos` today. `src/preferences.ts` holds only non-sensitive UI
state (window bounds, pane widths); secrets belong in `safeStorage`.

External links go to the user's real browser via `shell.openExternal`. The one exception is the
Supabase OAuth popup, which must stay in-app to complete sign-in.

## Feature parity with `desktop/macos`

`desktop/macos/README.md` is the checklist. `desktop/macos` is deleted only when every row is
done.

| RN-macOS feature | Electron equivalent | Lives in | Status |
|---|---|---|---|
| Password + Google sign-in, session survives relaunch | Supabase session over the `claire-app://` secure origin | renderer | ✅ verified |
| Keychain-backed credential storage | `safeStorage` (Keychain / DPAPI / libsecret), `src/secure-store.ts` | main | ✅ verified |
| Native notifications | Electron `Notification`, click routes to the chat | main | ✅ wired |
| Dock badge mirroring unified unread | `app.setBadgeCount` ← `useUnreadBadge` | main | ✅ wired |
| `⌘1`–`⌘4`, `⌘K`, `⌘,` + Navigate menu | `Menu` accelerators → `router.push` | main | ✅ wired |
| `⌘N` focus composer | `Menu` → `focusComposer` IPC | main | ⚠️ channel only — no screen listens yet |
| `⌘⇧M` conversation in its own window (min 360 × 460) | second `BrowserWindow` at a deep route | main | ⚠️ channel only — no screen reports the active chat yet |
| Collapsible sidebar, pane widths, window bounds restore | `src/preferences.ts` in userData | main | ✅ verified |
| Inbox, chat history, promises, people, Ask Claire | shared client screens | renderer | ✅ inherited |
| Realtime + reconciliation polling | shared client services | renderer | ✅ inherited |
| Companion enrollment, P-256 identity, device credential | `crypto.subtle` + `safeStorage` | main | ☐ not started |
| iMessage `chat.db` import, resumable cursor | `better-sqlite3`, needs Full Disk Access | main | ☐ not started |
| iMessage attachment sync | `fs` + `fetch` in main; renderer sees URLs | main | ☐ not started |
| One-to-one iMessage send | `child_process` → `osascript` | main | ☐ not started |
| Ephemeral native Instagram login window | `BrowserWindow` on an isolated `session.fromPartition` | main | ☐ not started |
| WhatsApp phone pairing | server-side already; renderer polls | renderer | ✅ inherited |

"⚠️ channel only" means the main-process side and the IPC channel exist and are typed, but no
renderer screen subscribes yet — pressing the accelerator does nothing visible. "✅ inherited"
means the desktop gets it for free from the shared client, with no desktop-specific code.

## Layout

```
src/
├── main.ts          app lifecycle and IPC handlers
├── preload.ts       contextBridge -> window.claireDesktop (bundled to one file)
├── protocol.ts      claire-app:// scheme + SPA fallback
├── windows.ts       main window, detached conversation windows, link policy
├── menu.ts          application menu and accelerators
├── secure-store.ts  safeStorage-backed credentials
├── preferences.ts   non-sensitive UI state in userData
└── shared/ipc.ts    channel names and payload types (main + preload both import)
```
