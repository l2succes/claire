// SPDX-License-Identifier: Apache-2.0
/*
 * Shared desktop navigation rail. The live desktop gallery and every docs
 * embed use this element, so navigation order, active state, and Claire mark
 * cannot drift between mockups.
 */
const tabs = [
  ['home', 'Home'],
  ['inbox', 'Inbox'],
  ['promises', 'Promises'],
  ['sparkles', 'Ask Claire'],
  ['people', 'People'],
  ['chat', 'Connections'],
];

class ClaireDesktopTabs extends HTMLElement {
  connectedCallback() {
    const active = this.getAttribute('active') ?? 'home';
    const workspace = this.getAttribute('variant') === 'workspace';
    const visibleTabs = workspace ? [...tabs.slice(0, 4), ['search', 'Search']] : tabs;
    const tabButtons = visibleTabs
      .map(
        ([icon, label]) =>
          `<button class="desktop-tabs__tab${icon === active ? ' active' : ''}" aria-label="${label}"><i data-heroicon="${icon}"></i></button>`,
      )
      .join('');
    const networks = workspace
      ? `<div class="desktop-tabs__divider"></div>
         <div class="desktop-tabs__networks" aria-label="Connected networks">
           <span style="color: #27ae60">●</span><span style="color: #3399db">●</span><span style="color: #cf4f87">●</span><span style="color: #2e7cff">●</span>
         </div>`
      : '';

    this.innerHTML = `<img class="desktop-tabs__mark" src="/assets/brand/claire-app-icon-lime.svg" alt="Claire" />
      <nav class="desktop-tabs__nav" aria-label="Primary navigation">${tabButtons}</nav>
      ${networks}
      <div class="desktop-tabs__spacer"></div>
      <button class="desktop-tabs__tab" aria-label="Settings"><i data-heroicon="settings"></i></button>
      <div class="desktop-tabs__avatar" aria-label="Luc Medina">LM</div>`;

    window.ClaireIcons?.render(this);
  }
}

if (!customElements.get('claire-desktop-tabs')) {
  customElements.define('claire-desktop-tabs', ClaireDesktopTabs);
}
