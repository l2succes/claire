# Claire - Unified AI Messenger

An AI-powered unified messaging companion that bridges WhatsApp, Telegram, and Instagram into a single inbox. Smart reply suggestions, promise tracking, and contact inference across all your messaging platforms.

## Features

- Multi-platform messaging: WhatsApp, Telegram, Instagram in one inbox
- AI-powered response suggestions using GPT-4
- Universal iOS app built with Expo SDK 55
- Real-time message synchronization via Supabase Realtime
- Promise/commitment detection and tracking
- Smart contact inference with relationship mapping
- Platform filtering and unified search

## Tech Stack

### Backend
- **Runtime**: Bun + TypeScript
- **Server**: Express.js on port 3001
- **Database**: Supabase (PostgreSQL, Auth, Realtime, Storage) — self-hosted via Docker
- **Message bridging**: Matrix (Synapse) + mautrix bridges (WhatsApp, Telegram, Instagram)
- **Cache/Sessions**: Redis
- **AI**: OpenAI GPT-4

### Frontend
- **Framework**: Expo SDK 55 + TypeScript
- **React Native**: 0.83.4 with new architecture (Bridgeless)
- **Navigation**: Expo Router v4
- **State**: Zustand
- **Auth**: Supabase Auth with Google OAuth

### Infrastructure
- **Matrix homeserver**: Synapse on port 8008
- **Bridges**: mautrix-whatsapp, mautrix-telegram, mautrix-instagram
- All services run in Docker containers via Docker Compose

## How Platform Login Works

