# Claire Backend Server - Production Dockerfile
# Uses Bun runtime with Puppeteer support for WhatsApp web.js

FROM oven/bun:1.1-debian AS base

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
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ============================================
# Dependencies stage
# ============================================
FROM base AS deps

# Copy package files
COPY server/package.json ./

# Install production dependencies
# --no-optional skips better-sqlite3 (only needed for iMessage on macOS)
RUN bun install --production --no-optional

# ============================================
# Build stage
# ============================================
FROM base AS builder

WORKDIR /app

# Copy package files and install dependencies for TypeScript build
# --ignore-scripts skips native module compilation (we only need types)
COPY server/package.json ./
RUN bun install --ignore-scripts

# Copy source code
COPY server/src ./src
COPY server/tsconfig.json ./

# Build the application
RUN bun build src/index.ts --target=bun --outdir=dist

# ============================================
# Production stage
# ============================================
FROM base AS production

WORKDIR /app

# Create non-root user for security
RUN groupadd -r claire && useradd -r -g claire claire

# Create directories for sessions and data
RUN mkdir -p /app/sessions /app/.wwebjs_auth /app/.wwebjs_cache /data \
    && chown -R claire:claire /app /data

# Copy production dependencies from deps stage
COPY --from=deps --chown=claire:claire /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder --chown=claire:claire /app/dist ./dist
COPY --from=builder --chown=claire:claire /app/package.json ./

# Switch to non-root user
USER claire

# Expose server port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Volume for persistent data (WhatsApp sessions, etc.)
VOLUME ["/app/sessions", "/data"]

# Start the server
CMD ["bun", "run", "dist/index.js"]
