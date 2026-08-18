---
title: Environment variables
description: Public list of Claire environment variables. No live values.
status: current
audience: contributors
owner: maintainers
keywords: env, secrets
last-reviewed: 2026-08-15
---

# Environment variables

Copy the example files. Never commit real values.

## Server

See `server/.env.example`. Required for a real stack: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`. Matrix mode also needs `MATRIX_HOMESERVER_URL`, `MATRIX_SERVER_NAME`, and `MATRIX_ADMIN_TOKEN`.

## Mobile

See `mobile/.env.example`. Public client values only: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`.

## Website / Ask Claire

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Enables `POST /api/docs/ask`. Without it, the route falls back to search. |
| `CLAIRE_DOCS_ASK_MODEL` | Defaults to `gpt-5.4-mini`. |
| `CLAIRE_DOCS_ASK_MONTHLY_BUDGET_USD` | Defaults to `50`. |

Ask Claire hashes questions and does not persist raw queries.
