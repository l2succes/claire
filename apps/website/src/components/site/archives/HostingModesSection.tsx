// Archived on 2026-09-17. The hosting options are not currently true, so this
// section is kept here for reference and possible restoration instead of being
// rendered on the live homepage.
import { HeroIcon } from '@/components/site/HeroIcon';

export function ArchivedHostingModesSection() {
  return (
    <div className="hosting-modes" aria-labelledby="hosting-title">
      <div className="hosting-heading">
        <div>
          <div className="kicker">CHOOSE WHERE CLAIRE RUNS</div>
          <h2 id="hosting-title">Choose how Claire stays online.</h2>
        </div>
        <p>
          Hosting location and device requirements are separate. A desktop may only authorize a
          cloud connection, or it may be the machine that keeps a local bridge alive.
        </p>
      </div>
      <div className="hosting-grid">
        <article className="hosting-card hosting-cloud">
          <div className="hosting-card-top">
            <span className="hosting-symbol">
              <HeroIcon name="cloud" />
            </span>
            <span className="status-pill available">AVAILABLE WHERE SUPPORTED</span>
          </div>
          <h3>Claire Cloud</h3>
          <p>
            Managed bridges, storage, search, and optional AI stay online when your computer closes.
          </p>
          <ul>
            <li>Fastest setup</li>
            <li>Automatic bridge updates</li>
            <li>Computer can close after setup*</li>
          </ul>
        </article>
        <article className="hosting-card hosting-self">
          <div className="hosting-card-top">
            <span className="hosting-symbol">
              <HeroIcon name="server" />
            </span>
            <span className="status-pill builder">FOR BUILDERS</span>
          </div>
          <h3>Self-hosted</h3>
          <p>
            Run Claire’s Bun server, Matrix bridges, Supabase, and Redis on infrastructure you control.
          </p>
          <ul>
            <li>Existing Docker workflow</li>
            <li>Your host controls availability</li>
            <li>Your AI provider remains your choice</li>
          </ul>
        </article>
        <article className="hosting-card hosting-local">
          <div className="hosting-card-top">
            <span className="hosting-symbol">
              <HeroIcon name="desktop" />
            </span>
            <span className="status-pill planned">IN DEVELOPMENT</span>
          </div>
          <h3>Private desktop-only</h3>
          <p>
            A future verified mode for local storage, search, and AI with external processing disabled.
          </p>
          <ul>
            <li>No guarantee is claimed yet</li>
            <li>Offline recovery must pass</li>
            <li>Egress will be independently verified</li>
          </ul>
        </article>
      </div>
      <div className="data-disclosure">
        <span className="disclosure-icon" aria-hidden="true">
          <HeroIcon name="info" />
        </span>
        <div>
          <h3>What “local” means today</h3>
          <p>
            Self-hosting keeps Claire’s message store on infrastructure you control. The original
            messaging networks still process their messages, and configured external AI providers may
            receive selected conversation content. We will not claim “never stored in the cloud” until
            desktop-only mode has passed its security and network-egress review.
          </p>
        </div>
      </div>
      <p className="hosting-footnote">
        * iMessage needs its Mac host available. Google Messages depends on the paired Android phone.
      </p>
    </div>
  );
}
