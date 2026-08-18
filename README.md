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

See [docs/deployment/PRODUCTION_SETUP.md](docs/deployment/PRODUCTION_SETUP.md) for a generic production checklist. Live hostnames and operator credentials are not published in this repository.

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
bun run setup
bun run dev
```

`bun run setup` copies example env files and installs workspaces. Mock mode does not need WhatsApp, Telegram, Instagram, Matrix, Supabase Cloud, or a paid AI key. Details: [docs/getting-started/repository-setup.md](docs/getting-started/repository-setup.md).

To run the optional real local stack instead:

### 2. Start infrastructure

```bash
# Start everything (Supabase + Matrix)
bun run docker:up

# Or start stacks individually
bun run docker:supabase   # Supabase only (PostgreSQL, Kong, GoTrue, PostgREST, Realtime)
bun run docker:matrix     # Matrix only (Synapse + mautrix bridges)
```

| Script                         | What it does            |
| ------------------------------ | ----------------------- |
| `bun run docker:up`            | Start Supabase + Matrix |
| `bun run docker:down`          | Stop both stacks        |
| `bun run docker:supabase`      | Start Supabase stack    |
| `bun run docker:supabase:down` | Stop Supabase           |
| `bun run docker:supabase:logs` | Tail Supabase logs      |
| `bun run docker:matrix`        | Start Matrix stack      |
| `bun run docker:matrix:down`   | Stop Matrix stack       |
| `bun run docker:matrix:logs`   | Tail Matrix logs        |

### 3. Configure environment

```bash
# Server
cp server/.env.example server/.env
# Set: SUPABASE_URL, SUPABASE_ANON_KEY, DATABASE_URL, OPENAI_API_KEY, PLATFORM_MODE=matrix
# Set: MATRIX_HOMESERVER_URL, MATRIX_SERVER_NAME, MATRIX_ADMIN_TOKEN, MATRIX_BOT_USER_ID

# Mobile
cp mobile/.env.example mobile/.env
# Set: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SERVER_URL
```

### 4. Run

```bash
# Both server + client (local infra)
bun run dev

# Server only
bun run dev:server

# Mobile only (local infra, Expo QR)
bun run dev:mobile
```

#### Run client against Railway (production backend)

```bash
# Expo QR code (local server + Railway Supabase)
bun run mobile:prod

# iOS simulator → Railway
bun run mobile:ios:prod

# Connected device → Railway
bun run mobile:ios:prod:device
```

| Script                           | Environment                         |
| -------------------------------- | ----------------------------------- |
| `bun run dev`                    | Local server + local Supabase       |
| `bun run mobile:prod`            | Local server + **Railway** Supabase |
| `bun run mobile:ios:prod`        | Simulator → **Railway**             |
| `bun run mobile:ios:prod:device` | Physical device → **Railway**       |

### Building for device / distribution

```bash
cd mobile
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
├── mobile/                    # Expo iOS, Android, and mobile web
├── apps/desktop/              # Electron desktop app
├── website/                   # Marketing site, docs, Storybook
├── packages/                  # design-system, platform-catalog, plugin-sdk
├── examples/plugins/          # Local fixture plugins
├── docker/
│   ├── supabase/              # Supabase Docker Compose + config
│   └── matrix/                # Synapse + mautrix bridges
├── supabase/
│   └── migrations/            # Database migrations
├── docs/                      # Canonical Markdown consumed by /docs
└── vendor/mautrix-docs        # Optional upstream docs submodule
```

## Documentation

- [Repository setup](docs/getting-started/repository-setup.md) — clone, `bun run setup`, mock mode
- [Production Setup](docs/deployment/PRODUCTION_SETUP.md) — generic production checklist (no live hosts)
- [Railway Deployment](docs/deployment/RAILWAY.md) — Railway service configuration
- [Environment Setup](docs/ENVIRONMENT_SETUP.md) — Local vs device vs production environments
- [Matrix Bridge Reference](docs/MATRIX_BRIDGE_REFERENCE.md) — mautrix bridge API quick reference
- [Matrix Bridge Integration Plan](docs/plans/matrix-bridge-integration.md) — Architecture design
- [Unified Messenger Client Plan](docs/plans/unified-ai-messenger-client.md) — Client implementation
- [Desktop App Implementation Spec](docs/DESKTOP_APP_IMPLEMENTATION_SPEC.md) — React Native macOS architecture, local bridge hosting, phases, and acceptance criteria
- [Design System Migration Guide](docs/DESIGN_SYSTEM_MIGRATION_GUIDE.md) — Incremental migration of the Expo app and shared desktop primitives
- [Platform Connector Roadmap](docs/PLATFORM_CONNECTOR_ROADMAP.md) — 16-network catalog, desktop setup classes, rollout waves, and privacy gates
- [AI Platform & Self-Hosting Spec](docs/AI_PLATFORM_AND_SELF_HOSTING_SPEC.md) — Community/Cloud packaging, BYOK and local models, billing, privacy, and provider-neutral architecture
- [Payments & AI Credits Spec](docs/PAYMENTS_AND_AI_CREDITS_SPEC.md) — Claire Plus consumer subscription, prepaid managed-AI credits, BYOK, ledger, entitlements, and payment controls
- [Security Claims & Validation Roadmap](docs/SECURITY_CLAIMS_AND_ROADMAP.md) — Current public claims, data boundaries, and evidence gates for stronger privacy statements
- [Claire Plugin System Spec](docs/CLAIRE_PLUGIN_SYSTEM_SPEC.md) — Plugin manifests, permissions, conversation triggers, approvals, execution, audit, and rollout
- [Interactive Product Mockups](landing/README.md) — Landing page, mobile screens, desktop screens, and visual style guide
- [Official mautrix docs](https://docs.mau.fi/) — Upstream bridge documentation

## License

Claire uses a split license:

- **AGPL-3.0-only** for `server/`, `docker/`, `supabase/`, and operational service code
- **Apache-2.0** for `mobile/`, `desktop/`, `website/`, `packages/`, `examples/`, and public documentation

See [LICENSE](LICENSE), [LICENSES/](LICENSES/), and [NOTICE](NOTICE). The Claire name and marks are reserved; see [TRADEMARKS.md](TRADEMARKS.md).
