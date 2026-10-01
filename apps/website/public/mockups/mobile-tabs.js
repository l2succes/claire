// SPDX-License-Identifier: Apache-2.0
/*
 * Shared mobile tab bar. The middle destination is Claire itself, represented
 * by the kept-thread mark rather than a generic sparkle icon.
 */
// [key, label, heroicon] — matches the shipping app's five tabs.
const mobileTabs = [
  ['home', 'Home', 'home'],
  ['inbox', 'Inbox', 'bubble'],
  ['claire', 'Ask Claire', null],
  ['loops', 'Loops', 'promises'],
  ['profile', 'Profile', 'user-circle'],
];
// Screens drawn before the Loops rename still say active="promises".
const legacyTabs = { promises: 'loops', search: 'profile' };

class ClaireMobileTabs extends HTMLElement {
  connectedCallback() {
    const requested = this.getAttribute('active') ?? 'home';
    const active = legacyTabs[requested] ?? requested;
    const loopCount = this.getAttribute('loops');
    this.classList.add('rf-tabs');
    this.innerHTML = mobileTabs
      .map(([key, label, icon]) => {
        const contents = icon
          ? `<i data-heroicon="${icon}"></i>`
          : '<img src="/assets/brand/claire-mark-ink.svg" alt="" />';
        const count = key === 'loops' && loopCount ? `<span class="rf-count">${loopCount}</span>` : '';
        return `<button type="button" data-tab="${key}" class="${key === active ? 'active' : ''}" aria-label="${label}">${contents}${count}</button>`;
      })
      .join('');
    window.ClaireIcons?.render(this);
  }
}

if (!customElements.get('claire-mobile-tabs')) {
  customElements.define('claire-mobile-tabs', ClaireMobileTabs);
}
