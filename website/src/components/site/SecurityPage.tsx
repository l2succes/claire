// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import { HeroIcon } from '@/components/site/HeroIcon';
import { PlatformCluster, PlatformIcon } from '@/components/site/PlatformMark';
import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';

export function SecurityPage() {
  return (
    <div className="security-page">
      <SiteHeader active="Security" />
      <main>
        <section className="security-hero shell">
          <div>
            <div className="eyebrow">
              <span className="status-dot" />
              Security & privacy
            </div>
            <h1>
              Clear boundaries.
              <br />
              <span>Real accountability.</span>
            </h1>
            <div className="security-hero-networks" aria-label="Connected networks keep their own security model">
              <PlatformCluster
                items={[
                  { id: 'whatsapp' },
                  { id: 'telegram' },
                  { id: 'instagram' },
                  { id: 'imessage' },
                ]}
              />
            </div>
          </div>
          <aside className="security-hero-aside">
            <div className="security-hero-mark">
              <HeroIcon name="shield" size="xl" />
            </div>
            <p>
              Security should make the product easier to understand—not hide its trade-offs behind a
              badge.
            </p>
          </aside>
        </section>
        <section className="security-statement shell" aria-labelledby="boundary-title">
          <div className="security-statement-mark">
            <HeroIcon name="lock" size="xl" />
          </div>
          <div>
            <div className="kicker">THE IMPORTANT PART</div>
            <h2 id="boundary-title">
              Claire is not an end-to-end-encrypted, zero-knowledge messenger today.
            </h2>
            <p>
              To unify conversations, provide search, and answer questions with AI, Claire
              synchronizes message data through its own service. Connected networks continue to apply
              their own security and encryption model. When an AI feature runs, selected conversation
              context may be sent to the configured AI provider.
            </p>
          </div>
        </section>
        <section className="security-controls shell" aria-labelledby="controls-title">
          <div className="security-section-heading">
            <div>
              <div className="kicker">WHAT WE CAN SAY TODAY</div>
              <h2 id="controls-title">Controls in the current product.</h2>
            </div>
            <p>
              These are implementation-backed product controls, not a substitute for a completed
              independent security assessment.
            </p>
          </div>
          <div className="security-control-grid">
            <article>
              <span>
                <HeroIcon name="people" size="xl" />
              </span>
              <h3>Authenticated account access</h3>
              <p>Protected application routes verify the signed-in account before serving private data.</p>
            </article>
            <article>
              <span>
                <HeroIcon name="server" size="xl" />
              </span>
              <h3>Production API guardrails</h3>
              <p>
                The API uses security headers, a production origin allowlist, and separate rate limits
                for login and AI routes.
              </p>
            </article>
            <article>
              <span>
                <HeroIcon name="info" size="xl" />
              </span>
              <h3>Visible AI boundary</h3>
              <p>
                AI is an explicit feature surface. We will describe the active mode and provider
                rather than presenting AI as invisible background processing.
              </p>
            </article>
            <article>
              <span>
                <HeroIcon name="desktop" size="xl" />
              </span>
              <h3>Local mode is a separate promise</h3>
              <p>
                Private desktop-only mode remains in development until storage, egress, search, and AI
                behavior are independently verified.
              </p>
            </article>
          </div>
        </section>
        <section className="security-map shell" aria-labelledby="map-title">
          <div className="security-section-heading">
            <div>
              <div className="kicker">HOW DATA MOVES</div>
              <h2 id="map-title">One message, named boundaries.</h2>
            </div>
            <p>We prefer showing the flow to making blanket privacy claims.</p>
          </div>
          <div className="security-map-grid">
            <article className="security-map-step">
              <span>01</span>
              <div className="security-map-brands">
                <PlatformIcon id="whatsapp" size="lg" />
                <PlatformIcon id="telegram" size="lg" />
                <PlatformIcon id="instagram" size="lg" />
              </div>
              <h3>Connected network</h3>
              <p>
                A message originates in WhatsApp, Telegram, Instagram, or another connected service,
                under that service’s own security model.
              </p>
            </article>
            <article className="security-map-arrow" aria-hidden="true">
              <HeroIcon name="arrow-right" />
            </article>
            <article className="security-map-step emphasis">
              <span>02</span>
              <HeroIcon name="server" size="xl" />
              <h3>Claire sync boundary</h3>
              <p>
                Claire receives and normalizes the data needed to show the unified inbox, preserve
                history, power search, and support connected features.
              </p>
            </article>
            <article className="security-map-arrow" aria-hidden="true">
              <HeroIcon name="arrow-right" />
            </article>
            <article className="security-map-step">
              <span>03</span>
              <HeroIcon name="sparkles" size="xl" />
              <h3>AI only when invoked</h3>
              <p>
                Ask Claire, summaries, and suggestions use selected conversation context with the
                configured AI mode. This is a separate boundary.
              </p>
            </article>
          </div>
        </section>
        <section className="security-roadmap shell" aria-labelledby="roadmap-title">
          <div className="security-roadmap-copy">
            <div className="kicker">WHAT WE WILL EARN</div>
            <h2 id="roadmap-title">Stronger claims require stronger proof.</h2>
            <p>
              We will only upgrade our language when a real configuration, test suite, and review
              demonstrate the behavior in production.
            </p>
          </div>
          <div className="security-roadmap-list">
            <article>
              <span>IN PROGRESS</span>
              <h3>Encrypted bridge transport</h3>
              <p>
                mautrix supports end-to-bridge encryption, but it must be enabled and verified for
                Claire’s bridge deployment before we market it as a protection.
              </p>
            </article>
            <article>
              <span>IN DEVELOPMENT</span>
              <h3>Private desktop-only mode</h3>
              <p>
                We need audited outbound-network controls, local search and media behavior, local
                model rules, and documented mobile boundaries before making a local-only claim.
              </p>
            </article>
            <article>
              <span>BEFORE STRONGER CLAIMS</span>
              <h3>Independent review & disclosure</h3>
              <p>
                We will publish a practical security review, incident-contact path, retention/deletion
                controls, and a configuration-specific data-flow statement.
              </p>
            </article>
          </div>
        </section>
        <section className="security-resources shell">
          <div>
            <div className="kicker">SOURCE MATERIAL</div>
            <h2>Read the underlying work.</h2>
          </div>
          <div>
            <a href="https://docs.mau.fi/bridges/general/end-to-bridge-encryption.html">
              mautrix end-to-bridge encryption <HeroIcon name="external" />
            </a>
            <Link href="/docs/product/roadmap">
              Claire connector & privacy roadmap <HeroIcon name="external" />
            </Link>
            <a href="https://github.com/l2succes/claire/issues">
              Report a security concern on GitHub <HeroIcon name="external" />
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
