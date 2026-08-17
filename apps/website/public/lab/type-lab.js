/* SPDX-License-Identifier: Apache-2.0 */
/* Claire type lab — swap the base sans/mono across live product mockups. */

const SANS = [
  {
    id: 'inter',
    name: 'Inter',
    google: 'Inter:wght@400;500;600;700',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Rasmus Andersson',
    tag: 'CURRENT',
    note: 'The face Claire ships today. A neutral UI workhorse with a very large x-height — endlessly legible, and so widely used that it reads as “default” rather than as a brand.',
    verdict: 'Safe. Says nothing.',
  },
  {
    id: 'uncut',
    name: 'Uncut Sans',
    local: true,
    license: 'SIL OFL 1.1',
    source: 'Self-hosted · Kasper Nordkvist',
    tag: 'YOUR PICK',
    note: 'A slightly quirky neo-grotesque with a flat, squared skeleton and unusually open apertures. It has real personality at display sizes and still behaves in a 13px conversation row.',
    verdict: 'Distinctive without shouting. The strongest brand argument here.',
  },
  {
    id: 'instrument',
    name: 'Instrument Sans',
    google: 'Instrument+Sans:wght@400;500;600;700',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Instrument',
    note: 'A tight contemporary grotesque built for interfaces. Narrow enough to keep dense lists calm, with crisp uppercase that suits kickers and status pills.',
    verdict: 'The most “2026 indie app” of the set.',
  },
  {
    id: 'schibsted',
    name: 'Schibsted Grotesk',
    google: 'Schibsted+Grotesk:wght@400;500;600;700',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Schibsted',
    note: 'A newsroom grotesque: warm, generously spaced, and engineered for long reading. Headlines feel editorial rather than technical.',
    verdict: 'Best for paragraphs. Slightly soft for a messaging tool.',
  },
  {
    id: 'bricolage',
    name: 'Bricolage Grotesque',
    google: 'Bricolage+Grotesque:opsz,wght@12..96,400..800',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Mathieu Triay',
    note: 'A variable face with an optical-size axis, so the display cut and the caption cut are genuinely different drawings. Expressive, characterful, a little loud.',
    verdict: 'Great display voice. Busy as a whole-product font.',
  },
  {
    id: 'host',
    name: 'Host Grotesk',
    google: 'Host+Grotesk:wght@400;500;600;700',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Ambroise Firmin',
    note: 'A clean modern grotesque with a friendly lowercase and tidy tight tracking. Sits between Inter’s neutrality and Uncut’s quirk.',
    verdict: 'A safe upgrade if Uncut feels too far.',
  },
  {
    id: 'geist',
    name: 'Geist',
    google: 'Geist:wght@400;500;600;700',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Vercel',
    note: 'Vercel’s system face. Very neutral and very technical, with a native mono partner. Currently being trialled elsewhere in this repo.',
    verdict: 'Developer-tool energy. Reads as infrastructure, not as a messenger.',
  },
  {
    id: 'space',
    name: 'Space Grotesk',
    google: 'Space+Grotesk:wght@400;500;600;700',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Florian Karsten',
    note: 'Proportional companion to Space Mono. Odd, technical details and distinctive numerals; strong personality that gets tiring in body copy.',
    verdict: 'Headline-only, realistically.',
  },
  {
    id: 'manrope',
    name: 'Manrope',
    google: 'Manrope:wght@400;500;600;700;800',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Mikhail Sharanda',
    note: 'Geometric and semi-rounded — the closest match to the “friendly rounded geometry” the brand system already describes. Warm without being cute.',
    verdict: 'Most on-brief against the written style guide.',
  },
  {
    id: 'onest',
    name: 'Onest',
    google: 'Onest:wght@400;500;600;700',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Nikita Kudinov',
    note: 'Soft humanist sans with high legibility and a calm rhythm. Feels considerate, which is the adjective the brand keeps reaching for.',
    verdict: 'Human and quiet. Low brand distinctiveness.',
  },
  {
    id: 'familjen',
    name: 'Familjen Grotesk',
    google: 'Familjen+Grotesk:wght@400;500;600;700',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Göran Söderström',
    note: 'A Swedish editorial grotesque with tight default spacing and characterful terminals. Headlines get a printed-magazine quality.',
    verdict: 'Beautiful display, fussier UI.',
  },
  {
    id: 'madefor',
    name: 'Wix Madefor Display',
    google: 'Wix+Madefor+Display:wght@400;500;600;700;800',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · Wix',
    note: 'Engineered specifically for product interfaces — exceptionally clear at 12–14px, deliberately plain at large sizes.',
    verdict: 'Great UI, no display personality.',
  },
  {
    id: 'public',
    name: 'Public Sans',
    google: 'Public+Sans:wght@400;500;600;700',
    license: 'SIL OFL 1.1',
    source: 'Google Fonts · US Web Design System',
    note: 'A strictly neutral, accessibility-first sans. Included as a control: if a candidate does not beat this, it is not worth a migration.',
    verdict: 'The baseline to beat.',
  },
];

const MONO = [
  { id: 'dm-mono', name: 'DM Mono', google: 'DM+Mono:wght@400;500', tag: 'CURRENT' },
  { id: 'geist-mono', name: 'Geist Mono', google: 'Geist+Mono:wght@400;500' },
  { id: 'jetbrains', name: 'JetBrains Mono', google: 'JetBrains+Mono:wght@400;500' },
  { id: 'space-mono', name: 'Space Mono', google: 'Space+Mono:wght@400;700' },
  { id: 'martian', name: 'Martian Mono', google: 'Martian+Mono:wght@400;500' },
  { id: 'fragment', name: 'Fragment Mono', google: 'Fragment+Mono' },
  { id: 'azeret', name: 'Azeret Mono', google: 'Azeret+Mono:wght@400;500' },
  { id: 'plex-mono', name: 'IBM Plex Mono', google: 'IBM+Plex+Mono:wght@400;500' },
];

