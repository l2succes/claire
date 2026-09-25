# Connection recovery and outgoing queue

The mobile composer remains mounted through unavailable, refreshing, and
reconnecting states. Typing does not depend on bridge status. Text sends and
reactions are accepted into an account-scoped encrypted outbox before the input
is cleared. The worker belongs to the signed-in app, not the current chat.

A request failure or realtime status change wakes recovery immediately. The
first unsuccessful pass retries immediately, followed by 1, 2, 4, 8, 16, and
30-second retries. Foregrounding and online notifications wake it again.
A healthy foreground app checks sessions every 15 seconds. iOS suspension still
pauses JavaScript; foregrounding resumes the worker.

Events remain FIFO within a conversation. A blocked conversation does not block
others. Network errors, temporary backend failures, and targets still syncing
remain queued. Permanent failures offer retry or restoration to the draft
(discard for reactions). An unsent voice recording remains in its existing
review control; voice sends are not part of this text/reaction outbox.

The new `/platforms/:platform/recover` endpoint never starts authentication. It
wakes Matrix sync and reconciles the exact existing WhatsApp/Instagram login
with the bridge. Mautrix retains responsibility for its remote network retry
loop. Credentials that require pairing remain an explicit Connections action.
The legacy `/reconnect` login flow is not called automatically.

Deploy the server before the client. Queued sends use `/outbox/send` and
`/outbox/reactions` beneath the platform route, so an older backend rejects an
unsupported queue request rather than silently accepting a non-idempotent send.
Matrix transactions are derived from the user, platform, conversation, event
kind, and stable client request ID. A lost HTTP response or a server restart
therefore retries the same Matrix event. Matrix acceptance does not assert that
the remote recipient has received or read the message.

## Verification (2026-09-15)

- Client tests: durable queue restoration, serialized enqueue, conversation
  ordering, independent conversations, account changes, storage failure,
  permanent failure recovery, immediate wakeup/backoff, session recovery, and
  pending reaction identity.
- Shared chat-core tests: identical queued messages remain distinct and only the
  matching acknowledged event replaces a local message.
- Server tests: stable scoped transaction IDs, Matrix text/reaction transaction
  forwarding, exact linked-login status lookup, and transport recovery without
  authentication.
- Client and server TypeScript checks passed.
- `bun run ios --device 6C6955AC-4A9D-4119-9C43-7D44B9E98EC5` built and launched
  Claire Dev on iPhone 17 Pro / iOS 26.0 (zero build errors).
- An isolated temporary native test screen used the production composer, status
  component, outbox engine, and encrypted SQLite snapshot functions. A typed
  draft stayed visible while disconnected. A synthetic message and reaction
  restored from encrypted storage and drained in order, while the next draft
  remained in the input. The temporary screen was removed afterward.

No live WhatsApp messages were sent. Real bridge-to-phone delivery remains a
separate Lucas two-device test under `lucas-two-device-test-spec.md`.
