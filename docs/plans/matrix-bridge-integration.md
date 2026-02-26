# Multi-Platform Messaging: Matrix Bridge Integration

## Overview

Add Matrix bridge support alongside existing direct adapters. A `PLATFORM_MODE` environment variable switches between:
- **`direct`** (current) - Native platform libraries (whatsapp-web.js, telegraf, etc.)
- **`matrix`** (new) - Matrix bridges via Synapse homeserver (mautrix-*)

Both modes use the same `IPlatformAdapter` interface - the client/API doesn't know the difference.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Claire Backend                               │
│                      PlatformManager (existing)                      │
│                              │                                       │
│              ┌───────────────┴───────────────┐                      │
│              ▼                               ▼                       │
│     PLATFORM_MODE=direct            PLATFORM_MODE=matrix             │
│              │                               │                       │
│    ┌─────────┴─────────┐            ┌───────┴───────┐               │
│    │  Direct Adapters  │            │ MatrixAdapter │               │
│    │  (existing code)  │            │   (new code)  │               │
│    └─────────┬─────────┘            └───────┬───────┘               │
│              │                               │                       │
│    Platform APIs                    Matrix Homeserver                │
│    (whatsapp-web.js,               (Synapse + mautrix               │
│     telegraf, etc.)                  bridges in Docker)              │
└─────────────────────────────────────────────────────────────────────┘
```

## Why Matrix Bridges?

| Aspect | Direct Adapters | Matrix Bridges |
|--------|-----------------|----------------|
| Reliability | Untested | Battle-tested by Beeper |
| Maintenance | We maintain | Community maintained |
| Edge cases | We handle | Already handled |
| Setup | npm install | Docker + config |
| Resource usage | Light | ~2-4GB RAM |

## Files to Create

```
server/src/adapters/matrix/
├── index.ts                    # MatrixBridgeAdapter class
├── types.ts                    # Matrix-specific types
├── client.ts                   # matrix-js-sdk wrapper
├── room-mapper.ts              # Matrix rooms ↔ platform chats
├── user-mapper.ts              # Ghost users ↔ platform contacts
├── event-converter.ts          # Matrix events → UnifiedMessage
└── bridge-auth/
    ├── index.ts                # Auth flow coordinator
    ├── whatsapp.ts             # QR code flow via bridge bot
    ├── telegram.ts             # Phone login flow
    └── instagram.ts            # Cookie auth flow

docker/matrix/
├── docker-compose.matrix.yml   # Synapse + all bridges
├── synapse/
│   └── homeserver.yaml.template
└── bridges/
    ├── whatsapp/config.yaml.template
    ├── telegram/config.yaml.template
    └── instagram/config.yaml.template

