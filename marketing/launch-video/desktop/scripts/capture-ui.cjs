// Captures the desktop product screens used by the launch video from the
// website's static mockups (apps/website/public/mockups/desktop-mockups.html).
//
// Each screen is saved twice: a "base" with the animated parts hidden, and
// every animated part on its own, so the video can build the UI up over the
// real screen. Positions are window-local CSS px (the window is 1360×765) and
// are printed as JSON; index.html hard-codes them in UW / AK / CN.
//
// Usage (from the repo root, with the website's public dir served on :8765):
//   (cd apps/website/public && python3 -m http.server 8765 --bind 127.0.0.1)
//   node marketing/launch-video/desktop/scripts/capture-ui.cjs marketing/launch-video/desktop/assets/ui
const path = require('path');
const puppeteer = require(path.resolve(__dirname, '../../../../node_modules/puppeteer-core'));

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE = process.env.MOCKUPS_URL || 'http://127.0.0.1:8765/mockups/desktop-mockups.html';
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '../assets/ui'));

const SPECS = {
  'unified-workspace': {
    base: 'uw',
    hide: ['.desk-ai-bar', '.desk-bubble', '.desk-promise', '.desk-context .context-task'],
    deactivate: '.desk-conversation.active',
    pieces: { row: '.desk-conversation.active', aibar: '.desk-ai-bar', b1: '.desk-bubble:nth-of-type(2)', b2: '.desk-bubble.out', promise: '.desk-promise', b3: '.desk-promise + .desk-bubble', ctask: '.desk-context .context-task', track: '.desk-promise button' },
  },
  'ask-claire-workspace': {
    base: 'ak',
    hide: ['.ask-suggestion', '.ask-evidence-card'],
    clearInput: '.ask-composer input',
    pieces: { sug: '.ask-suggestion', ev1: '.ask-evidence-card:nth-of-type(1)', ev2: '.ask-evidence-card:nth-of-type(2)', ev3: '.ask-evidence-card.sources', input: '.ask-composer input', send: '.ask-composer button' },
  },
  connections: {
    base: 'cn',
    hide: ['.connection-card', '.connection-banner'],
    pieces: { banner: '.connection-banner', c1: '.connection-card:nth-of-type(1)', c2: '.connection-card:nth-of-type(2)', c3: '.connection-card:nth-of-type(3)', c4: '.connection-card:nth-of-type(4)', c5: '.connection-card:nth-of-type(5)', c6: '.connection-card:nth-of-type(6)' },
  },
};
// Full, unmodified screens for the gallery shot.
const FULL = ['unified-workspace', 'ask-claire-workspace', 'desktop-home'];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  await page.goto(PAGE, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1000));

  for (const screen of FULL) {
    await (await page.$(`.frame-case[data-screen="${screen}"] .mac-window`)).screenshot({ path: `${OUT}/${screen}.png` });
  }

  const layout = {};
  for (const [screen, spec] of Object.entries(SPECS)) {
    const fc = `.frame-case[data-screen="${screen}"]`;
    const win = await page.$(`${fc} .mac-window`);
    const L = (layout[spec.base] = {});
    for (const [name, sel] of Object.entries(spec.pieces)) {
      const el = await page.$(`${fc} ${sel}`);
      if (!el) throw new Error(`missing ${screen} ${name}: ${sel}`);
      // Measure against the window in one pass so page scrolling cannot skew it.
      L[name] = await el.evaluate((e, fc) => {
        const w = document.querySelector(fc + ' .mac-window').getBoundingClientRect();
        const r = e.getBoundingClientRect();
        return [r.left - w.left, r.top - w.top, r.width, r.height].map((v) => Math.round(v * 10) / 10);
      }, fc);
      if (name !== 'input') await el.screenshot({ path: `${OUT}/${spec.base}-${name}.png` });
    }
    await page.evaluate((fc, spec) => {
      const root = document.querySelector(fc);
      spec.hide.forEach((s) => root.querySelectorAll(s).forEach((e) => (e.style.visibility = 'hidden')));
      if (spec.deactivate) root.querySelectorAll(spec.deactivate).forEach((e) => e.classList.remove('active'));
      if (spec.clearInput) { const i = root.querySelector(spec.clearInput); i.value = ''; i.placeholder = ''; }
    }, fc, spec);
    await new Promise((r) => setTimeout(r, 200));
    await win.screenshot({ path: `${OUT}/${spec.base}-base.png` });
  }
  console.log(JSON.stringify(layout, null, 1));
  await browser.close();
})();
