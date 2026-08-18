// SPDX-License-Identifier: Apache-2.0
import { C, Card, Cards, Diagram, Doc, Facts, Mockup, P, Section } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Architecture overview',
  description: 'How Claire connects mobile, desktop, the API, Matrix, and plugins.',
  section: 'build-claire',
  status: 'current',
  lastReviewed: '2026-08-15',
  order: 1,
  roadmap: {
    status: 'shipped',
    summary: 'Unified messaging architecture across the mobile app, API, Matrix bridges, and plugins.',
  },
  hero: { kind: 'diagram', chart: '', caption: 'Message path' },
  related: [
    '/docs/deploy-operate/matrix-bridges',
    '/docs/get-started/mock-mode',
    '/docs/deploy-operate/platform-mode',
  ],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire is a unified messenger. The mobile and desktop clients talk to a Bun API. In{' '}
        <C>PLATFORM_MODE=matrix</C>, the API talks to Synapse and mautrix bridges, and messages are stored
        in Postgres through Supabase.
      </P>

      <Diagram
        caption="How a message reaches Claire"
        summary="Mobile and desktop clients call the Bun server, which persists to Supabase and Redis and bridges messaging networks through Synapse and mautrix."
      >
        {`flowchart LR
  Mobile["mobile/"] --> Server["server/"]
  Desktop["apps/desktop/"] --> Server
  Server --> Supabase["Supabase / Postgres"]
  Server --> Redis["Redis"]
  Server --> Synapse["Synapse"]
  Synapse --> Bridges["mautrix bridges"]
  Bridges --> Networks["WhatsApp / Telegram / Instagram"]
  Server --> Plugins["packages/plugin-sdk"]`}
      </Diagram>

      <Section id="pieces" title="The moving pieces">
        <Facts
          items={[
            { label: 'Clients', value: 'React Native (Expo) on iOS and Android, with the shared web client hosted in Electron on desktop' },
            { label: 'API', value: 'Bun + Express on port 3001' },
            { label: 'Storage', value: 'Postgres via Supabase, with Redis for sessions and queues' },
            { label: 'Bridging', value: 'Synapse (Matrix homeserver) with one mautrix bridge per network' },
            { label: 'Extensibility', value: 'packages/plugin-sdk, sandboxed and approval-gated' },
          ]}
        />
        <P>
          A single <C>MatrixBridgeAdapter</C> handles every network. Platform differences live in the
          bridge, not in Claire, so adding a network is mostly a matter of registering its ghost-user
          prefix and bridge bot.
        </P>
      </Section>

      <Section id="what-the-user-sees" title="What this looks like in the product">
        <P>
          The architecture exists to make one thing true: every conversation, from every network, arrives
          in one inbox with the sender&rsquo;s real identity intact.
        </P>
        <Mockup surface="mobile" screen="unified-inbox" caption="The unified inbox, with per-network identity" />
      </Section>

      <Section id="mock-mode" title="Working without messaging accounts">
        <P>
          Mock mode bypasses live bridges so contributors can develop against realistic data without
          linking a personal WhatsApp or Telegram account. It is the recommended way to start.
        </P>
      </Section>

      <Section id="durable-details" title="Durable details">
        <Cards>
          <Card
            href="/docs/deploy-operate/matrix-bridges"
            icon="server"
            title="Matrix bridge reference"
            description="Ghost user patterns, bridge bot commands, and login flows."
          />
          <Card
            href="/docs/get-started/mock-mode"
            icon="sparkles"
            title="Mock bridge mode"
            description="Develop the full product surface without a messaging account."
          />
          <Card
            href="/docs/deploy-operate/platform-mode"
            icon="settings"
            title="Platform mode"
            description="How PLATFORM_MODE selects the adapter stack."
          />
          <Card
            href="/docs/product/security"
            icon="shield"
            title="Security claims and roadmap"
            description="What Claire currently guarantees, and what it does not."
          />
        </Cards>
      </Section>
    </Doc>
  );
}
