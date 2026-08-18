---
title: Repository setup
description: Clone Claire and start mock mode without third-party accounts.
status: current
audience: contributors
owner: maintainers
keywords: setup, bun, mock, clone
last-reviewed: 2026-08-15
---

# Repository setup

Claire’s default contributor path does not require WhatsApp, Telegram, Instagram, Matrix, Supabase Cloud, or a paid AI key.

## 1. Prerequisites

- macOS, Linux, or Windows with WSL2
- [Bun](https://bun.sh) 1.1+
- Docker and Docker Compose (only for the optional real local stack)
- Xcode (iOS) or Android Studio (optional)

Verify:

```bash
bun --version
docker --version
```

## 2. Clone

```bash
git clone https://github.com/l2succes/claire.git
cd claire
```

The mautrix documentation submodule is optional. Initialize it only if you are working on bridges:

```bash
git submodule update --init vendor/mautrix-docs
```

## 3. Safe environment files

`bun run setup` copies example env files if they are missing. It never writes production credentials.

```bash
bun run setup
```

## 4. Mock mode

```bash
bun run dev
```

This starts the API and the Expo mobile/web client. Use `MOCK_BRIDGE=true` for Playwright tests.

## 5. Checks

```bash
bun run test
bun run lint
bun run typecheck
bun run storybook
bun run test:plugins
```

## 6. Repository map

```text
mobile/     Expo iOS, Android, and mobile web
desktop/    Desktop apps (macos/ today)
website/    Marketing site, docs, Storybook
server/     Bun API
packages/   design-system, platform-catalog, plugin-sdk
examples/   Local plugin fixtures
docker/     Local Supabase and Matrix
supabase/   Migrations
docs/       Canonical Markdown
vendor/     Optional upstream docs
```

## 7. Contribution tracks

| Track | Command |
|---|---|
| Website / docs | `bun run dev:website` |
| Mobile | `bun run dev:mobile` |
| Desktop | `bun run dev:desktop` |
| Server | `bun run dev:server` |
| Plugins | `bun run plugin:create my-plugin && bun run test:plugins` |
| Connectors | edit `packages/platform-catalog` then `bun run catalog:generate` |
