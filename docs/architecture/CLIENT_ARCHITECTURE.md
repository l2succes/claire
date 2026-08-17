# Claire client architecture

How one codebase serves iOS, Android, the browser, and the desktop.

## The core idea

Claire used to have two client implementations of the same product: the Expo app, and
`desktop/macos/src/DesktopApp.tsx` — 1801 lines containing a complete second version of the
inbox, promises, people, assistant, and settings screens. They drifted, because nothing stopped
them.

There is now one implementation. What varies between clients is not the product, it is:

1. **Size** — a phone stacks screens; a desktop window puts a rail beside a list beside a thread.
2. **Capability** — only some hosts can set a Dock badge or read a local iMessage database.

These are handled by two different mechanisms, and keeping them separate is the thing that makes
the architecture hold.

| Varies by | Mechanism | Where |
|---|---|---|
| **Size** | Breakpoint at runtime — Tamagui `$gtCompact` / `$gtExpanded`, `useIsDesktopLayout()` | Layout |
| **Capability** | Platform extensions — `*.native.ts` / `*.web.ts` behind `@claire/host` | Capabilities |

**Layout must never branch on `Platform.OS`.** The Electron app *is* web and needs the desktop
layout; a phone browser is also web and needs the mobile layout. A platform check cannot tell
them apart. A breakpoint can.

## Directory tree

```text
claire/
├── nx.json                       # task graph, caching, target defaults
├── tsconfig.base.json            # path aliases
├── package.json                  # bun workspaces: apps/*, packages/*, examples/plugins/*
│
├── apps/
│   ├── client/                   # Expo app — iOS, Android, web, and the Electron renderer
│   │   ├── app/                  # expo-router routes
│   │   │   ├── _layout.tsx       #   providers + DesktopChrome wrapper
│   │   │   └── +html.tsx         #   web HTML shell
│   │   ├── components/desktop/   # DesktopChrome — picks the shell
│   │   ├── features/             # screen bodies (migrating into @claire/ui)
│   │   ├── hooks/                # useClaireFonts.{native,web}, useUnreadBadge
│   │   ├── services/             # API, supabase, notifications, cache
│   │   ├── tamagui.config.ts     # re-exports the shared config for the compiler
│   │   └── e2e/                  # Playwright, incl. helpers/mock-backend.mjs
│   │
│   ├── desktop/                  # Electron shell. No UI of its own.
│   │   └── src/
│   │       ├── main.ts           #   lifecycle, IPC handlers
│   │       ├── preload.ts        #   contextBridge → window.claireDesktop (bundled)
│   │       ├── protocol.ts       #   claire-app:// scheme + SPA fallback
│   │       ├── windows.ts        #   main window, detached conversation windows
│   │       ├── menu.ts           #   accelerators → router paths
│   │       ├── secure-store.ts   #   safeStorage-backed credentials
│   │       ├── preferences.ts    #   non-sensitive UI state
│   │       └── shared/ipc.ts     #   channel names + payload types
│   │
│   ├── server/                   # Bun API
│   └── website/                  # Next.js marketing site
│
├── packages/
│   ├── tokens/                   # colors, space, radius, fonts, type, breakpoints
│   │   ├── src/index.ts          #   the single source
│   │   ├── css/tokens.css        #   GENERATED — consumed by apps/website
│   │   └── scripts/generate-css.ts
│   ├── design-system/            # Tamagui config + primitives (Tier 1)
│   ├── shell/                    # DesktopShell, DragRegion, ResizablePane (Tier 3)
│   ├── host/                     # capability seam (Tier: util)
│   ├── platform-catalog/
│   └── plugin-sdk/
│
├── desktop/macos/                # FROZEN. React Native macOS host, being retired.
└── docs/  docker/  infra/  scripts/
```

## Dependency direction

```
apps/client ──┬──> @claire/shell ──> @claire/design-system ──> @claire/tokens
              └──> @claire/host
apps/desktop ─────> (loads the client's web export; shares no runtime code)
apps/website ─────> @claire/tokens (CSS only)
apps/server ──────> never a client package
```

Enforced by NX tags (`scope:*`, `type:*`) with `@nx/eslint-plugin`'s `enforce-module-boundaries`,
not just by convention. `bunx nx graph` renders the real edges.

## Component tiers

The rule is **fork layout, share content**. A screen is a `<Layout>` (may fork) wrapping
`<Content>` (never forks).

### Tier 1 — shared, zero branching · `@claire/design-system`

`ClaireText`, `ClaireCard`, `ClaireButton`, `ClaireIconButton`, `ClaireField`, `ClaireAvatar`,
`ClaireStatusPill`, `ClairePlatformBadge`, `ClaireMessageBubble`, `ClaireConversationRow`,
`ClaireComposer`.

Density comes from breakpoint variants inside the component, not from a fork:

```tsx
const ButtonFrame = styled(InteractiveFrame, {
  minHeight: '$touch',              // 44pt — the touch minimum
  $gtCompact: { minHeight: '$control' },  // 36pt once there is a mouse
})
```

This replaced a `ClaireThemeProvider surface={'desktop' | 'mobile'}` context that selected
between two whole parallel type scales. Under that design a component could not be sized
independently of what an ancestor had declared — which breaks immediately in the desktop shell,
where a narrow inspector sits beside a wide thread inside the same "surface".

### Tier 2 — shared, density-aware · `@claire/ui` (in progress)

