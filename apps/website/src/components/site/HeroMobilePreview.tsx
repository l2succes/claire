// SPDX-License-Identifier: Apache-2.0
import { Battery100Icon, WifiIcon } from '@heroicons/react/24/outline';
import { HeroIcon } from './HeroIcon';

export function HeroMobilePreview() {
  return (
    <article className="hero-mobile-preview" aria-label="Ask Claire mobile conversation preview">
      <div className="hero-mobile-status">
        <span>9:41</span>
        <i className="hero-mobile-island" />
        <span className="hero-mobile-status-icons" aria-hidden="true">
          <i className="hero-mobile-signal"><i /><i /><i /><i /></i>
          <WifiIcon />
          <Battery100Icon />
        </span>
      </div>
      <div className="hero-mobile-heading"><h3>Ask Claire</h3><HeroIcon name="compose" /></div>
      <div className="hero-mobile-thread">
        <p className="hero-mobile-question">What did Maya say about launch timing?</p>
        <div className="hero-mobile-answer">
          <div className="hero-mobile-answer-label"><img src="/assets/brand/claire-mark-ink.svg" alt="" /><span>CLAIRE</span></div>
          <p>Maya suggested moving the public launch to September 18 so the support team has one extra week.</p>
          <span className="hero-mobile-source-count">3 source messages <HeroIcon name="arrow-right" /></span>
        </div>
        <div className="hero-mobile-source">
          <b>Maya Kim · WhatsApp</b>
          <p>“Could we move the launch to September 18?”</p>
        </div>
      </div>
      <div className="hero-mobile-composer" aria-hidden="true"><span>Ask a follow-up…</span><HeroIcon name="send" /></div>
      <div className="phone-tabs" aria-label="Mobile navigation preview">
        <span><HeroIcon name="home" /></span>
        <span><HeroIcon name="inbox" /></span>
        <span className="phone-tab-ask phone-tab-active"><img src="/assets/brand/claire-mark-ink.svg" alt="Ask Claire" className="ask-claire-mark" /></span>
        <span><HeroIcon name="promises" /></span>
        <span><HeroIcon name="search" /></span>
      </div>
    </article>
  );
}
