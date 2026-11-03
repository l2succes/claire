# Demo shot list

What the seeded demo account can actually show, and the exact taps and phrases
that get there. Derived from `FILMABLE_SURFACES` in
`apps/server/src/demo/personas.ts` and verified against the seeded production
account.

## Before you start

Sign in as **`l2succes+demo@gmail.com`**, request an email code, take it from
your inbox. The session persists, so this is once — not per take.

Between takes, if you have sent messages you would rather not keep:

```bash
bun run demo:seed -- --email l2succes+demo@gmail.com --api https://api.useclaire.co --reset
```

A full `--reset` rebuilds everything (~73 model calls, and loop detection takes
a minute or two to settle). Dropping `--reset` is nearly free and still
re-queues loop detection, but it leaves messages you sent in place.

## 1. The unified inbox

Nine conversations across WhatsApp, Telegram and Instagram in one list, with
platform badges and unread counts. The newest thing in the account is Nina
asking about budget ~90 minutes before seed time, so the top of the inbox is
always fresh.

## 2. Loops — the headline

Roughly 15 loops, split between what you owe and what people owe you. The ones
worth landing on:

| Chat | Loop |
| --- | --- |
| Tomas Lindqvist | the updated deck, promised "by Friday", chased twice |
| Dele Adeyemi | $400 for grandma's cake — chased three times, baker waiting |
| Amara Okonkwo | picking her up at JFK, and picking a Friday dinner spot |
| Nina Castellanos | the budget she needs before she can hold dates |
| Priya Raghunathan | empty-state feedback, which is blocking her handoff |

Tomas is the strongest single beat: a real commitment, a real deadline, and two
follow-ups from him that went unanswered.

## 3. Ask Claire

These are answerable from the seeded history. The first is the best one to film,
because the answer lives in a **different chat on a different platform** from
the question:

| Ask | Where the answer actually lives |
| --- | --- |
| "What's the address of the studio for the shoot?" | Priya's Telegram thread — 41 Wythe Ave, 3rd floor, Brooklyn — while Nina is the one asking for it on Instagram |
| "When is my call with Tomas?" | Wednesday 10am, after they weighed Tuesday 2pm |
| "When does Amara land?" | Thursday 6:40pm, Delta 1422 into JFK, four nights |
| "What do I owe Dele?" | $400 for the cake and decorations |
| "Who's waiting on me?" | spans several threads at once |

## 4. Group summaries

- **Red Hook Saturday ⚽️** (WhatsApp, 14 messages) — banter with a real action
  item buried in it: the pitch is booked Saturday 9am, bibs are sorted, and
  Rahim still needs one more player.
- **Claire beta testers** (Telegram, 16 messages) — substantive: a badge bug
  with numbered reproduction steps, slow search on large threads, a desktop
  build request, and a note that the loops empty state reads like an error.

## 5. A live reply

Open **Amara Okonkwo** and send something. She answers in character in about
seven seconds, sometimes in two bubbles, and it raises an unread badge.

Verified example — sending *"thinking thai on grand st friday, 8pm — does that
work?"* got back:

> thai on grand is very safe of you but yes, 8 works

A burst of several messages gets **one** reply to the last of them, the way a
person would. If you want snappier replies on camera, `DemoResponderDelays` in
`apps/server/src/services/demo-responder.ts` controls the pacing.

Good chats to write into, by how they answer:

| Persona | Register |
| --- | --- |
| Amara (WhatsApp) | warm, lowercase, teasing, often two bubbles |
| Tomas (Telegram) | formal, dense, closes with a concrete ask |
| Dele (WhatsApp) | Nigerian English, short, direct |
| Nina (Instagram) | short, emoji, enthusiastic |
| Priya (Telegram) | organised, full sentences, flags blockers |

## 6. Suggestions

Nina's thread ends on an unanswered question, which is where a reply suggestion
is most natural to show.

## Do not film

**The Connections screen's connect or QR flow.** The three platforms show as
connected, but the sessions are synthetic — that is the one surface where the
illusion does not hold. Everything downstream of a connection is real.
