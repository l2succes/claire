# Claire Backend Server - Production Dockerfile
# Uses Bun runtime with Puppeteer support for WhatsApp web.js

FROM oven/bun:1.3-debian AS base

# Install dependencies for Puppeteer/Chromium and native module compilation
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    curl \
    build-essential \
    python3 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HOME=/app \
    XDG_CONFIG_HOME=/app/.config

WORKDIR /app

# Workspace manifests required to resolve @claire/server and its local
# @claire/platform-catalog dependency without copying the whole repository.
FROM base AS manifests
COPY package.json bun.lockb ./
COPY apps/client/package.json ./apps/client/package.json
COPY apps/desktop/package.json ./apps/desktop/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY apps/website/package.json ./apps/website/package.json
COPY packages/chat-core/package.json ./packages/chat-core/package.json
COPY packages/design-system/package.json ./packages/design-system/package.json
COPY packages/emails/package.json ./packages/emails/package.json
COPY packages/host/package.json ./packages/host/package.json
COPY packages/platform-catalog/package.json ./packages/platform-catalog/package.json
COPY packages/plugin-sdk/package.json ./packages/plugin-sdk/package.json
COPY packages/shell/package.json ./packages/shell/package.json
COPY packages/tokens/package.json ./packages/tokens/package.json
COPY examples/plugins/calendar/package.json ./examples/plugins/calendar/package.json
COPY examples/plugins/task-manager/package.json ./examples/plugins/task-manager/package.json

FROM manifests AS deps
# Production dependencies; scripts are skipped because better-sqlite3 is optional
# and Puppeteer uses the system Chromium installed above.
RUN bun install --production --ignore-scripts --filter @claire/server

FROM manifests AS builder
# Build dependencies for the server.
RUN bun install --ignore-scripts --filter @claire/server

COPY apps/server/src ./apps/server/src
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY packages/platform-catalog/src ./packages/platform-catalog/src

WORKDIR /app/apps/server
RUN bun build src/index.ts --target=bun --outdir=dist

FROM base AS production

WORKDIR /app

RUN groupadd -r claire && useradd -r -g claire claire
RUN mkdir -p /app/sessions /app/.wwebjs_auth /app/.wwebjs_cache /app/.config /data \
    && chown -R claire:claire /app /data

COPY --from=deps --chown=claire:claire /app/node_modules ./node_modules
# Bun preserves workspace links in node_modules, so include the local dependency.
COPY --from=builder --chown=claire:claire /app/packages/platform-catalog ./packages/platform-catalog
COPY --from=builder --chown=claire:claire /app/apps/server/dist ./dist
COPY --from=builder --chown=claire:claire /app/apps/server/src/routes/email-confirm.html ./dist/routes/email-confirm.html
COPY --from=builder --chown=claire:claire /app/apps/server/package.json ./

USER claire

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/healthz || exit 1

CMD ["bun", "run", "dist/index.js"]