supabase/migrations/
└── 20260206_add_matrix_mappings.sql
```

## Files to Modify

| File | Changes |
|------|---------|
| `server/src/config/index.ts` | Add `PLATFORM_MODE`, Matrix env vars |
| `server/src/adapters/index.ts` | Add `setMatrixMode()` to PlatformManager |
| `server/src/index.ts` | Conditional adapter initialization |
| `server/package.json` | Add `matrix-js-sdk` dependency |

## New Dependencies

```json
{
  "matrix-js-sdk": "^34.0.0"
}
```

## Implementation Phases

### Phase 1: Configuration & Types (~1 hour)
1. Add to `server/src/config/index.ts`:
   ```typescript
   PLATFORM_MODE: z.enum(['direct', 'matrix']).default('direct'),
   MATRIX_HOMESERVER_URL: z.string().url().optional(),
   MATRIX_SERVER_NAME: z.string().optional(),
   MATRIX_ADMIN_TOKEN: z.string().optional(),
   ```
2. Create `server/src/adapters/matrix/types.ts` with Matrix-specific interfaces

### Phase 2: MatrixBridgeAdapter Core (~3 hours)
1. Create `server/src/adapters/matrix/index.ts`:
   - Extends `BasePlatformAdapter`
   - Connects to Synapse via `matrix-js-sdk`
   - Handles `RoomEvent.Timeline` for incoming messages
   - Manages control rooms for bridge bot commands
2. Key methods:
   - `initialize()` - Connect to homeserver, start sync
   - `createSession()` - Create control room with bridge bot, send login command
   - `sendMessage()` - Find Matrix room, send via SDK
   - `getChats()` - List rooms with bridge ghost users

### Phase 3: Room & User Mappers (~2 hours)
1. Create `room-mapper.ts`:
   - Maps `platform:chatId` ↔ `matrixRoomId`
   - Identifies rooms by ghost user presence (e.g., `@_wa_12345:server.com`)
2. Create `user-mapper.ts`:
   - Converts ghost users to platform contacts
   - Ghost patterns: `@_wa_*`, `@_telegram_*`, `@_instagram_*`
3. Create `event-converter.ts`:
   - Converts Matrix `m.room.message` events to `UnifiedMessage`

### Phase 4: Bridge Auth Flows (~2 hours)
1. Create `bridge-auth/whatsapp.ts`:
   - Send `login` to bridge bot
   - Parse QR code from `m.image` response
   - Emit `qr_code` event for client
2. Create `bridge-auth/telegram.ts`:
   - Send `login +phone` to bridge bot
   - Handle verification code prompt
3. Create `bridge-auth/instagram.ts`:
   - Send `login-cookie <cookies>` to bridge bot

### Phase 5: Docker Infrastructure (~2 hours)
1. Create `docker/matrix/docker-compose.matrix.yml`:
   ```yaml
   services:
     synapse:
       image: matrixdotorg/synapse:latest
     postgres-synapse:
       image: postgres:15-alpine
     mautrix-whatsapp:
       image: dock.mau.dev/mautrix/whatsapp:latest
     mautrix-telegram:
       image: dock.mau.dev/mautrix/telegram:latest
     mautrix-instagram:
       image: dock.mau.dev/mautrix/meta:latest
   ```
2. Create bridge config templates with environment variable substitution
3. Create `scripts/init-bridges.sh` for registration file generation

### Phase 6: Mode Switching & Testing (~2 hours)
1. Update `server/src/index.ts`:
   ```typescript
   if (matrixConfig.enabled) {
     const matrixAdapter = new MatrixBridgeAdapter(config);
     platformManager.setMatrixMode(matrixAdapter);
   } else {
     // existing direct adapter registration
   }
   ```
2. Update `PlatformManager.getAdapter()` for matrix mode
3. Write integration tests with mock Matrix server

## Database Migration

```sql
-- Matrix room mappings for bridge mode
CREATE TABLE public.matrix_room_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    session_id TEXT NOT NULL,
    platform platform_type NOT NULL,
    matrix_room_id TEXT NOT NULL,
    platform_chat_id TEXT NOT NULL,
    is_control_room BOOLEAN DEFAULT FALSE,
    UNIQUE(matrix_room_id)
);
```

## Environment Variables

```env
# Platform Mode
PLATFORM_MODE=direct   # or 'matrix'

# Matrix Configuration (required when PLATFORM_MODE=matrix)
MATRIX_HOMESERVER_URL=http://localhost:8008
MATRIX_SERVER_NAME=claire.local
MATRIX_ADMIN_TOKEN=syt_your_admin_token

# Telegram API (required for mautrix-telegram)
TELEGRAM_API_ID=12345
TELEGRAM_API_HASH=abcdef123456
```

## Platform Auth Flows (Matrix Mode)

| Platform | Bridge Bot | Auth Command | User Action |
|----------|------------|--------------|-------------|
| WhatsApp | @whatsappbot | `login` | Scan QR with phone |
| Telegram | @telegrambot | `login +phone` | Enter SMS code |
| Instagram | @instagrambot | `login-cookie <c>` | Extract browser cookies |
| iMessage | N/A | N/A | Not recommended via Matrix |

## iMessage Note

**iMessage via mautrix-imessage is NOT recommended** for server deployment:
- Requires local macOS machine with SIP disabled
- Cannot run in Docker
- Keep using direct iMessage adapter instead

## Verification

1. **Start Matrix stack**: `docker compose -f docker/matrix/docker-compose.matrix.yml up -d`
2. **Set env**: `PLATFORM_MODE=matrix`
3. **Start server**: `bun run dev`
4. **Test WhatsApp**:
   - `POST /platforms/whatsapp/connect` → Get QR code
   - Scan with phone
   - Send message → Verify received in Claire
5. **Test Telegram**:
   - `POST /platforms/telegram/connect` with phone number
   - Enter verification code
   - Message bot → Verify received
6. **Run tests**: `bun test src/adapters/matrix`

## Critical Files

- `server/src/adapters/types.ts` - IPlatformAdapter interface to implement
- `server/src/adapters/base-adapter.ts` - Base class to extend
- `server/src/adapters/index.ts` - PlatformManager to modify
- `server/src/config/index.ts` - Config schema to extend
- `server/src/index.ts` - Server startup to modify

## Estimated Time

| Phase | Time |
|-------|------|
| Phase 1: Config & Types | 1 hour |
| Phase 2: MatrixBridgeAdapter | 3 hours |
| Phase 3: Mappers | 2 hours |
| Phase 4: Auth Flows | 2 hours |
| Phase 5: Docker | 2 hours |
| Phase 6: Testing | 2 hours |
| **Total** | **~12 hours** |

## Rollback Plan

If Matrix mode has issues:
1. Set `PLATFORM_MODE=direct`
2. Restart server
3. Direct adapters resume immediately
4. No data loss - sessions stored separately by mode
