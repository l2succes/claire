# Claire - Unified AI Messenger

## Quick Reference

- **Stack**: Bun server, React Native (Expo SDK 55), Supabase (Docker), Redis, Matrix (Synapse + mautrix bridges)
- **Platform mode**: `PLATFORM_MODE=matrix` in `server/.env`
- **Server**: port 3001, run with `bun run --watch src/index.ts` from project root
- **Client**: Expo SDK 55, React Native 0.83.4, React 19, new architecture (Bridgeless)
- **iOS build**: `bunx expo prebuild --clean --platform ios && bunx expo run:ios` from `apps/client/`

## Testing surfaces

Verify a change on the surface it ships to. The renderer is shared, but the
host, the caches and the navigation stack are not, so these are not
interchangeable.

- **Mobile → the iOS Simulator.** Run the real app (`bun run ios` from
  `apps/client`, or `bun run mobile:ios:staging` from the root), not the web
  build. Expo web is useful only for confirming a bundle compiles and boots: it
  exercises no native path, and `usesNativeMobileCache()` is `false` there, so
  anything touching the encrypted SQLite cache is silently skipped.
- **Desktop → the Electron app** (`bun run desktop:dev`). Not a browser tab.
  Electron is the only web-based host where `usesNativeMobileCache()` is true
  (it gates on `host.name === 'electron' && host.capabilities.encryptedCache`),
  and it is where the desktop layout — `useIsDesktopLayout`,
  `DesktopInboxWorkspace` — actually runs.

A plain browser is neither of those. It has no local cache at all, which makes
it the worst place to judge anything about load or navigation performance.

## Architecture

Claire bridges messaging platforms (WhatsApp, Telegram, Instagram) through Matrix (Synapse) using mautrix bridges. A single `MatrixBridgeAdapter` handles all platforms by routing through Matrix rooms.

```
Mobile App  <-->  Bun Server  <-->  Synapse (Matrix)  <-->  mautrix bridges  <-->  WhatsApp/Telegram/Instagram
                      |
                  Supabase DB + Redis
```

## Mautrix Bridge Reference

Official docs: https://docs.mau.fi/ (source: https://github.com/mautrix/docs)

**Optional local docs clone**: `vendor/mautrix-docs/` — initialize only for bridge work:
```bash
git submodule update --init vendor/mautrix-docs
grep -r "keyword" vendor/mautrix-docs/bridges/
```
Key paths:
- `vendor/mautrix-docs/bridges/general/` — encryption, backfill, double-puppeting, troubleshooting
- `vendor/mautrix-docs/bridges/go/whatsapp/` — WhatsApp-specific
- `vendor/mautrix-docs/bridges/go/telegram/` — Telegram-specific
- `vendor/mautrix-docs/bridges/go/meta/` — Instagram/Meta-specific

### Key docs to consult:
- **WhatsApp auth**: https://docs.mau.fi/bridges/go/whatsapp/authentication.html
- **Double puppeting**: https://docs.mau.fi/bridges/general/double-puppeting.html
- **Troubleshooting**: https://docs.mau.fi/bridges/general/troubleshooting.html
- **Backfill behavior**: https://docs.mau.fi/bridges/general/backfill.html
- **Appservice registration**: https://docs.mau.fi/bridges/general/registering-appservices.html

### Ghost user ID patterns (configured in appservice registration):
- WhatsApp: `@whatsapp_<phone>:claire.local`
- Telegram: `@_telegram_<userid>:claire.local`
- Instagram/Meta: `@meta_<id>:claire.local`
- iMessage: `@_imessage_<address>:claire.local`

### Bridge bot commands:
- WhatsApp: `login qr` (QR code) or `login phone` (pairing code)
- Telegram: `login` (then phone number + verification code)
- Instagram: `login-cookie` (paste browser cookies)

### Login success message format:
```
"Successfully logged in as +15166100494"
```
Sent as `m.notice` by the bridge bot in the control room.

### Double puppeting (not yet enabled):
Without double puppeting, the user's own messages from their phone appear in Matrix as their ghost user (e.g. `@whatsapp_15166100494:claire.local`), not as the bot user. The server tracks the "self ghost ID" per session to correctly set `isFromMe`.

With double puppeting enabled, outgoing messages would appear as the actual Matrix user account, which is the cleaner approach. See the double puppeting docs for setup.

