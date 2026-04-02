/**
 * Standalone Chrome/Puppeteer launch test.
 * Mirrors the exact flags used in server/src/adapters/whatsapp/index.ts.
 *
 * Usage (local macOS):
 *   node scripts/test-chrome.mjs
 *
 * Usage (Docker — mirrors Railway):
 *   docker build -t claire-server .
 *   docker run --rm --env-file server/.env claire-server node /app/scripts/test-chrome.mjs
 *
 * Or with a fast one-liner (no full rebuild — mounts the script):
 *   docker run --rm \
 *     -v $(pwd)/scripts/test-chrome.mjs:/app/scripts/test-chrome.mjs \
 *     claire-server node /app/scripts/test-chrome.mjs
 */

import puppeteer from 'puppeteer-core';

const isLinux = process.platform === 'linux';
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

const args = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-crash-reporter',
  '--disable-features=VizDisplayCompositor',
  '--disable-background-networking',
  '--disable-default-apps',
  '--mute-audio',
];

if (isLinux) args.push('--no-zygote');

console.log('Platform:', process.platform);
console.log('Chromium path:', executablePath);
console.log('Args:', args.join(' '));
console.log('Launching...');

try {
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args,
  });

  const version = await browser.version();
  console.log('✅ Chrome launched successfully:', version);
  await browser.close();
  process.exit(0);
} catch (err) {
  console.error('❌ Chrome failed to launch:', err.message);
  process.exit(1);
}
