// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Doc, P, Section, Steps, Step, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'End-to-end encryption research',
  description: 'A research boundary for future client-held encryption; not a current Claire feature or product claim.',
  section: 'product',
  status: 'draft',
  lastReviewed: '2026-08-19',
  order: 5,
  roadmap: {
    status: 'research',
    summary: 'Define a verifiable, narrowly scoped encryption design before building or marketing it.',
  },
  related: ['/docs/product/security', '/docs/product/connectors', '/docs/product/ai-platform'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        <b>Status: research only.</b> Claire does not currently offer end-to-end encryption or
        zero-knowledge messaging. This page records the boundary, the work required to change it,
        and the claims Claire must not make before that work is independently verified.
      </P>

      <Section id="current-boundary" title="Current trusted-service boundary">
        <Code lang="text">{'Provider network → hosted mautrix bridge → Synapse → Claire API → database / search / configured AI → Claire client'}</Code>
        <P>
          Claire Cloud normalizes and stores message data so the unified inbox, search, suggestions,
          promise detection, summaries, and Ask Claire can work. The hosted bridge must also process
          message content briefly to speak each provider’s protocol. Claire Cloud is therefore a
          trusted service for messaging and AI today.
        </P>
        <Callout kind="warning" title="Managed AI is an explicit content boundary">
          When an AI feature runs, Claire sends the selected message context to its configured model
          provider. Users must be shown the processor and be able to disable AI without disabling
          messaging. Operations telemetry must never receive that content.
        </Callout>
      </Section>

      <Section id="what-e2ee-would-mean" title="What a real E2EE claim would require">
        <P>
          “End-to-end encrypted” is not a synonym for TLS, encrypted disks, encrypted database
          backups, or double puppeting. It means only the intended endpoint devices hold the keys
          needed to read the protected content for the specific flow being described.
        </P>
        <Table
          head={['Protection', 'Useful?', 'What it does not prove']}
          rows={[
            ['TLS and encryption at rest', 'Yes', 'A hosted Claire service still receives and can process plaintext.'],
            ['Matrix end-to-bridge encryption', 'Yes', 'It can protect Matrix events from the homeserver, but a hosted bridge still handles provider messages.'],
            ['Double puppeting', 'Yes', 'It improves message identity and delivery behaviour; it is not message encryption.'],
            ['Client-held keys plus a local connector', 'Required for a zero-knowledge Claire boundary', 'It does not change the external provider’s own security model.'],
          ]}
        />
        <P>
          Mautrix documents end-to-bridge encryption as a way to hide bridged Matrix events from
          the homeserver. Its strongest privacy example uses a bridge hosted locally, not as a blanket
          promise for a hosted bridge. See the{' '}
          <a href="https://docs.mau.fi/bridges/general/end-to-bridge-encryption.html" rel="noreferrer" target="_blank">official mautrix encryption guide</a>.
        </P>
      </Section>

      <Section id="future-design" title="Future design questions">
        <ul>
          <li>Device identity keys in iOS Keychain, Android Keystore, and desktop secure storage.</li>
          <li>A user-held recovery phrase and verified-device flow; Claire must not be able to recover keys unilaterally.</li>
          <li>Per-device encryption envelopes, device revocation, key rotation, and offline-device recovery.</li>
          <li>A local Claire Connector that receives provider plaintext and encrypts before cloud sync.</li>
          <li>Explicit migration and deletion behaviour for existing cloud history, search indexes, embeddings, AI outputs, media, and backups.</li>
          <li>On-device AI, or a separate, time-bounded cloud-processing consent for AI features.</li>
        </ul>
      </Section>

      <Section id="release-gates" title="Release and claim gates">
        <Steps>
          <Step title="Write and externally review a threat model">
            <P>Cover the app, bridge, Matrix, database, push, recovery, compromised device, lost device, and provider boundaries.</P>
          </Step>
          <Step title="Use audited cryptography, never a custom protocol">
            <P>Publish protocol/version choices and cross-platform test vectors before any opt-in rollout.</P>
          </Step>
          <Step title="Prove the scoped flow">
            <P>Test send, receive, media, recovery, revoke, bridge restart, offline devices, logs, telemetry, notifications, and backup deletion.</P>
          </Step>
          <Step title="Publish exact scope before using the words E2EE or zero knowledge" />
        </Steps>
        <Callout kind="danger" title="Claims prohibited until these gates pass">
          Claire must not say it is “end-to-end encrypted,” “zero knowledge,” or that it “cannot
          access messages.” A future claim must name the devices, connector execution location,
          providers, metadata, recovery model, and excluded features it actually covers.
        </Callout>
      </Section>

      <Section id="current-hardening" title="What Claire improves now">
        <P>
          The current roadmap is not blocked on E2EE. Claire can harden its trusted-service model by
          encrypting existing session material and sensitive caches at rest, keeping content out of logs and
          operations telemetry, enforcing least-privilege access and audited operations, and making
          retention and deletion behaviour visible to users.
        </P>
        <P>
          These controls reduce risk; they do not change Claire Cloud into a zero-knowledge service.
        </P>
      </Section>
    </Doc>
  );
}
