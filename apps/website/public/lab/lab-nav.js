(() => {
  const links = [
    { id: 'style', href: '/lab/style', label: 'Style guide' },
    { id: 'logo', href: '/lab/logo', label: 'Logo' },
    { id: 'type', href: '/lab/type', label: 'Type' },
    { id: 'mobile', href: '/mockups/mobile', label: 'Mobile' },
    { id: 'ask', href: '/lab/ask', label: 'Ask Claire' },
    { id: 'desktop', href: '/mockups/desktop', label: 'Desktop' },
    { id: 'plugins', href: '/mockups/plugins', label: 'Plugins' },
  ];

  function render() {
    const header = document.querySelector('[data-lab-nav]');
    if (!header) return;

    const active = header.getAttribute('data-lab-nav') || '';
    header.className = 'lab-header';
    header.innerHTML = `
      <a class="lab-brand" href="/lab" target="_top">
        <img class="lab-brand-mark" src="/assets/brand/claire-app-icon-lime.svg" alt="" />
        claire <span>/ lab</span>
      </a>
      <nav class="lab-links" aria-label="Claire Lab">
        ${links
          .map(
            (link) =>
              `<a data-lab-link="${link.id}" href="${link.href}" target="_top"${link.id === active ? ' class="active" aria-current="page"' : ''}>${link.label}</a>`,
          )
          .join('')}
      </nav>
    `;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
