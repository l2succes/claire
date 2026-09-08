# Lucas two-device test spec

## Purpose

Use the dedicated **Lucas** profile as Claire's controlled peer for end-to-end
messaging tests. This lets an agent verify real bridge behavior, local mobile
state, and AI grounding without involving personal or customer conversations.

## Test roles

| Role | Device | Account | Responsibility |
| --- | --- | --- | --- |
| Claire | Booted iOS Simulator | Claire test account | Run the feature being tested and inspect the native UI. |
| Lucas | Separate Android device | Lucas WhatsApp test account | Send and receive only agreed test messages. |

The Android device is the preferred place to run WhatsApp. Do not make a test
plan depend on WhatsApp running in an iOS Simulator or Android emulator: login
and device-verification support there is not reliable. A second physical device
with a dedicated test number is acceptable when the Android device is not
available.

## Safety boundaries

- Lucas is a test-only identity. Do not use it to message real people or group
  chats, and do not inspect unrelated conversation content.
- Prefix every test message with `#claire-test` so it is easy to identify and
  delete. Use synthetic details only.
- An agent may navigate Claire, read the Lucas test chat, and run local checks.
  Before logging in to WhatsApp, pairing a new device, sending a real bridged
  message, or deleting test history, get explicit confirmation in the current
  task from the user controlling those accounts.
- Never paste WhatsApp verification codes, QR payloads, session tokens, or
  cookies into the repository, logs, issue text, or test fixtures.
- If the bridge reports a stale session, stop the test and ask the user to
  re-pair Lucas; do not retry pairing or rotate sessions automatically.

## One-time setup checklist

1. Create or confirm a dedicated WhatsApp account named Lucas on the Android
   test device, using a test number that is not used for personal chats.
2. Pair that account with Claire's local WhatsApp bridge using the documented
   bridge login flow. The user performs any QR scan, code entry, or device
   approval.
3. On the iOS Simulator, sign into the Claire test account and confirm that the
   Lucas chat appears in the inbox.
4. Record only non-secret identifiers in the test run notes: the Claire user,
   the Lucas display name, the chat ID, app build, bridge version, and date.
5. Send one `#claire-test setup` message in each direction and confirm each
   appears exactly once with the correct sender and timestamp.

## Standard test loop

For every feature requiring a real conversation:

1. State the scenario and the exact synthetic messages before sending them.
2. Ask for confirmation if the loop will send, pair, log in, or delete data.
3. Send from Lucas and verify on Claire: delivery, platform badge, sender,
   timestamp, ordering, and no duplicate.
4. Send from Claire and verify on Lucas: delivery, sender identity, ordering,
   and no duplicate.
5. Exercise the feature on the iOS Simulator, capturing screenshots and the
   relevant app/bridge logs when it fails.
6. Mark the result pass, fail, or blocked. Delete only the messages created for
   the run after user approval; preserve failures until they are triaged.

## Ask Claire context-token acceptance scenario

Use this scenario for the contextual Ask Claire implementation:

1. Lucas sends two synthetic messages about one concrete plan, for example:
   `#claire-test John: I can review the draft Thursday.` and
   `#claire-test John: Please send it before 3 PM.`
2. In Claire on iOS, confirm both messages sync into the Lucas conversation.
3. Start a new Ask Claire conversation and ask a question that names the plan.
   The thread title must change from `New conversation` to the first prompt
   without waiting for the answer.
4. Confirm the answer is grounded in the Lucas messages and that its sources
   show those messages.
5. Tap the person token. It must open People filtered to Lucas.
6. Return, then tap the conversation token. It must open the Lucas chat at the
   cited message, including its highlight state.
7. Repeat from the in-chat Ask Claire screen.
8. If the server returns a token/session-not-found error, confirm Claire shows
   the recovery copy — `We couldn't load that saved context…` — rather than
   the raw backend error.

## Evidence to collect

- App build/commit, simulator model and iOS version, Android device model, and
  bridge container image/version.
- The synthetic message text and timestamps (never verification data).
- A screenshot of each pass/fail UI state and focused bridge/app logs for a
  failure.
- The exact acceptance step that failed and whether retry reproduced it.

## What an agent can remember

This specification and the `AGENTS.md` reference establish Lucas as the
designated test peer. They do not grant persistent account access or permission
to send messages. Credentials, pairing, and any action outside Claire must be
confirmed each time by the user who controls the devices.