const STORE = 'claire-type-lab';
const loaded = new Set();

function loadFont(entry) {
  if (!entry || entry.local || loaded.has(entry.id)) return;
  loaded.add(entry.id);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${entry.google}&display=swap`;
  document.head.appendChild(link);
}

function stackFor(entry) {
  return `'${entry.name}', 'Avenir Next', Helvetica, Arial, sans-serif`;
}

function monoStackFor(entry) {
  return `'${entry.name}', 'SFMono-Regular', Consolas, monospace`;
}

const state = {
  sans: SANS[0].id,
  mono: MONO[0].id,
  tracking: -60,
};

function currentSans() {
  return SANS.find((f) => f.id === state.sans) || SANS[0];
}

function currentMono() {
  return MONO.find((f) => f.id === state.mono) || MONO[0];
}

function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
  } catch {
    /* private mode — the lab still works, it just forgets */
  }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (SANS.some((f) => f.id === saved.sans)) state.sans = saved.sans;
    if (MONO.some((f) => f.id === saved.mono)) state.mono = saved.mono;
    if (typeof saved.tracking === 'number') state.tracking = saved.tracking;
  } catch {
    /* ignore */
  }

  // ?sans=uncut&mono=geist-mono&track=-45 wins, so a specific pairing is shareable.
  const params = new URLSearchParams(location.search);
  if (SANS.some((f) => f.id === params.get('sans'))) state.sans = params.get('sans');
  if (MONO.some((f) => f.id === params.get('mono'))) state.mono = params.get('mono');
  const track = Number(params.get('track'));
  if (params.has('track') && !Number.isNaN(track)) state.tracking = track;
}

function apply() {
  const sans = currentSans();
  const mono = currentMono();
  loadFont(sans);
  loadFont(mono);

  const root = document.documentElement;
  root.style.setProperty('--lab-sans', stackFor(sans));
  root.style.setProperty('--lab-mono', monoStackFor(mono));
  root.style.setProperty('--lab-track', `${state.tracking / 1000}em`);

  document.getElementById('now-name').textContent = sans.name;
  document.getElementById('now-note').textContent = sans.note;
  document.getElementById('now-license').textContent = sans.license;
  document.getElementById('now-source').textContent = sans.source;
  document.getElementById('now-mono').textContent = mono.name;

  const verdict = document.getElementById('now-verdict');
  verdict.innerHTML = '';
  if (sans.tag) {
    const tag = document.createElement('b');
    tag.className = 'now-tag';
    tag.textContent = sans.tag;
    verdict.appendChild(tag);
  }
  const line = document.createElement('span');
  line.textContent = sans.verdict;
  verdict.appendChild(line);

  document.getElementById('track-value').textContent = `${(state.tracking / 1000).toFixed(3)}em`;
  document.getElementById('sans-select').value = sans.id;
  document.getElementById('mono-select').value = mono.id;
  document.getElementById('track-range').value = String(state.tracking);

  document.querySelectorAll('.compare-row').forEach((row) => {
    row.classList.toggle('is-active', row.dataset.font === sans.id);
  });

  persist();
}

function fillSelect(el, entries) {
  entries.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.tag ? `${entry.name} — ${entry.tag}` : entry.name;
    el.appendChild(option);
  });
}

function stepSans(delta) {
  const index = SANS.findIndex((f) => f.id === state.sans);
  state.sans = SANS[(index + delta + SANS.length) % SANS.length].id;
  apply();
}

function buildCompare() {
  const list = document.getElementById('compare-list');
  if (list.childElementCount) return;

  SANS.forEach((entry) => {
    loadFont(entry);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'compare-row';
    row.dataset.font = entry.id;
    row.style.fontFamily = stackFor(entry);
    row.innerHTML = `
      <span class="cmp-name">${entry.name}${entry.tag ? ` <em>${entry.tag}</em>` : ''}</span>
      <span class="cmp-display">All your chats. One AI.</span>
      <span class="cmp-ui">
        <b>Maya Kim</b>
        <i>Can you send that deck?</i>
        <u>18 open · 94% · $10</u>
      </span>
    `;
    row.addEventListener('click', () => {
      state.sans = entry.id;
      apply();
      document.querySelector('.now').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    list.appendChild(row);
  });

  list.classList.add('is-loaded');
  document.getElementById('load-all').remove();
  apply();
}

function init() {
  fillSelect(document.getElementById('sans-select'), SANS);
  fillSelect(document.getElementById('mono-select'), MONO);

  restore();
  apply();

  document.getElementById('sans-select').addEventListener('change', (event) => {
    state.sans = event.target.value;
    apply();
  });
  document.getElementById('mono-select').addEventListener('change', (event) => {
    state.mono = event.target.value;
    apply();
  });
  document.getElementById('track-range').addEventListener('input', (event) => {
    state.tracking = Number(event.target.value);
    apply();
  });
  document.getElementById('sans-prev').addEventListener('click', () => stepSans(-1));
  document.getElementById('sans-next').addEventListener('click', () => stepSans(1));
  document.getElementById('load-all').addEventListener('click', buildCompare);
  document.getElementById('reset').addEventListener('click', () => {
    state.sans = SANS[0].id;
    state.mono = MONO[0].id;
    state.tracking = -60;
    apply();
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.matches('select, input, button')) return;
    if (event.key === '[') stepSans(-1);
    if (event.key === ']') stepSans(1);
  });
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init)
  : init();