Claire uses [mautrix bridges](https://docs.mau.fi/) to connect to messaging platforms through Matrix:

1. **User taps "Connect WhatsApp"** in the Claire app
2. **Server creates a control room** with the WhatsApp bridge bot
3. **Bridge bot sends a QR code** which the app displays
4. **User scans the QR code** with WhatsApp (Settings > Linked Devices > Link a Device)
5. **Bridge confirms login** and starts syncing messages into Matrix rooms
6. **Server converts Matrix events** to unified messages and stores them in Supabase
7. **App displays messages** from all platforms in a unified inbox

Each platform has its own auth method:
- **WhatsApp**: QR code scan or phone pairing code
- **Telegram**: Phone number + SMS verification code
- **Instagram**: Browser cookie extraction

For detailed bridge API docs, see [docs/MATRIX_BRIDGE_REFERENCE.md](docs/MATRIX_BRIDGE_REFERENCE.md) and the [official mautrix docs](https://docs.mau.fi/).

## Production

| Service | URL |
|---|---|
| Claire server | https://claire-production-1450.up.railway.app |
| Supabase API (Kong) | https://kong-production-2679.up.railway.app |
| Supabase Studio | https://supabase-studio-production-b766.up.railway.app |
| Postgres (external) | `hopper.proxy.rlwy.net:46800` user: `supabase_admin` |

See [docs/deployment/PRODUCTION_SETUP.md](docs/deployment/PRODUCTION_SETUP.md) for health checks, EAS env var setup, and CI.

---

## Prerequisites

- Bun 1.0+
- Docker and Docker Compose
- Xcode (for iOS development)

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/l2succes/claire.git
cd claire

# Install dependencies
cd server && bun install
cd ../client && bun install
```

### 2. Start infrastructure

```bash
# Start everything (Supabase + Matrix)
bun run docker:up

# Or start stacks individually
bun run docker:supabase   # Supabase only (PostgreSQL, Kong, GoTrue, PostgREST, Realtime)
bun run docker:matrix     # Matrix only (Synapse + mautrix bridges)
```

| Script | What it does |
|---|---|
| `bun run docker:up` | Start Supabase + Matrix |
| `bun run docker:down` | Stop both stacks |
| `bun run docker:supabase` | Start Supabase stack |
| `bun run docker:supabase:down` | Stop Supabase |
| `bun run docker:supabase:logs` | Tail Supabase logs |
| `bun run docker:matrix` | Start Matrix stack |
| `bun run docker:matrix:down` | Stop Matrix stack |
| `bun run docker:matrix:logs` | Tail Matrix logs |

### 3. Configure environment

```bash
# Server
cp server/.env.example server/.env
# Set: SUPABASE_URL, SUPABASE_ANON_KEY, DATABASE_URL, OPENAI_API_KEY, PLATFORM_MODE=matrix
# Set: MATRIX_HOMESERVER_URL, MATRIX_SERVER_NAME, MATRIX_ADMIN_TOKEN, MATRIX_BOT_USER_ID

# Client
cp client/.env.example client/.env
# Set: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SERVER_URL
```

### 4. Run

```bash
# Both server + client (local infra)
bun run dev

# Server only
bun run dev:server

# Client only (local infra, Expo QR)
bun run dev:client
```

#### Run client against Railway (production backend)

```bash
# Expo QR code (local server + Railway Supabase)
bun run client:prod

# iOS simulator → Railway
bun run client:ios:prod

# Connected device → Railway
bun run client:ios:prod:device
```

| Script | Environment |
|---|---|
| `bun run dev` | Local server + local Supabase |
| `bun run client:prod` | Local server + **Railway** Supabase |
| `bun run client:ios:prod` | Simulator → **Railway** |
| `bun run client:ios:prod:device` | Physical device → **Railway** |

### Building for device / distribution

```bash
cd client
bun run build:dev      # dev client build (EAS, internal)
bun run build:preview  # preview build pointing at Railway (EAS, internal)
bun run build:prod     # production build for App Store (EAS)
```

EAS environment variables are stored in the cloud — no `.env` file needed on CI or a new machine. See [docs/deployment/PRODUCTION_SETUP.md](docs/deployment/PRODUCTION_SETUP.md).

## Project Structure

```
.
├── server/                    # Bun backend
│   └── src/
│       ├── adapters/          # Platform adapters
│       │   ├── matrix/        # Matrix bridge adapter (main)
│       │   │   ├── index.ts         # MatrixBridgeAdapter
│       │   │   ├── event-converter.ts # Matrix -> UnifiedMessage
│       │   │   ├── user-mapper.ts   # Ghost user ID mapping
│       │   │   ├── room-mapper.ts   # Room -> chat mapping
│       │   │   └── types.ts         # Ghost prefixes, bot IDs
│       │   └── index.ts       # PlatformManager
│       ├── services/          # Business logic
│       ├── routes/            # API routes
│       └── config/            # Configuration
├── client/                    # Expo React Native app
│   ├── app/                   # Expo Router screens
│   │   ├── (tabs)/            # Tab screens (dashboard, contacts, settings)
│   │   └── chat/              # Chat detail screen
│   ├── components/            # UI components
│   └── stores/                # Zustand state
├── docker/
│   ├── supabase/              # Supabase Docker Compose + config
│   └── matrix/                # Synapse + mautrix bridges
├── supabase/
│   └── migrations/            # Database migrations
└── docs/
    ├── MATRIX_BRIDGE_REFERENCE.md  # Mautrix API reference
    └── plans/                 # Architecture plans
```

## Documentation

- [Production Setup](docs/deployment/PRODUCTION_SETUP.md) — Railway stack, Supabase dashboard, EAS env vars, CI
- [Railway Deployment](docs/deployment/RAILWAY.md) — Railway service configuration
- [Environment Setup](docs/ENVIRONMENT_SETUP.md) — Local vs device vs production environments
- [Matrix Bridge Reference](docs/MATRIX_BRIDGE_REFERENCE.md) — mautrix bridge API quick reference
- [Matrix Bridge Integration Plan](docs/plans/matrix-bridge-integration.md) — Architecture design
- [Unified Messenger Client Plan](docs/plans/unified-ai-messenger-client.md) — Client implementation
- [Official mautrix docs](https://docs.mau.fi/) — Upstream bridge documentation

## License

MIT