### Backfill limitations:
- Matrix doesn't support inserting messages into room history
- Backfilled messages appear at end of timeline regardless of timestamp
- WhatsApp uses one-time "history sync" blobs after device linking
- Default: 50 most recent messages per room

## Docker Infrastructure

- **Supabase**: `docker/supabase/docker-compose.supabase.yml` — PostgreSQL, Kong, GoTrue, PostgREST, Realtime
- **Matrix**: `docker/matrix/docker-compose.matrix.yml` — Synapse + mautrix-whatsapp/telegram/instagram
- **Redis**: port 6379 (container: `claire-redis`)
- **Synapse**: port 8008 (container: `claire-synapse`)

### Useful commands:
```bash
# Bridge logs
docker logs claire-mautrix-whatsapp -f
docker logs claire-synapse -f

# Database queries
docker exec supabase-db psql -U postgres -d postgres -c "SQL"

# After schema changes
docker exec supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"
```

## Key Server Files

- `server/src/adapters/matrix/index.ts` — MatrixBridgeAdapter (main bridge logic)
- `server/src/adapters/matrix/event-converter.ts` — Matrix event to UnifiedMessage conversion
- `server/src/adapters/matrix/user-mapper.ts` — Ghost user ID mapping
- `server/src/adapters/matrix/room-mapper.ts` — Matrix room to platform chat mapping
- `server/src/adapters/matrix/types.ts` — Ghost user prefixes, bridge bot IDs
- `server/src/index.ts` — Express server, message handler, platform init
- `server/src/adapters/index.ts` — PlatformManager (routes events between adapters)

## Key Client Files

- `mobile/app/(tabs)/dashboard.tsx` — Unified inbox
- `mobile/app/(tabs)/contacts.tsx` — Contacts list
- `mobile/app/chat/[chatId].tsx` — Chat detail screen
- `mobile/components/MessageCard.tsx` — Message display with platform badges

## Mobile Code Conventions

Keep screens thin and composable. A screen file should read as layout; anything
else belongs in a subcomponent, a hook, or a data module.

- **Extract subcomponents.** A repeated row, card, or sheet body gets its own
  named component in the same feature folder rather than an inline block inside
  a `.map()`. See `features/more/more-sheet.tsx` (`MoreSheetRow`).
- **Business logic goes in hooks or stores**, never inline in a screen. State
  that outlives one screen belongs in a zustand store under `hooks/` or
  `stores/` (`hooks/useMoreSheet.ts`); data fetching belongs in a query hook
  (`hooks/useInboxMessages.ts`).
- **Feature folders.** Screen-level UI lives in `features/<feature>/`, with
  static config split out (`features/more/more-destinations.ts`) so the view
  imports data rather than declaring it.
- **Reusable shells live in `components/mobile/`.** Shared chrome — sheets,
  chips, headers, buttons — goes here so features do not re-implement it
  (`components/mobile/bottom-sheet.tsx`).
- **Route files stay trivial.** Files under `app/` should wire params and render
  a feature component; keep the implementation in `features/`.
- **Replacing a screen? Keep the old one.** Move it to
  `features/<feature>/legacy-*.tsx` and leave a comment naming the one edit that
  reverts the change, until the replacement has shipped.

### Mobile gotchas

- **`Pressable`'s `({ pressed }) => style` callback does not apply.** NativeWind's
  `react-native-css-interop` wraps `Pressable` and drops the callback result, so
  the element renders with no style at all (a row loses `flexDirection` and
  collapses into a column). Use a static style object and track pressed state
  with `onPressIn`/`onPressOut`.
- **Content-sized bubbles collapse `flex: 1` children to zero width**, which
  wraps text one character per line. Give such rows an explicit width.
- **The floating tab bar is absolutely positioned** (58pt above the safe-area
  inset). Anything anchored to the bottom must reserve that space — see
  `bottomSheetInset()` in `components/mobile/bottom-sheet.tsx`.

## Known Conventions

- Messages upsert on `onConflict: 'whatsapp_id'` (the platform message ID)
- Chats upsert on `onConflict: 'user_id,platform,platform_chat_id'`
- Contacts upsert on `onConflict: 'user_id,platform,platform_contact_id'`
- Sessions stored in Redis with keys `platform:whatsapp:session:{sessionId}`
- Admin bot: `@claire_bot:claire.local`
