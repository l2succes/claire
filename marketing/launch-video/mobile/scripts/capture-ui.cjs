// Captures the phone screens used by the mobile launch video from the
// website's static mockups (apps/website/public/mockups/app-mockups.html),
// using the refreshed `.rf` screens that match the shipping app.
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
    hide: ['.rf-row'],
    pieces: { r1: ['.rf-row', 0], r2: ['.rf-row', 1], r3: ['.rf-row', 2], r4: ['.rf-row', 3] },
  },
  chat: {
    base: 'ch',
    hide: ['.rf-openloop', '.rf-msg'],
    pieces: { loop: ['.rf-openloop', 0], m1: ['.rf-msg', 0], m2: ['.rf-msg', 1], m3: ['.rf-msg', 2], view: ['.rf-openloop em', 0] },
  },
  loops: {
    base: 'lp',
    hide: ['.rf-looprow'],
    pieces: { l1: ['.rf-looprow', 0], l2: ['.rf-looprow', 1], l3: ['.rf-looprow', 2], tabClaire: ['claire-mobile-tabs button', 2] },
  },
  'ask-claire': {
    base: 'ak',
    hide: ['.rf-q', '.rf-a', '.rf-sources', '.rf-srcs', '.rf-askbar > span:first-child'],
    pieces: { q: ['.rf-q', 0], a: ['.rf-a', 0], src: ['.rf-sources', 0], cards: ['.rf-srcs', 0], input: ['.rf-askbar > span:first-child', 0], send: ['.rf-askbar .rf-cbtn', 0] },
  },
  connections: {
    base: 'cn',
    hide: ['.rf-net'],
    pieces: { n1: ['.rf-net', 0], n2: ['.rf-net', 1], n3: ['.rf-net', 2], n4: ['.rf-net', 3] },
  },
};
// Full, unmodified screens for the gallery shot.
const FULL = ['home', 'unified-inbox', 'chat', 'loops', 'ask-claire'];

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
    // Screenshotting a piece that pokes below the fold scrolls the phone's
    // overflow:hidden screen; undo that so the base lines up with the pieces.
    await ph.evaluate((e) => e.querySelectorAll('*').forEach((x) => { x.scrollTop = 0; x.scrollLeft = 0; }));
    await ph.evaluate((e, hide) => hide.forEach((s) => e.querySelectorAll(s).forEach((x) => (x.style.visibility = 'hidden'))), spec.hide);
    await new Promise((r) => setTimeout(r, 150));
    await ph.screenshot({ path: `${OUT}/${spec.base}-base.png` });
    L.size = await ph.evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  }
  console.log(JSON.stringify(layout));
  await browser.close();
})();
