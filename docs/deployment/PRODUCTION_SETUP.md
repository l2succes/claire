# Production Setup

This covers the live production stack on Railway, how to access it, and how to keep environment variables in sync across machines and CI.

## What's Running

| Service | URL |
|---|---|
| Claire server | `https://claire-production-1450.up.railway.app` |
| Supabase Kong (API gateway) | `https://kong-production-2679.up.railway.app` |
| Supabase Studio (dashboard) | `https://supabase-studio-production-b766.up.railway.app` |
| Postgres (public proxy) | `hopper.proxy.rlwy.net:46800` |

All services live in the same Railway project (`claire`, project ID `34d5012c`).

---

## Supabase Dashboard

Open the Supabase Studio dashboard in your browser:

```
https://supabase-studio-production-b766.up.railway.app
```

It redirects to `/project/default` — from there you get the full Supabase UI: table editor, SQL editor, auth users, storage, logs, etc.

**Postgres direct access** (psql, TablePlus, etc.):

```
Host:     hopper.proxy.rlwy.net
Port:     46800
User:     supabase_admin
Password: (see Railway → Postgres service → Variables → POSTGRES_PASSWORD)
Database: postgres
```

---

## Testing the Railway Stack

### Quick health check (run from anywhere)

```bash
# Claire server
curl https://claire-production-1450.up.railway.app/health

# Supabase Auth
curl https://kong-production-2679.up.railway.app/auth/v1/health \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY"

# PostgREST — list users table (should return [] on fresh DB)
curl https://kong-production-2679.up.railway.app/rest/v1/users \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY"

# Studio dashboard
curl -sI https://supabase-studio-production-b766.up.railway.app
# Expect: HTTP/2 307
```

### Test auth sign-up end-to-end

```bash
curl -X POST https://kong-production-2679.up.railway.app/auth/v1/signup \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}'
```

### View server logs

```bash
railway logs --service claire
```

---

## EAS Environment Variables

Environment variables for Expo builds are stored in EAS so any machine or CI job can pull them without needing a local `.env.production`.

### First-time setup (only needed once)

Make sure the project is linked:

```bash
cd client
bunx eas whoami          # confirm you're logged in
bunx eas project:info    # confirm project is linked
```

Push the production variables to EAS:

```bash
cd client

# Supabase (Railway-hosted)
bunx eas env:create --scope project --environment production \
  --name EXPO_PUBLIC_SUPABASE_URL \
  --value "https://kong-production-2679.up.railway.app" \
  --type plain

bunx eas env:create --scope project --environment production \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY \
  --value "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc0OTEzNjY5LCJleHAiOjIwOTAyNzM2Njl9.glHh-Me1GZv5KHPuLBk6U3cHJSqv7ERrYtkphk7VTZ8" \
  --type plain

# Claire API
bunx eas env:create --scope project --environment production \
  --name EXPO_PUBLIC_API_URL \
  --value "https://claire-production-1450.up.railway.app" \
  --type plain

bunx eas env:create --scope project --environment production \
  --name EXPO_PUBLIC_ENV \
  --value "production" \
  --type plain
```

Same set for the `preview` environment (used for internal TestFlight-style builds):

```bash
# repeat above four commands, replacing --environment production with --environment preview
```

### Pull to a new machine

```bash
cd client
bunx eas env:pull --environment production   # writes to .env.production
bunx eas env:pull --environment preview      # writes to .env.local
```

### View what's stored

```bash
bunx eas env:list --environment production
```

### Update a value

```bash
bunx eas env:update --environment production --name EXPO_PUBLIC_API_URL \
  --value "https://new-url.up.railway.app"
```

---

## Building for Production

### Simulator build pointing at Railway (local, fast)

```bash
cd client
EXPO_PUBLIC_ENV=production \
EXPO_PUBLIC_API_URL=https://claire-production-1450.up.railway.app \
EXPO_PUBLIC_SUPABASE_URL=https://kong-production-2679.up.railway.app \
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc0OTEzNjY5LCJleHAiOjIwOTAyNzM2Njl9.glHh-Me1GZv5KHPuLBk6U3cHJSqv7ERrYtkphk7VTZ8 \
bunx expo run:ios
```

Or use the `.env.production` file directly:

```bash
cd client
cp .env.production .env.local   # temporarily override
bunx expo run:ios
```

### EAS cloud build (installable on device)

```bash
cd client
bunx eas build --profile preview --platform ios    # internal distribution
bunx eas build --profile production --platform ios # App Store
```

EAS automatically injects the env vars stored under that environment profile.

---

## CI / GitHub Actions

Add these secrets to your GitHub repo (Settings → Secrets):

| Secret | Value |
|---|---|
| `EXPO_TOKEN` | From `bunx eas account:token` |

Then in your workflow:

```yaml
- name: Build iOS
  env:
    EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
  run: |
    cd client
    bunx eas build --profile preview --platform ios --non-interactive
```

EAS pulls environment variables from the cloud automatically — no need to copy secrets into GitHub.

---

## Railway CLI Reference

```bash
railway status                          # project + service info
railway logs --service claire           # server logs
railway logs --service "Gotrue Auth"    # auth service logs
railway logs --service "Supabase Realtime"
railway variable                        # list claire service vars
railway variable set KEY=value          # set a var (triggers redeploy)
railway redeploy --service claire --yes # redeploy claire server
```
