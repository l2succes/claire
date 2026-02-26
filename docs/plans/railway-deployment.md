# Railway Deployment Plan

## Overview

Deploy Claire backend to Railway with Redis for queue management. Supports both direct mode (native adapters) and matrix mode (via external Matrix server).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Railway                             │
│                                                          │
│  ┌──────────────────┐      ┌──────────────────┐         │
│  │  Claire Server   │      │   Redis Plugin   │         │
│  │                  │◄────►│                  │         │
│  │  - Express API   │      │  - Job queues    │         │
│  │  - Platform      │      │  - Session cache │         │
│  │    adapters      │      │                  │         │
│  │  - Puppeteer     │      └──────────────────┘         │
│  └────────┬─────────┘                                    │
│           │                                              │
└───────────┼──────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────┐
    │ External APIs │
    │               │
    │ - Supabase    │
    │ - OpenAI      │
    │ - WhatsApp    │
    │ - Telegram    │
    │ - Instagram   │
    └───────────────┘
```

## Files Created

| File | Description |
|------|-------------|
| `Dockerfile` | Multi-stage production build (Bun + Puppeteer) |
| `railway.toml` | Railway deployment configuration |
| `docker-compose.prod.yml` | Production Docker Compose |
| `.env.production.example` | Environment variable template |
| `docs/deployment/RAILWAY.md` | Detailed deployment guide |

## Deployment Steps

### 1. Prerequisites

- Railway account (https://railway.app)
- Supabase project with database
- OpenAI API key
- (Optional) Telegram bot token from @BotFather

### 2. Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 3. Initialize Project

```bash
cd /path/to/claire/.conductor/bismarck
railway init
```

### 4. Add Redis Plugin

In Railway dashboard:
1. Click **+ New** → **Database** → **Redis**
2. `REDIS_URL` is automatically set

### 5. Configure Environment Variables

Set in Railway dashboard or via CLI:

```bash
# Required
railway variables set SUPABASE_URL=https://xxx.supabase.co
railway variables set SUPABASE_ANON_KEY=eyJ...
railway variables set SUPABASE_SERVICE_KEY=eyJ...
railway variables set DATABASE_URL=postgresql://...
railway variables set JWT_SECRET=$(openssl rand -hex 32)
railway variables set ENCRYPTION_KEY=$(openssl rand -hex 16)
railway variables set OPENAI_API_KEY=sk-...

# Platform mode
railway variables set PLATFORM_MODE=direct

# Optional - Telegram
railway variables set TELEGRAM_BOT_TOKEN=123456:ABC...
```

### 6. Deploy

```bash
railway up
```

Or connect GitHub for auto-deploy on push.

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | 32+ character secret for JWT |
| `ENCRYPTION_KEY` | Yes | 32 character encryption key |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `REDIS_URL` | Auto | Set by Railway Redis plugin |
| `PLATFORM_MODE` | No | `direct` (default) or `matrix` |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token |
| `PORT` | No | Server port (default: 3001) |

## Resource Requirements

| Plan | RAM | CPU | Use Case |
|------|-----|-----|----------|
| Hobby | 512MB | Shared | Testing only |
| Pro | 2GB | Dedicated | Production (1-2 users) |
| Team | 4GB+ | Dedicated | Multiple users |

**Note:** WhatsApp adapter with Puppeteer requires ~1GB RAM minimum.

## Cost Breakdown

| Component | Monthly Cost |
|-----------|--------------|
| Railway Pro | $20 |
| Railway Redis | $5 |
| Supabase (Free tier) | $0 |
| OpenAI API (estimate) | $10-50 |
| **Total** | **$35-75** |

## Monitoring & Debugging

```bash
# View logs
railway logs

# Check status
railway status

# Open dashboard
railway open
```

Health endpoint: `https://your-app.railway.app/health`

## Matrix Mode (Advanced)

For Matrix bridge integration:

1. Deploy Matrix stack separately (VPS recommended)
2. Set environment variables:
   ```bash
   railway variables set PLATFORM_MODE=matrix
   railway variables set MATRIX_HOMESERVER_URL=https://matrix.yourserver.com
   railway variables set MATRIX_SERVER_NAME=yourserver.com
   railway variables set MATRIX_ADMIN_TOKEN=syt_...
   ```

See `docs/plans/matrix-bridge-integration.md` for full Matrix setup.

## Local Development

Test the production setup locally:

```bash
# Copy environment file
cp .env.production.example .env
# Edit .env with your values

# Run in direct mode
docker compose -f docker-compose.prod.yml up -d

# Run in matrix mode (includes Synapse + bridges)
docker compose -f docker-compose.prod.yml --profile matrix up -d

# View logs
docker compose -f docker-compose.prod.yml logs -f claire-server

# Stop
docker compose -f docker-compose.prod.yml down
```

## Rollback

If deployment fails:

```bash
# View deployment history
railway deployments

# Rollback to previous
railway rollback
```

## Security Checklist

- [ ] All secrets stored in Railway variables (not in code)
- [ ] `JWT_SECRET` is unique and 32+ characters
- [ ] `ENCRYPTION_KEY` is unique and 32 characters
- [ ] CORS configured for production domain
- [ ] Supabase RLS policies enabled
- [ ] Rate limiting configured
