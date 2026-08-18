// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, P, Platforms, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Connector and hosting roadmap',
  description: 'Delivery waves, connection models, and verification gates for Claire’s network catalog.',
  section: 'product',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 2,
  hero: { kind: 'platforms' },
  roadmap: {
    status: 'planned',
    summary: 'Expand the supported connector catalog after each network passes production certification.',
  },
  related: ['/docs/product/roadmap', '/docs/get-started/companion-app', '/docs/product/security'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        This is the implementation contract behind the public connection catalog. The canonical
        machine-readable definitions live in <C>packages/platform-catalog</C>.
      </P>

      <Callout kind="warning" title="Upstream support is not product support">
        The catalog follows the actively documented official mautrix bridges. It excludes archived
        predecessors, temporary rewrite repositories, DeltaChat, and the Twilio demonstration bridge. A
        bridge existing upstream does not make it available in Claire — <C>supportStatus</C> is the
        product truth.
      </Callout>

      <Section id="catalog" title="The catalog today">
        <Platforms detail />
      </Section>

      <Section id="support-classes" title="Support classes">
        <Table
          head={['Class', 'Meaning', 'Examples']}
          rows={[
            ['Phone pairing', 'Setup is approved from the network’s mobile app; Claire Desktop is not required.', 'WhatsApp, Telegram, Signal, Discord'],
            ['Desktop setup', 'Claire Desktop acquires a browser session and hands it to the bridge host; the desktop may close afterwards.', 'Instagram, Messenger, Google Chat, Google Voice, Slack, LinkedIn, X'],
            ['Paired device', 'A user-owned device stays part of delivery after setup.', 'iMessage on a Mac, Google Messages on Android'],
            ['Direct credential', 'A revocable password, app password, API token, or network credential — no browser session.', 'Bluesky, Zulip, IRC'],
          ]}
        />
        <P>
          Google Messages belongs to two classes at once: the desktop performs the Google sign-in, while
          the Android phone remains part of message delivery.
        </P>
      </Section>

      <Section id="waves" title="Delivery waves">
        <ol>
          <li>
            <b>Current.</b> Keep WhatsApp, Telegram, and Instagram reliable, and expose their real
            connection health through the shared registry.
          </li>
          <li>
            <b>Wave 1.</b> Messenger, Signal, and Discord, once the generic BridgeV2 provisioning flow is
            stable.
          </li>
          <li>
            <b>Parallel Mac track.</b> iMessage, only after signed helper distribution, permissions,
            sleep and restart recovery, and bridge-health diagnostics all pass.
          </li>
          <li>
            <b>Wave 2.</b> Google Messages, Google Chat, Google Voice, Slack, LinkedIn, and X, using the
            desktop authentication broker.
          </li>
          <li>
            <b>Wave 3.</b> Bluesky, Zulip, and IRC, using direct credential flows.
          </li>
        </ol>
        <P>
          Each connector stays feature-flagged until authentication, initial sync, send and receive,
          supported media, reauthentication, disconnect, and outage recovery all pass in its production
          deployment.
        </P>
      </Section>

      <Section id="connection-contract" title="Connection contract">
        <P>
          <C>GET /platforms/definitions</C> is public and returns the product catalog. Runtime connection
          records reference the catalog by <C>platformId</C> and add:
        </P>
        <ul>
          <li>bridge instance and version;</li>
          <li>workspace deployment mode;</li>
          <li>execution location and host device, where applicable;</li>
          <li>status, last successful sync, and last error category;</li>
          <li>a secret-store reference — never raw credentials;</li>
          <li>the capability snapshot used to gate UI actions.</li>
        </ul>
        <P>
          BridgeV2 networks should use the common provisioning API. Network-specific drivers may translate
          authentication steps, ghost-user templates, bridge bot identities, and capability reports, but
          must return the same Claire connection state model. Instagram and Messenger run as separate
          mautrix-meta instances and must remain independently revocable.
        </P>
      </Section>

      <Section id="desktop-boundary" title="Desktop authentication boundary">
        <P>
          The desktop authentication broker owns contained browser sessions and native secure storage.
          Browser-session material moves directly from native code to the selected bridge provisioning
          service.
        </P>
        <Callout kind="danger" title="Session material has exactly one path">
          It must never be stored in React state, AsyncStorage, analytics, logs, ordinary database rows,
          crash reports, or URL parameters. Cloud credentials belong in an encrypted secret store; local
          credentials belong in Keychain on macOS or Credential Manager on Windows.
        </Callout>
        <P>
          Disconnecting a network revokes the credential where possible, removes the bridge login, and
          clears local secret material. Deleting message history stays a separate, explicit choice.
        </P>
      </Section>

      <Section id="hosting" title="Hosting and privacy">
        <P>Deployment mode is account-wide for the first release.</P>
        <Table
          head={['Mode', 'What it means']}
          rows={[
            ['Claire Cloud', 'Claire hosts the server, homeserver, bridges, database, search index, and configured AI. A desktop used only for authentication may close afterwards; device-dependent networks are the exception.'],
            ['Self-hosted', 'The Docker stack runs on user-controlled infrastructure. Availability follows that host, and external AI providers still receive selected content when configured.'],
            ['Private desktop-only', 'Unreleased until local storage, search, embeddings, media, export, deletion, and recovery all work without Claire cloud services.'],
          ]}
        />
        <Callout kind="danger" title="What the public site must never claim">
          That data never reaches the cloud. Original networks process their own messages in every mode,
          and external AI is part of the data boundary whenever it is enabled. Private desktop-only mode
          can only be promoted once automated egress tests and a production-binary review prove that
          message content, media, indexes, embeddings, logs, notification bodies, and credentials do not
          reach Claire services.
        </Callout>
      </Section>

      <Section id="verification" title="Verification matrix">
        <ul>
          <li>
            <b>Catalog contract.</b> Unique IDs, accurate availability, correct desktop and device
            classification, and an exact generated snapshot.
          </li>
          <li>
            <b>Connection experience.</b> Keyboard-operable filters and details, visible focus, reduced
            motion, screen-reader labels, and responsive layouts.
          </li>
          <li>
            <b>Connector certification.</b> Authentication, backfill, send and receive, media and
            interactions where supported, reauthentication, disconnect, and recovery.
          </li>
          <li>
            <b>Desktop security.</b> Secret redaction, secure-store persistence, revocation, process
            supervision, and actionable offline states.
          </li>
          <li>
            <b>Hosting behaviour.</b> Cloud operation with the desktop closed, iMessage with its Mac
            offline, Google Messages with its phone offline, and local-mode egress enforcement before any
            privacy guarantee.
          </li>
        </ul>
      </Section>

      <Section id="upstream" title="Upstream references">
        <ul>
          <li>
            <a href="https://github.com/mautrix/docs/blob/master/bridges/SUMMARY.md" rel="noreferrer" target="_blank">
              Official mautrix bridge catalog
            </a>
          </li>
          <li>
            <a href="https://docs.mau.fi/bridges/go/meta/authentication.html" rel="noreferrer" target="_blank">
              Meta bridge authentication
            </a>
          </li>
          <li>
            <a href="https://docs.mau.fi/bridges/go/imessage/" rel="noreferrer" target="_blank">
              iMessage connector overview
            </a>
          </li>
          <li>
            <a href="https://docs.mau.fi/bridges/go/gmessages/authentication.html" rel="noreferrer" target="_blank">
              Google Messages authentication
            </a>
          </li>
        </ul>
      </Section>
    </Doc>
  );
}
