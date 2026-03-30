# Deploying Claire to Railway

This guide covers deploying Claire backend to [Railway](https://railway.app).

## Prerequisites

- Railway account
- Supabase project (for database and auth)
- OpenAI API key

## Quick Start

### 1. Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. Create Project

```bash
cd /path/to/claire
railway init
```

### 3. Add Redis Plugin

In the Railway dashboard:
1. Click **+ New** → **Database** → **Redis**
2. Railway automatically sets `REDIS_URL` for your service

### 4. Configure Environment Variables

In Railway dashboard, add these variables:

| Variable | Value |
|----------|-------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `DATABASE_URL` | Supabase connection string |
| `JWT_SECRET` | Random 32+ char string |
| `ENCRYPTION_KEY` | Random 32 char string |
| `OPENAI_API_KEY` | Your OpenAI API key |
| `PLATFORM_MODE` | `direct` (default) |
| `TELEGRAM_BOT_TOKEN` | (optional) Telegram bot token |

Generate secrets:
```bash
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 16  # For ENCRYPTION_KEY (32 hex chars = 16 bytes)
```

### 5. Deploy

```bash
railway up
```

Or connect your GitHub repo for automatic deployments.

## Architecture Options

### Option 1: Direct Mode (Recommended for Railway)

Best for Railway due to simpler infrastructure:

```
┌─────────────────────────────────────┐
│           Railway                    │
│  ┌─────────────┐  ┌─────────────┐   │
│  │   Claire    │  │    Redis    │   │
│  │   Server    │──│   Plugin    │   │
│  └─────────────┘  └─────────────┘   │
│         │                            │
│    Platform APIs                     │
│  (whatsapp-web.js, telegraf, etc.)  │
└─────────────────────────────────────┘
          │
    External APIs
  (Supabase, OpenAI)
```

**Pros:**
- Lower cost (~$5-20/month)
- Simpler setup
- Lower memory usage

**Cons:**
- WhatsApp needs reconnection after restarts
- We maintain platform integration code

### Option 2: Matrix Mode (Advanced)

For Matrix bridges, you need additional services. This is more complex on Railway.

**Option 2a: Railway + External VPS**
- Run Claire server on Railway
- Run Matrix stack (Synapse + bridges) on a VPS (Hetzner, DigitalOcean)
- Set `MATRIX_HOMESERVER_URL` to your VPS Matrix URL

**Option 2b: Self-hosted Docker**
- Use `docker-compose.prod.yml` with `--profile matrix`
- Not recommended for Railway alone (too many services)

## Resource Recommendations

### Hobby ($5/month)
- 512MB RAM
- Shared CPU
- Good for testing

### Pro ($20/month)
- 2GB RAM
- Dedicated CPU
- Good for production with 1-2 users

### Team ($50+/month)
- 4GB+ RAM
- Multiple replicas
- Good for multiple users

## WhatsApp Session Persistence

WhatsApp sessions need persistent storage. On Railway:

1. **Use Railway Volumes** (recommended):
   - Volumes persist across deploys
   - Configure in `railway.toml` or dashboard

2. **Store sessions in Supabase**:
   - Serialize session data to database
   - Restore on startup

## Monitoring

Railway provides built-in monitoring:

```bash
railway logs      # View logs
railway status    # Check service status
```

Health endpoint: `https://your-app.railway.app/health`

## Troubleshooting

### "Cannot find module" errors
Ensure `bun install` runs during build. Check Dockerfile.

### WhatsApp disconnects after deploy
Sessions are stored in volumes. Check:
```bash
railway volume list
```

### Memory issues
WhatsApp web.js + Puppeteer need ~1GB RAM. Upgrade your plan or use Matrix mode.

### Telegram bot not responding
1. Check `TELEGRAM_BOT_TOKEN` is set
2. Verify bot is not running elsewhere (only one instance allowed)

## Scaling

For horizontal scaling:

1. **Use Matrix mode** - Bridges handle reconnection
2. **Multiple Railway services** - One per platform
3. **Queue architecture** - Redis handles distribution

## Cost Estimate

| Component | Monthly Cost |
|-----------|--------------|
| Railway Pro | $20 |
| Railway Redis | $5 |
| Supabase Free | $0 |
| OpenAI (est.) | $10-50 |
| **Total** | **$35-75** |

## Alternative: Docker Compose Self-Hosting

For full Matrix stack or cost savings, self-host:

```bash
# Direct mode
docker compose -f docker-compose.prod.yml up -d

# Matrix mode
docker compose -f docker-compose.prod.yml --profile matrix up -d
```

Recommended VPS: Hetzner CAX21 (4GB ARM, €7/month)
