const catalogPayload = window.CLAIRE_PLATFORM_CATALOG;

const setupIcons = {
  phone: 'phone',
  desktop: 'desktop',
  mac: 'desktop',
};

const supportLabels = {
  available: 'AVAILABLE',
  beta: 'BETA',
  planned: 'PLANNED',
  unavailable: 'UNAVAILABLE',
};

const deliveryLabels = {
  current: 'Current',
  wave_1: 'Wave 1',
  wave_2: 'Wave 2',
  wave_3: 'Wave 3',
  parallel_mac: 'Mac track',
};

const createPlatformMark = (platform) => {
  const mark = document.createElement('span');
  mark.className = `platform-mark ${platform.iconTreatment || 'knockout'}`;
  mark.style.setProperty('--platform-accent', platform.accent);
  mark.textContent = platform.mark;
  mark.setAttribute('aria-hidden', 'true');

  if (platform.iconUrl) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('load', () => mark.classList.add('has-image'), { once: true });
    image.addEventListener('error', () => image.remove(), { once: true });
    image.src = platform.iconUrl;
    mark.append(image);
  }
  return mark;
};

const renderPlatformRail = (platforms) => {
  const rail = document.querySelector('#platform-rail');
  if (!rail) return;

  const fragment = document.createDocumentFragment();
  for (let copy = 0; copy < 2; copy += 1) {
    platforms.forEach((platform) => {
      const item = document.createElement('span');
      item.className = 'rail-platform';
      if (copy === 1) item.setAttribute('aria-hidden', 'true');
      item.append(createPlatformMark(platform), document.createTextNode(platform.name));
      fragment.append(item);
    });
  }
  rail.replaceChildren(fragment);
};

const renderPlatformCatalog = (platforms) => {
  const grid = document.querySelector('#platform-grid');
  if (!grid) return;

  const fragment = document.createDocumentFragment();
  platforms.forEach((platform) => {
    const card = document.createElement('article');
    card.className = 'platform-card';
    card.dataset.supportStatus = platform.supportStatus;
    card.dataset.setupSurface = platform.setupSurface;
    card.dataset.deviceDependency = platform.deviceDependency;

    const header = document.createElement('div');
    header.className = 'platform-card-header';
    const status = document.createElement('span');
    status.className = `status-pill ${platform.supportStatus}`;
    status.textContent = supportLabels[platform.supportStatus];
    header.append(createPlatformMark(platform), status);

    const title = document.createElement('h3');
    title.textContent = platform.name;
    const bridge = document.createElement('p');
    bridge.className = 'platform-bridge';
    bridge.textContent = platform.bridge;

    const setup = document.createElement('p');
    setup.className = 'platform-setup';
    const setupIcon = document.createElement('span');
    setupIcon.className = 'platform-setup-icon';
    setupIcon.dataset.heroicon = setupIcons[platform.setupSurface];
    setupIcon.setAttribute('aria-hidden', 'true');
    setup.append(setupIcon, document.createTextNode(platform.setupLabel));

    const footer = document.createElement('div');
    footer.className = 'platform-card-footer';
    const runtime = document.createElement('span');
    runtime.className = 'platform-runtime';
    const runtimeDot = document.createElement('span');
    runtimeDot.textContent = '●';
    runtime.append(runtimeDot, document.createTextNode(platform.runtimeLabel));

    const detailId = `platform-details-${platform.id}`;
    const toggle = document.createElement('button');
    toggle.className = 'platform-detail-toggle';
    toggle.type = 'button';
    toggle.textContent = 'Details +';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', detailId);
    toggle.setAttribute('aria-label', `Show ${platform.name} connection details`);
    footer.append(runtime, toggle);

    const details = document.createElement('div');
    details.className = 'platform-details';
    details.id = detailId;
    details.hidden = true;
    const summary = document.createElement('p');
    summary.textContent = platform.detail;
    const definitionList = document.createElement('dl');
    [
      ['Sign-in', platform.authSummary],
      ['Delivery', deliveryLabels[platform.deliveryWave]],
    ].forEach(([term, description]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = description;
      definitionList.append(dt, dd);
    });
    const docsLink = document.createElement('a');
    docsLink.className = 'platform-doc-link';
    docsLink.href = platform.docsUrl;
    docsLink.target = '_blank';
    docsLink.rel = 'noreferrer';
    docsLink.textContent = 'Official bridge docs ↗';
    const iconLink = document.createElement('a');
    iconLink.className = 'platform-doc-link';
    iconLink.href = platform.iconSourceUrl;
    iconLink.target = '_blank';
    iconLink.rel = 'noreferrer';
    iconLink.textContent =
      platform.iconTreatment === 'generic' ? 'Protocol icon source ↗' : 'Brand icon source ↗';
    details.append(summary, definitionList, docsLink, iconLink);

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.setAttribute(
        'aria-label',
        `${expanded ? 'Show' : 'Hide'} ${platform.name} connection details`
      );
      toggle.textContent = expanded ? 'Details +' : 'Hide −';
      details.hidden = expanded;
      card.classList.toggle('is-expanded', !expanded);
    });

    card.append(header, title, bridge, setup, footer, details);
    fragment.append(card);
  });
  grid.replaceChildren(fragment);
};

const matchesCatalogFilter = (card, filter) => {
  if (filter === 'all') return true;
  if (filter === 'available') return card.dataset.supportStatus === 'available';
  if (filter === 'planned') return card.dataset.supportStatus === 'planned';
  if (filter === 'desktop') return card.dataset.setupSurface === 'desktop';
  if (filter === 'device') {
    return ['always_on_mac', 'android_phone_online'].includes(card.dataset.deviceDependency);
  }
  return true;
};

const setupCatalogFilters = () => {
  const buttons = document.querySelectorAll('[data-platform-filter]');
  const count = document.querySelector('#catalog-count');
  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      const filter = button.dataset.platformFilter;
      buttons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-pressed', String(isActive));
      });

      let visibleCount = 0;
      document.querySelectorAll('.platform-card').forEach((card) => {
        const visible = matchesCatalogFilter(card, filter);
        card.hidden = !visible;
        if (visible) visibleCount += 1;
      });
      if (count)
        count.textContent = `Showing ${visibleCount} ${visibleCount === 1 ? 'network' : 'networks'}`;
    })
  );
};

if (catalogPayload?.platforms?.length) {
  renderPlatformRail(catalogPayload.platforms);
  renderPlatformCatalog(catalogPayload.platforms);
  setupCatalogFilters();
}

document.querySelectorAll('.copy-button').forEach((button) =>
  button.addEventListener('click', async () => {
    const original = button.textContent,
      text = document.getElementById(button.dataset.copyTarget).textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied ✓';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById(button.dataset.copyTarget));
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      button.textContent = 'Selected';
    }
    window.setTimeout(() => {
      button.textContent = original;
    }, 1800);
  })
);
document.querySelectorAll('details').forEach((detail) =>
  detail.addEventListener('toggle', () => {
    if (detail.open)
      document.querySelectorAll('details').forEach((other) => {
        if (other !== detail) other.open = false;
      });
  })
);
