# Claire Desktop companion setup

> **Product status:** This guide defines the companion connection experience
> now. Signed Claire Desktop installers and device pairing are the next
> implementation milestone; do not publish a download link until they ship.

Claire has mobile, web, and desktop clients. Some chat networks require a
desktop companion because their connection is tied to a computer or an
app-owned desktop browser session. Once connected, Claire synchronizes the
messages that you have approved for cloud sync so the inbox and AI features
are available on your other Claire clients.

## At a glance

| Network | Companion requirement | What you need |
| --- | --- | --- |
| WhatsApp | No | Your primary WhatsApp phone for the normal linked-device flow. |
| Telegram | No | Your phone number and Telegram verification code. |
| Instagram | Yes | Claire Desktop on a Mac or Windows computer. |
| iMessage | Yes, macOS only | A Mac that stays signed in to Messages with your Apple Account. |

## Instagram

Instagram uses the Claire Desktop companion rather than a form in the mobile
or web app. The companion owns the browser session needed by the bridge, so
Claire never asks you to open developer tools or paste a browser cookie.

1. Install and sign in to Claire Desktop with the same Claire account used on
   your phone or the web app.
2. Open **Settings → Connected platforms → Instagram → Connect**.
3. Complete Instagram's normal sign-in and any challenge or two-factor prompt
   in the companion window.
4. Wait for Claire Desktop to show **Connected**. Keep the companion running
   for the first sync.
5. Return to any Claire client and refresh Connected platforms. Your Instagram
   conversations will appear as the companion syncs them.

Instagram can ask you to approve a new browser/device login. That approval is
normal. Do not give an Instagram password, copied cURL command, or cookie value
to Claire support or paste one into Claire.

## iMessage

iMessage requires a Mac companion. iOS, Android, Windows, Linux, and web
clients cannot directly read or send messages through Apple's Messages database.

1. Use a Mac signed into the Apple Account that owns the iMessage account.
2. Keep Messages enabled and allow Claire Desktop the permissions it requests
   to read the local message history and automate sending.
3. In Claire Desktop, open **Settings → Connected platforms → iMessage →
   Connect** and complete the permissions check.
4. Leave the Mac powered on and connected to the internet. It is the source of
   new iMessage events for the rest of Claire.

Claire's initial companion will use the normal macOS security model. It will
not ask users to disable System Integrity Protection. That supports basic
bridging; advanced bridge capabilities may remain unavailable on a normal Mac.

## Privacy and reliability

- The companion keeps the upstream network session on the companion computer.
- Claire only syncs conversation data after the account owner has connected the
  platform. Synced text and captions can power the unified inbox, Ask Claire,
  reply suggestions, and promise tracking.
- Disconnecting a platform revokes the companion connection. Deleting imported
  message history is a separate account-data action.
- A companion must be online to receive new upstream messages. The app always
  shows a last-sync timestamp so it does not imply that a disconnected computer
  is live.

## Troubleshooting

- **Instagram sign-in is challenged:** approve the login in Instagram, finish
  any two-factor step, then retry from Claire Desktop.
- **Instagram appears connected but chats are missing:** leave the companion
  open through the initial sync and refresh the client after the last-sync time
  advances.
- **iMessage is unavailable:** confirm the Mac is signed into Messages, awake,
  online, and that Claire Desktop has the required permissions.
- **Companion is offline:** mobile and web still show already-synced messages,
  but new messages cannot arrive until the companion reconnects.
