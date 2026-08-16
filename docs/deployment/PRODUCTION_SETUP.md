# Production Setup

This is the public checklist for deploying Claire. Live hostnames, project IDs, database proxies, and operator runbooks belong in a private operations repository, not this tree.

## Required services

- Claire API (`server/`)
- Postgres + Auth + Realtime (self-hosted Supabase or a managed Supabase project)
- Redis
- Optional: Matrix (Synapse + mautrix bridges) when `PLATFORM_MODE=matrix`

## Environment variables

Copy `.env.production.example` and `server/.env.example`. Set real values in your host’s secret store (Railway, Vercel, EAS, or equivalent). Never commit production values.

Minimum server variables:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | API gateway for Auth/PostgREST/Realtime |
| `SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_KEY` | Server-only service-role key |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Session signing secret |
| `ENCRYPTION_KEY` | Token encryption at rest |
| `OPENAI_API_KEY` | Optional; mock mode does not need this |
| `PLATFORM_MODE` | `matrix` or `direct` |
| `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` | Queue and session cache |

Minimum mobile variables (EAS or local `.env.production`, never committed):

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Same API gateway the app can reach |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `EXPO_PUBLIC_API_URL` | Public Claire API origin |
| `EXPO_PUBLIC_ENV` | `production` |

## Health checks

Replace the placeholders with your deployed origins:

```bash
curl https://<claire-api-host>/health

curl https://<supabase-kong-host>/auth/v1/health \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"
```

## EAS environment variables

Store mobile production values in EAS so CI machines do not need a local `.env.production`.

```bash
cd mobile
bunx eas env:create --scope project --environment production \
  --name EXPO_PUBLIC_SUPABASE_URL \
  --value "$EXPO_PUBLIC_SUPABASE_URL" \
  --type plain
```

Repeat for `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`, and `EXPO_PUBLIC_ENV`. Pull on a new machine with `bunx eas env:pull --environment production`.

## Builds

```bash
cd mobile
bunx eas build --profile preview --platform ios
bunx eas build --profile production --platform ios
```

## Operator notes

Database passwords, Railway project IDs, proxy hosts, and incident runbooks must stay in private ops docs. If you find a live credential or hostname in this repository, treat it as exposed: rotate it and open a security issue.
