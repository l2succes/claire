// SPDX-License-Identifier: Apache-2.0
/*
 * Shared mobile tab bar. The middle destination is Claire itself, represented
 * by the kept-thread mark rather than a generic sparkle icon.
 */
const mobileTabs = [
  ['home', 'Home'],
  ['inbox', 'Inbox'],
  ['claire', 'Ask Claire'],
  ['promises', 'Promises'],
  ['search', 'Search'],
];

class ClaireMobileTabs extends HTMLElement {
  connectedCallback() {
    const active = this.getAttribute('active') ?? 'home';
    this.innerHTML = mobileTabs
      .map(([icon, label]) => {
        const isClaire = icon === 'claire';
        const contents = isClaire
          ? '<img src="/assets/brand/claire-kept-thread-flipped.svg" alt="" />'
          : `<i data-heroicon="${icon}"></i>`;
        return `<button type="button" data-tab="${icon}" class="${icon === active ? 'active' : ''}" aria-label="${label}">${contents}</button>`;
      })
      .join('');
    window.ClaireIcons?.render(this);
  }
}

if (!customElements.get('claire-mobile-tabs')) {
  customElements.define('claire-mobile-tabs', ClaireMobileTabs);
}
