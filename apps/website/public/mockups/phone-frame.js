// SPDX-License-Identifier: Apache-2.0
/*
 * Shared mobile-device component for the live mockup gallery and docs embeds.
 * It deliberately stays light-DOM: each screen can supply its own rich markup
 * while the visual container, canonical viewport, and scale stay owned in one
 * place. Child markup is moved into a fixed iPhone viewport and the whole
 * device is proportionally transformed — it is never squeezed by its parent.
 */
class ClairePhone extends HTMLElement {
  connectedCallback() {
    this.setAttribute('data-component', 'claire-phone');
    if (!this.querySelector(':scope > .claire-phone__canvas')) {
      const hasScreenIsland = Array.from(this.children).some((child) => child.classList?.contains('island'));
      const canvas = document.createElement('div');
      const viewport = document.createElement('div');
      canvas.className = 'claire-phone__canvas';
      viewport.className = 'claire-phone__viewport';

      while (this.firstChild) viewport.append(this.firstChild);
      canvas.append(viewport);
      if (!hasScreenIsland) {
        const island = document.createElement('div');
        island.className = 'claire-phone__island';
        island.setAttribute('aria-hidden', 'true');
        canvas.append(island);
      }
      this.append(canvas);
    }

    this.updateScale = this.updateScale.bind(this);
    this.resizeObserver = new ResizeObserver(this.updateScale);
    if (this.parentElement) this.resizeObserver.observe(this.parentElement);
    this.updateScale();
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  static get observedAttributes() {
    return ['scale'];
  }

  attributeChangedCallback() {
    this.updateScale?.();
  }

  updateScale() {
    const requested = Number(this.getAttribute('scale') || 1);
    const safeRequested = Number.isFinite(requested) && requested > 0 ? requested : 1;
    const frameWidth = 409;
    const available = this.parentElement?.getBoundingClientRect().width || frameWidth * safeRequested;
    const scale = Math.min(safeRequested, available / frameWidth);
    this.style.setProperty('--claire-phone-render-scale', String(scale));
  }
}

if (!customElements.get('claire-phone')) {
  customElements.define('claire-phone', ClairePhone);
}
