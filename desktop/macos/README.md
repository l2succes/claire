# Claire Desktop for macOS

Claire Desktop is a React Native macOS host for the same private Claire account
used on iOS, Android, and web. It is both a full client and the Mac companion
that can sync iMessage history from `chat.db`.

It intentionally has its own React Native dependency set. Do not add
`react-native-macos` to the Expo mobile application: the supported React Native
versions do not currently match.

## What works in this host

- Password and Google sign-in using a Keychain-backed Supabase session.
- Inbox, chronological chat history, shared unread cursors, outgoing cloud
  bridge messages, promises, people, and a cited Ask Claire surface. Realtime
  database events update the visible chat/inbox immediately; bounded polling
  reconciles a missed socket event without reloading the panes.
- Per-install companion enrollment with a P-256 identity and a revocable
  device credential in the macOS Keychain.
- iMessage history import from the local Messages database. The initial import
  is marked as backfill; later cursor batches are live updates.
- Native iMessage attachment sync. The macOS module reads attachment bytes and
  uploads them directly with the companion credential; local file paths and
  attachment bytes never enter the React Native layer.
- One-to-one iMessage sending via Messages.app after the user grants macOS
  Automation permission. Group sending is deliberately disabled until the
  local mautrix-imessage bridge host is in place.
- An ephemeral native Instagram login window. The account holder signs in and
  completes any Instagram challenge themselves; the resulting session is
  passed directly from WebKit to the Claire bridge, without DevTools or manual
  cookie copying.
- WhatsApp phone pairing from the Connections screen. Claire requests and
  displays the bridge-issued code, then observes the persisted session until
  WhatsApp confirms the link; a pending pairing survives an app restart.
- Native macOS notifications for incoming realtime messages when both the
  shared Claire notification preference and the macOS permission are enabled.
- A native Dock badge that mirrors the synced unified unread total.
- Desktop shortcuts: `⌘1` Home, `⌘2` Inbox, `⌘3` Promises, `⌘4` People,
  `⌘K` Ask Claire, `⌘N` focuses the active conversation composer, and `⌘,`
  opens Settings. The same actions are available from the macOS **Navigate**
  menu. `⌘⇧M` opens the selected conversation in its own compact, resizable
  Mac window (minimum 360 × 460).
- The active workspace and selected conversation restore on this Mac. Those
  non-sensitive UI preferences stay in local macOS preferences, separate from
  Keychain-held credentials.

## Prerequisites

- macOS with Xcode and Xcode command-line tools.
- Node 20 or newer, npm, and CocoaPods.
- A running Claire API and Supabase project.
- Full Disk Access for Claire Desktop to read `~/Library/Messages/chat.db`.
- Messages Automation permission when sending an iMessage.

Install JavaScript and native dependencies:

```sh
cd desktop/macos
npm install
pod install --project-directory=macos
```

## Runtime configuration

Copy the non-secret example and set the public client configuration for your
environment:

```sh
cp macos/ClaireDesktop.xcconfig.example macos/ClaireDesktop.xcconfig
```

Set these values in `ClaireDesktop.xcconfig` or inject them in the signed build
configuration:

- `CLAIRE_API_URL`
- `CLAIRE_SUPABASE_URL`
- `CLAIRE_SUPABASE_ANON_KEY`

The Supabase anon key is a public client key. Never put the service-role key,
database URL, Matrix tokens, or bridge credentials in this file or in the app
bundle.

## Run and verify

```sh
npm run typecheck
npm run lint
npm run start
npm run macos
```

On first launch:

1. Sign in to Claire.
2. Open **Connections → iMessage on this Mac → Open Mac permissions** and add
   Claire Desktop to Full Disk Access.
3. Return to the app and let the first iMessage import finish. It stores a
   resumable row cursor in Keychain and does not produce historical push
   notifications. Supported attachments up to 25 MB are then synced directly
   from the native companion; images render in the Claire conversation.
4. For an explicit one-to-one iMessage send, macOS will ask whether Claire can
   control Messages. Approve only if that is the intended action.
5. To connect Instagram, choose **Connections → Connect Instagram**, then use
   the private login window. If Instagram requests 2FA or a security check,
   complete it in that window; Claire never asks for an Instagram password.
6. To connect WhatsApp, enter the account number in **Connections → WhatsApp**
   in E.164 form. On the primary phone choose **Linked devices → Link with
   phone number**, then enter the code Claire displays. Do not enter the code
   into Claire; it belongs in WhatsApp.
7. To receive Mac alerts, enable **Settings → Notifications**, then choose
   **Allow macOS alerts** and approve the operating-system permission. Claire
   does not request this permission on launch.

## Privacy model

The native module stores the companion private key and device credential in
Keychain. The credential is bound to the signed-in Claire account and is not
reused if a different person signs in on the same Mac. The React Native layer
can access only its own Supabase session and two non-secret iMessage sync
checkpoints; it never receives the private key, device credential, or raw
bridge login material. The server derives the account identity from the device
credential before it ingests a Mac event; the desktop client never supplies a
`user_id` for an iMessage event.

This is the MVP native iMessage adapter. The production companion supervisor
will replace its direct database/send operations with the signed
`mautrix-imessage` local bridge process, preserving the same device-event
contract and UI.
