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
    # Build tools for native modules (better-sqlite3, etc.)
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HOME=/app \
    XDG_CONFIG_HOME=/app/.config

WORKDIR /app

# ============================================
# Dependencies stage
# ============================================
FROM base AS deps

# Install from the workspace root: the server depends on
# @claire/platform-catalog via a workspace dependency.
COPY package.json bun.lockb ./
COPY server/package.json ./server/package.json
COPY packages/platform-catalog/package.json ./packages/platform-catalog/package.json

# Install production dependencies
# --ignore-scripts prevents better-sqlite3 from compiling native binaries in Docker
# (it's an optional dep only used for iMessage on macOS, PUPPETEER_SKIP_CHROMIUM_DOWNLOAD handles puppeteer)
RUN bun install --production --ignore-scripts --filter @claire/server

# ============================================
# Build stage
# ============================================
FROM base AS builder

WORKDIR /app

# Copy workspace manifests and install the server's build dependencies.
# --ignore-scripts skips native module compilation (we only need types).
COPY package.json bun.lockb ./
COPY server/package.json ./server/package.json
COPY packages/platform-catalog/package.json ./packages/platform-catalog/package.json
RUN bun install --ignore-scripts --filter @claire/server

# Copy source code, including the workspace package imported by the server.
COPY server/src ./server/src
COPY server/tsconfig.json ./server/tsconfig.json
COPY packages/platform-catalog/src ./packages/platform-catalog/src

# Build the application
WORKDIR /app/server
RUN bun build src/index.ts --target=bun --outdir=dist

# ============================================
# Production stage
# ============================================
FROM base AS production

WORKDIR /app

# Create non-root user for security
RUN groupadd -r claire && useradd -r -g claire claire

# Create directories for sessions and data
RUN mkdir -p /app/sessions /app/.wwebjs_auth /app/.wwebjs_cache /app/.config /data \
    && chown -R claire:claire /app /data

# Copy production dependencies from deps stage
COPY --from=deps --chown=claire:claire /app/node_modules ./node_modules

# Preserve the workspace target for the node_modules symlink created by Bun.
COPY --from=builder --chown=claire:claire /app/packages/platform-catalog ./packages/platform-catalog

# Copy built application from builder stage
COPY --from=builder --chown=claire:claire /app/server/dist ./dist
COPY --from=builder --chown=claire:claire /app/server/src/routes/email-confirm.html ./dist/routes/email-confirm.html
COPY --from=builder --chown=claire:claire /app/server/package.json ./

# Switch to non-root user
USER claire

# Expose server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/healthz || exit 1

# Start the server
CMD ["bun", "run", "dist/index.js"]
