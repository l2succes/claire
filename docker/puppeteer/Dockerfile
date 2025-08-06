FROM node:18-alpine

# Install Chromium and dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    nodejs \
    yarn

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Create app directory
WORKDIR /app

# Create necessary directories for WhatsApp sessions
RUN mkdir -p /app/session /app/.wwebjs_auth /app/.wwebjs_cache

# Add user so we don't run as root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Set up volume mount points
VOLUME ["/app/session", "/app/.wwebjs_auth", "/app/.wwebjs_cache"]

# Keep container running
CMD ["tail", "-f", "/dev/null"]