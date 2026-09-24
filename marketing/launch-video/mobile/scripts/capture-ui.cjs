// Captures the phone screens used by the mobile launch video from the
// website's static mockups (apps/website/public/mockups/app-mockups.html).
//
// Each screen is saved as a "base" with the animated parts hidden, plus every
// animated part on its own, at 3x. Positions are phone-local CSS px and are
// printed as JSON; index.html hard-codes them in the LAYOUT table.
//
// Usage (from the repo root, with the website's public dir served on :8765):
//   (cd apps/website/public && python3 -m http.server 8765 --bind 127.0.0.1)
//   node marketing/launch-video/mobile/scripts/capture-ui.cjs marketing/launch-video/mobile/assets/ui
const path = require('path');
const puppeteer = require(process.env.PUPPETEER_CORE || path.resolve(__dirname, '../../../../node_modules/puppeteer-core'));

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE = process.env.MOCKUPS_URL || 'http://127.0.0.1:8765/mockups/app-mockups.html';
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../assets/ui'));

// piece: [selector, index] within the screen's <claire-phone>
const SPECS = {
  'unified-inbox': {
    base: 'ib',
    hide: ['.conversation-row'],
    pieces: { r1: ['.conversation-row', 0], r2: ['.conversation-row', 1], r3: ['.conversation-row', 2], r4: ['.conversation-row', 3] },
  },
  chat: {
    base: 'ch',
    hide: ['.ai-ribbon', '.bubble', '.promise-inline'],
    pieces: { ribbon: ['.ai-ribbon', 0], b1: ['.bubble', 0], b2: ['.bubble', 1], promise: ['.promise-inline', 0], b3: ['.bubble', 2], track: ['.promise-inline button', 0] },
  },
  promises: {
    base: 'pr',
    hide: ['.promise-item'],
    pieces: { p1: ['.promise-item', 0], p2: ['.promise-item', 1], p3: ['.promise-item', 2], p4: ['.promise-item', 3] },
  },
  'search-results': {
    base: 'sr',
    hide: ['.result-query', '.result-count', '.answer-card', '.result-group'],
    pieces: { query: ['.result-query', 0], count: ['.result-count', 0], answer: ['.answer-card', 0], g1: ['.result-group', 0], g2: ['.result-group', 1] },
  },
  'connect-accounts': {
    base: 'ca',
    hide: ['.account-card', '.security-note'],
    pieces: { a1: ['.account-card', 0], a2: ['.account-card', 1], a3: ['.account-card', 2], note: ['.security-note', 0] },
  },
};
// Full, unmodified screens for the gallery shot.
const FULL = ['daily-brief', 'unified-inbox', 'chat', 'ai-copilot', 'promises', 'relationship-memory'];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 3 });
  await page.goto(PAGE, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));
  // The gallery's sticky header and tabs would otherwise paint over the phones.
  await page.evaluate(() => {
    document.querySelectorAll('body *').forEach((e) => {
      if (e.closest('claire-phone')) return;
      const pos = getComputedStyle(e).position;
      if (pos === 'sticky' || pos === 'fixed') e.style.display = 'none';
    });
  });
  const phone = (s) => page.$(`.screen-case[data-screen="${s}"] claire-phone`);

  for (const s of FULL) await (await phone(s)).screenshot({ path: `${OUT}/full-${s}.png` });

  const layout = {};
  for (const [screen, spec] of Object.entries(SPECS)) {
    const ph = await phone(screen);
    await ph.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const L = (layout[spec.base] = {});
    for (const [name, [sel, idx]] of Object.entries(spec.pieces)) {
      const els = await ph.$$(sel);
      const el = els[idx];
      if (!el) throw new Error(`missing ${screen} ${name}: ${sel}[${idx}]`);
      L[name] = await el.evaluate((e) => {
        const p = e.closest('claire-phone').getBoundingClientRect();
        const r = e.getBoundingClientRect();
        return [r.left - p.left, r.top - p.top, r.width, r.height].map((v) => Math.round(v * 10) / 10);
      });
      await el.screenshot({ path: `${OUT}/${spec.base}-${name}.png` });
    }
    await ph.evaluate((e, hide) => hide.forEach((s) => e.querySelectorAll(s).forEach((x) => (x.style.visibility = 'hidden'))), spec.hide);
    await new Promise((r) => setTimeout(r, 150));
    await ph.screenshot({ path: `${OUT}/${spec.base}-base.png` });
    L.size = await ph.evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  }
  console.log(JSON.stringify(layout));
  await browser.close();
})();
