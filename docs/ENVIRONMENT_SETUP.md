# Environment Setup Guide

Claire runs across three environments. This guide covers switching between them.

## Environments

| Environment | API Server | Supabase | When to use |
|---|---|---|---|
| **local-sim** | `localhost:3001` | `localhost:8000` | Simulator on Mac |
| **local-device** | `192.168.68.101:3001` | `192.168.68.101:8000` | Physical iPhone on same WiFi |
| **production** | Railway (`claire-production-1450.up.railway.app`) | Supabase Cloud | TestFlight / App Store |

---

## Part 1: Supabase — Self-Hosted Setup

The Supabase stack runs locally in Docker (`docker/supabase/`). For the **iOS simulator** this works fine at `localhost:8000`. For the **Railway server** and **physical device**, Supabase needs a public URL.

### Option A: Hetzner VPS (recommended — permanent)

Deploy the Supabase Docker Compose to a cheap VPS so it's always reachable.

**1. Provision a VPS**
- Hetzner CAX11 (~€4/mo, 2GB ARM): https://www.hetzner.com/cloud
- Any Ubuntu 22.04 server works

**2. Copy your Supabase stack to the VPS**
```bash
scp -r docker/supabase/ root@YOUR_VPS_IP:/opt/claire-supabase/
scp supabase/migrations/ root@YOUR_VPS_IP:/opt/claire-supabase/migrations/ -r
ssh root@YOUR_VPS_IP
cd /opt/claire-supabase && docker compose -f docker-compose.supabase.yml up -d
```

**3. Apply migrations**
```bash
ssh root@YOUR_VPS_IP
psql postgresql://postgres:postgres@localhost:5432/postgres \
  -f /opt/claire-supabase/migrations/20250806092049_initial_schema.sql
# repeat for other migration files
```

Your Supabase URL becomes `http://YOUR_VPS_IP:8000`.

---

### Option B: ngrok tunnel (quick, requires Mac to be online)

You already have ngrok installed. This exposes your local Supabase publicly.

**1. Expose Supabase Kong (port 8000)**
```bash
ngrok http 8000
# → gives you https://xxxx.ngrok-free.app
```

**2. Update Railway with the ngrok URL**
```bash
railway variables set \
  SUPABASE_URL="https://xxxx.ngrok-free.app" \
  SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU" \
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
  # Note: DATABASE_URL still uses localhost since Railway can't direct-connect to your Postgres
  # For DB access from Railway, use Supabase REST API (PostgREST) via the ngrok URL
```

> ⚠️ ngrok free tier URLs change every restart. Use a paid ngrok account ($8/mo) for a stable subdomain, or use Cloudflare Tunnel (free with stable URL).

---

### When you get a Supabase Cloud slot

When your free instances expire (or you upgrade), migrate easily:
```bash
# Dump local data
docker exec supabase-db pg_dump -U postgres -d postgres \
  --data-only --no-owner \
  -t messages -t chats -t contacts -t users -t sessions \
  > /tmp/claire_data.sql

# Apply schema + restore to cloud
CLOUD_DB="postgresql://postgres:YOUR_PW@db.YOUR_REF.supabase.co:5432/postgres"
psql "$CLOUD_DB" -f supabase/migrations/20250806092049_initial_schema.sql
psql "$CLOUD_DB" -f supabase/migrations/20260115044104_add_multi_platform_support.sql
psql "$CLOUD_DB" -f supabase/migrations/20260329000001_add_missing_message_columns.sql
psql "$CLOUD_DB" < /tmp/claire_data.sql
```

---

## Part 2: Expo Environment Switching

### File structure

```
client/
  .env                  # Base defaults (committed)
  .env.local            # Your device overrides (NOT committed, gitignored)
  .env.production       # Production keys (NOT committed, gitignored)
  eas.json              # EAS build profiles
```

Expo loads env files in this priority order (later = higher priority):
```
.env → .env.local → .env.development/.env.production
```

### Mode 1: Simulator on Mac (default)

`client/.env` already has `localhost` — just run:

```bash
cd client && bunx expo run:ios
```

### Mode 2: Physical iPhone on WiFi

Your Mac's current IP is `192.168.68.101` (re-run `ipconfig getifaddr en0` if it changes).

Edit `client/.env.local`:
```
EXPO_PUBLIC_API_URL=http://192.168.68.101:3001
EXPO_PUBLIC_SUPABASE_URL=http://192.168.68.101:8000  # or cloud URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_ENV=development
```

Start the server bound to all interfaces:
```bash
# Server already listens on 0.0.0.0:3001 — just start it from server/ dir
cd server && bun run --watch src/index.ts
```

Then run the app — it picks up `.env.local` automatically:
```bash
cd client && bunx expo run:ios --device
```

Or scan the QR code with Expo Go (if using Expo Go instead of custom dev build).

### Mode 3: Production build (Railway + Supabase Cloud)

Uses `eas.json` → `production` profile which sets `EXPO_PUBLIC_API_URL` to Railway.
The `EXPO_PUBLIC_SUPABASE_*` values come from `.env.production`.

```bash
# Install EAS CLI once
npm install -g eas-cli
eas login

# Build for internal testing (TestFlight-style)
cd client && eas build --profile preview --platform ios

# Build for App Store
cd client && eas build --profile production --platform ios
```

---

## Quick Reference

```bash
# Check what env vars the app sees right now
cd client && bunx expo config --type introspect 2>/dev/null | grep EXPO_PUBLIC

# Switch server to use local .env
cd server && bun run --watch src/index.ts

# Switch server to use Railway
# (nothing to do — it's always running at https://claire-production-1450.up.railway.app)

# View Railway logs
railway logs --lines 50

# Redeploy to Railway after a push
git push origin l2succes/unified-ai-messenger
# Railway auto-deploys on push — or manually: railway deployment redeploy --yes
```

---

## Current Status

| Service | URL | Status |
|---|---|---|
| Railway server | `https://claire-production-1450.up.railway.app` | ✅ Live |
| Railway Redis | (managed) | ✅ Connected |
| Supabase (self-hosted) | `localhost:8000` (local only) | ⚠️ Needs public URL for Railway |
| iOS Simulator | `localhost` | ✅ Works today |
| Physical device | `192.168.68.101` | ✅ Works on same WiFi |