Feature content: conversation list, message thread, promise cards, people cards, settings
sections. One implementation, reading `useMedia()` internally. This is where
`apps/client/features/*` is migrating, and it is what the desktop reuses rather than
reimplementing. `DesktopApp.tsx`'s pane bodies are **deleted**, not ported.

### Tier 3 — shell, genuinely forked · `@claire/shell`

Only the arrangement. `DesktopShell` (title bar, navigation rail, resizable panes) versus the
phone layout (tab bar, stacked screens). Forking is cheap here because it is pure layout over
Tier 2 content.

`apps/client/components/desktop/DesktopChrome.tsx` picks between them, and renders no chrome for
signed-out routes — a navigation rail behind a sign-in form would offer destinations the user
cannot reach.

## Navigation

The desktop shell is chrome around expo-router's stack. It does **not** own a `destination` state
machine, which is what the React Native macOS host used.

That matters because Electron and the browser both have real URL history. Menu accelerators
(`⌘1`–`⌘4`, `⌘K`, `⌘,`) send router *paths* from the main process, the renderer calls
`router.push`, and back/forward, deep links, and reload-to-the-same-place all keep working.
`e2e/desktop-shell.spec.mjs` asserts this.

## `@claire/host` — the capability seam

```ts
type ClaireHost = {
  readonly name: 'native' | 'browser' | 'electron'
  readonly capabilities: {
    badge, notifications, imessage, nativeWindow, secureStorage: boolean
  }
  setBadgeCount(count), notify(n), openExternal(url)
  onNavigate(cb), onFocusComposer(cb)
  openConversationWindow(chatId), reportActiveConversation(chatId)
  getPreference(key) / setPreference(key, value)     // non-sensitive
  secureGet(key) / secureSet(key, value) / secureDelete(key)  // OS keystore
}
```

Callers branch on `capabilities`, never on `Platform.OS` — a capability check survives a new host
being added.

`host.web.ts` covers both the browser and the Electron renderer, discovering `window.claireDesktop`
at runtime. The renderer bundle is byte-identical in both cases; only what it finds differs.

### Platform-extension fallbacks must re-export, not declare

`host.ts`, `DragRegion.ts`, and `useClaireFonts.ts` each re-export the web implementation:

```ts
// TypeScript resolves this fallback while Metro selects .native / .web.
export * from './host.web';
```

A declaration-only stub (`export declare const host`) typechecks fine and then evaluates to
`undefined` if Metro ever resolves the base file — which produced a blank desktop window and a
bare "Element type is invalid" error. Matches `apps/client/services/mobile-cache.ts`.

## Electron

**Main is the new native module.** Credentials, and eventually iMessage bytes, live there and
never reach the renderer — exactly as they never reached the React Native layer in
`desktop/macos`. The renderer runs `contextIsolation: true`, `nodeIntegration: false`,
`sandbox: true`, and its whole privileged surface is `window.claireDesktop`.

Two consequences worth knowing:

- **A sandboxed preload cannot `require()` a relative module.** The preload is bundled to a single
  file (`bun build`) while main compiles with `tsc`. Without this the preload silently exposes
  nothing.
- **A sandboxed preload cannot call `safeStorage`.** Availability is resolved in main at startup
  and passed to the preload as an argv switch.

### The packaged renderer is served over `claire-app://`, not `file://`

This is load-bearing. The client persists its Supabase session through AsyncStorage, which is
`localStorage` on web. Under `file://` the page gets an **opaque origin**, where `localStorage` is
unreliable — a signed-in user would be signed out on every relaunch. Registering `claire-app://`
as `standard` + `secure` gives a stable secure origin, and the handler falls back to `index.html`
so expo-router owns client-side routes.

`claire-app://` is deliberately distinct from `claire://`, the Expo deep-link scheme
(`apps/client/app.json`), which is reserved for OAuth callbacks.

## Fonts

Native embeds Public Sans / Inter / DM Mono through the expo-font config plugin. **That plugin
does nothing on web**, so before `hooks/useClaireFonts.web.ts` existed, the web and Electron
clients silently fell back to the system face.

`expo-font`'s `useFonts` cannot fix it: it keys a map by family name, so it registers one weight
per family, and Claire's tokens use one family across four weights with `fontWeight` selecting.
The web hook resolves each `.ttf` through `expo-asset` — which is also what makes Metro emit them
for web — and registers eight `FontFace` entries directly.

## Commands

```sh
bunx nx run-many -t typecheck lint test build   # everything
bunx nx affected -t typecheck lint test build   # only what changed
bunx nx graph                                   # dependency graph

cd apps/client  && bunx expo start --web --port 8081
cd apps/desktop && bun run dev                  # Electron against that dev server
cd apps/desktop && bun run package               # distributables

cd packages/tokens && bun run generate           # regenerate css/tokens.css
```

## Conventions

- Layout branches on breakpoint. Capabilities branch on `host.capabilities`. Never `Platform.OS`
  for layout.
- Tokens are edited in `packages/tokens/src/index.ts`. `css/tokens.css` is generated; never edit it.
- Platform-extension base files re-export a real implementation.
- Tamagui components need `role` / `aria-*`, not React Native's legacy `accessibility*` props —
  Tamagui renders real DOM on web and does not translate them.
- New Playwright specs declare their viewport intent; the config defaults below the desktop
  breakpoint so existing mobile-flow suites keep testing the mobile layout.
