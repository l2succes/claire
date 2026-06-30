# Mock Bridge Mode

`MOCK_BRIDGE=true` boots the server with zero external dependencies — no Docker, no Supabase, no WhatsApp/Matrix/Telegram/Instagram. A `MockBridgeAdapter` replaces all real platform adapters and emits deterministic fixture messages.

## Usage

```bash
MOCK_BRIDGE=true bun run src/index.ts
```

Or set `MOCK_BRIDGE=true` in `.env`.

## Fixture inventory

| Entity | Count |
|--------|-------|
| User | 1 (`MOCK_USER_ID = 00000000-0000-0000-0000-000000000001`) |
| Platforms | 3 (WhatsApp, Telegram, Instagram) |
| Chats | 4 (3 individual + 1 WA group) |
| Messages | 10 |
| Promise-bearing message | 1 |

### The promise message

```
"I'll send you the report by Friday"
```

Sent from the user (isFromMe=true) in the WhatsApp/Alice chat. The promise detector should flag this as a `commitment` with deadline `Friday`.

### Chat IDs

| ID | Platform | Name |
|----|----------|------|
| `mock-chat-wa-alice` | WhatsApp | Alice (WA) |
| `mock-chat-tg-bob` | Telegram | Bob (TG) |
| `mock-chat-ig-carol` | Instagram | Carol (IG) |
| `mock-chat-wa-group` | WhatsApp | Team Chat (group) |

## Seed/reset endpoint

Available only when `MOCK_BRIDGE=true`:

```
GET  /seed/fixtures   → fixture counts & IDs (for test assertions)
POST /seed/reset      → truncate mock-user rows + replay fixture messages
```

Use `POST /seed/reset` at the start of each Playwright test to ensure a clean known state.

## How it works

1. `server/src/config/index.ts` parses `MOCK_BRIDGE` env var.
2. `server/src/index.ts` — when `mockBridgeConfig.enabled`, calls `platformManager.setMatrixMode(mockBridgeAdapter)` instead of any real adapter.
3. `MockBridgeAdapter.initialize()` emits `MOCK_MESSAGES` as `message` events via `setImmediate`, so the unified message handler in `index.ts` processes them and writes to Supabase.
4. The seed route truncates and replays for test isolation.
