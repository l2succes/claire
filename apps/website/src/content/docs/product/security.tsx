// SPDX-License-Identifier: Apache-2.0
import { Callout, Doc, DocLink, P, Section, Steps, Step } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Security claims and validation roadmap',
  description: 'Public security boundaries, and the evidence required before stronger claims are made.',
  section: 'product',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 3,
  roadmap: {
    status: 'research',
    summary: 'Validate stronger encryption, local-only, and credential-protection claims with evidence.',
  },
  related: ['/docs/product/connectors', '/docs/deploy-operate/self-hosting', '/docs/product/end-to-end-encryption'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        This page defines what Claire may say publicly about security, and what evidence is required
        before stronger statements are published. It exists because security copy is the easiest thing in
        a product to overstate and the hardest to walk back.
      </P>

      <Section id="can-claim" title="Claims we can make today">
        <ul>
          <li>Claire requires authenticated account access for private application routes.</li>
          <li>
            The production API uses security headers, an origin allowlist, and separate rate limits for
            authentication and AI endpoints.
          </li>
          <li>
            Claire Cloud synchronizes normalized message data to provide the unified inbox, search, and
            AI features.
          </li>
          <li>
            Connected networks still process original messages under their own security models. When an
            AI feature is invoked, selected context may be sent to the configured AI provider.
          </li>
          <li>
            Self-hosting puts the existing stack on infrastructure the user controls — which is not
            equivalent to an offline or local-only guarantee.
          </li>
        </ul>
      </Section>

      <Section id="cannot-claim" title="Claims we must not make today">
        <Callout kind="danger" title="None of these are currently true">
          <ul>
            <li>Claire is end-to-end encrypted.</li>
            <li>Claire is zero knowledge.</li>
            <li>Claire never stores messages in the cloud.</li>
            <li>All message data stays on a desktop computer.</li>
            <li>
              Provider credentials are encrypted in production — not before the encrypted secret store is
              implemented and verified.
            </li>
          </ul>
        </Callout>
        <P>
          Mautrix supports optional end-to-bridge encryption, but it requires explicit bridge
          configuration and testing. It is not a blanket property of any application that happens to use
          mautrix. See the{' '}
          <a href="https://docs.mau.fi/bridges/general/end-to-bridge-encryption.html" rel="noreferrer" target="_blank">
            mautrix encryption guide
          </a>
          .
        </P>
      </Section>

      <Section id="e2ee-gate" title="Gate: end-to-end encryption">
        <P>
          The full research boundary, including the hosted-bridge limitation and future local
          connector requirements, lives in the <DocLink to="/docs/product/end-to-end-encryption">end-to-end encryption research document</DocLink>.
        </P>
        <Steps>
          <Step title="Enable and enforce bridge encryption in production" />
          <Step title="Test the full matrix of behaviour">
            <P>
              Encrypted send, receive, media, device verification, recovery, and bridge restart — for
              every named connector.
            </P>
          </Step>
          <Step title="Publish the precise scope">
            <P>Which devices, networks, bridges, and metadata are and are not covered.</P>
          </Step>
          <Step title="Complete an independent implementation and threat-model review" />
        </Steps>
      </Section>

      <Section id="local-gate" title="Gate: private desktop-only mode">
        <Steps>
          <Step title="Prove containment with outbound-network tests">
            <P>
              Messages, media, indexes, embeddings, logs, notification bodies, and credentials must be
              shown unable to reach Claire services.
            </P>
          </Step>
          <Step title="Enforce local storage, local search, and local or disabled AI">
            <P>With telemetry disabled by enforced configuration, not by default setting.</P>
          </Step>
          <Step title="Verify offline export, deletion, recovery, sleep and restart, and the limits of mobile access" />
          <Step title="Review production binaries, not just development configuration" />
        </Steps>
      </Section>

      <Section id="byo-key-gate" title="Gate: bring your own AI provider key">
        <Steps>
          <Step title="Store cloud keys in an encrypted secret store, local keys in the OS credential store" />
          <Step title="Keep keys out of every incidental surface">
            <P>
              React state, analytics, application logs, AsyncStorage, ordinary database rows, crash
              reports, and URL parameters.
            </P>
          </Step>
          <Step title="Test redaction, rotation, revocation, and disconnect cleanup" />
        </Steps>
      </Section>

      <Section id="copy-review" title="Copy review checklist">
        <ul>
          <li>Use &ldquo;end-to-end encrypted&rdquo; only for a tested and explicitly scoped flow.</li>
          <li>Describe the AI data boundary beside every AI-related plan or feature.</li>
          <li>State whether a feature is current, planned, or in development.</li>
          <li>
            Do not imply that self-hosted means offline, private desktop-only, or free of external
            network processing.
          </li>
          <li>
            Re-review security copy with every material change to bridge, hosting, AI, analytics,
            credential, or telemetry behaviour.
          </li>
        </ul>
      </Section>
    </Doc>
  );
}
