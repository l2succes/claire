# Use official Bun image
FROM oven/bun:1.1.0-slim

# Install dependencies for Puppeteer
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
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install dependencies with Bun
RUN bun install

# Copy application code
COPY . .

# Expose ports
EXPOSE 3001 8081

# Start the application
CMD ["bun", "run", "dev"]