# Claire Desktop (Electron)

An Electron shell that hosts the Claire client's React Native Web build. One UI runs on iOS,
Android, the browser, and the desktop; this app supplies the native capabilities the browser
cannot.

It is the supported desktop app on macOS, Windows, and Linux.

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

Two channels. They are separate applications — different name, icon, and
`userData` directory — so both can run at the same time without one taking the
other's single-instance lock or disturbing its signed-in session.

|  | `bun run dev` | `bun run prod` |
|---|---|---|
| Name | Claire Dev | Claire |
| Icon | black field, lime mark | lime field, ink mark |
| Renderer | Expo web dev server, Fast Refresh | exported bundle over `claire-app://` |
| DevTools | open on launch | closed |
| userData | `…/Application Support/Claire Dev` | `…/Application Support/Claire` |

```sh
# from apps/desktop
bun run dev          # debug: starts the dev server, waits for it, launches Claire Dev
bun run prod         # production: launches Claire against the exported bundle
bun run prod:fresh   # same, but re-export the bundle first
```

Or from the repository root:

```sh
bun run desktop:dev
bun run desktop:prod
```

`bun run dev` starts the Expo web server itself and picks a port that nothing
is using — it does not assume 8081 is available, which matters when another
checkout is already serving on it. Quitting the app stops the dev server too.

`bun run prod` reuses an existing `renderer/` bundle if one is present; pass
`--fresh` (or use `prod:fresh`) to re-export.

### Distributables

```sh
bun run package        # Claire      -> release/production
bun run package:dev    # Claire Dev  -> release/dev
```

Both are unsigned. Only the production build registers the `claire://` OAuth
scheme; registering it from two apps would make the callback target a coin flip.

### Icons

`build/icon.png` and `build/icon-dev.png` are committed, and generated from the
same path `ClaireMark` draws inside the app:

```sh
bun run icons        # needs `brew install librsvg`
```

## Security model

The renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
Its entire privileged surface is the `window.claireDesktop` object defined in `src/preload.ts`,
typed by `src/shared/ipc.ts`.

**Electron main is the native module.** Credentials, and eventually the iMessage database and
attachment bytes, live in main and never reach the renderer. `src/preferences.ts` holds only non-sensitive UI
state (window bounds, pane widths); secrets belong in `safeStorage`.

External links go to the user's real browser via `shell.openExternal`. The one exception is the
Supabase OAuth popup, which must stay in-app to complete sign-in.

## Desktop capability status

| Capability | Electron implementation | Lives in | Status |
|---|---|---|---|
| Passwordless email + Google sign-in, session survives relaunch | Supabase session over the `claire-app://` secure origin | renderer | ✅ verified |
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
