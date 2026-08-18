---
title: Self-hosting
description: Run Claire on your own infrastructure without publishing operator secrets.
status: current
audience: operators
owner: maintainers
keywords: self-host, docker, railway
last-reviewed: 2026-08-15
---

# Self-hosting

1. Copy `server/.env.example` and set your own values.
2. Start local or remote Docker stacks with `bun run docker:up` or your compose files.
3. Apply `supabase/migrations/` to your database.
4. Point mobile/desktop clients at your API origin.

Public docs do not include live production hostnames. See [docs/deployment/PRODUCTION_SETUP.md](../deployment/PRODUCTION_SETUP.md) and [docs/deployment/RAILWAY.md](../deployment/RAILWAY.md).
