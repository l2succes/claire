# Claire — Quick Start

This is a short local-development checklist. The full contributor path is in [docs/getting-started/repository-setup.md](docs/getting-started/repository-setup.md).

## Prerequisites

- Bun 1.0+
- Docker and Docker Compose
- Xcode (for iOS) or Android Studio (optional)

## Setup

```bash
git clone https://github.com/l2succes/claire.git
cd claire
bun run setup
```

`bun run setup` copies example env files, installs workspace dependencies, and does not require cloud credentials.

## Mock mode

```bash
bun run dev
```

Mock mode starts the API and mobile/web client against local fixtures. It does not need WhatsApp, Telegram, Instagram, Matrix, Supabase Cloud, or a paid AI key.

## Configure a real local stack (optional)

```bash
cp server/.env.example server/.env
cp mobile/.env.example mobile/.env
bun run docker:up
```

Fill `server/.env` with your own local or self-hosted values. Never commit real keys.

## Common commands

```bash
bun run test
bun run lint
bun run typecheck
bun run storybook
```
