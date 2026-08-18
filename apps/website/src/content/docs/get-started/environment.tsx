// SPDX-License-Identifier: Apache-2.0
import {
  C,
  Callout,
  Code,
  Doc,
  P,
  Section,
  Step,
  Steps,
  Tab,
  Table,
  Tabs,
  Terminal,
} from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Environment setup',
  description: 'Configure local, device, and production environments for Claire.',
  section: 'get-started',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 2,
  related: ['/docs/get-started/quickstart', '/docs/deploy-operate/environment-reference'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire runs across three environments. The difference between them is entirely which API and
        Supabase origins the clients point at.
      </P>

      <Table
        head={['Environment', 'API server', 'Supabase', 'When to use']}
        rows={[
          [<b key="a">local-sim</b>, <C key="b">localhost:3001</C>, <C key="c">localhost:8000</C>, 'Simulator on your Mac'],
          [<b key="d">local-device</b>, <C key="e">{'<lan-ip>:3001'}</C>, <C key="f">{'<lan-ip>:8000'}</C>, 'Physical phone on the same WiFi'],
          [<b key="g">production</b>, 'Your deployed API origin', 'Supabase or a self-hosted gateway', 'TestFlight and App Store'],
        ]}
      />

      <Section id="supabase" title="Supabase">
        <P>
          The Supabase stack runs locally in Docker (<C>docker/supabase/</C>). That is enough for the iOS
          simulator at <C>localhost:8000</C>. A deployed server or a physical device needs Supabase to
          have a reachable public URL.
        </P>

        <Tabs items={['VPS (permanent)', 'Tunnel (quick)']}>
          <Tab>
            <Steps>
              <Step title="Provision a small VPS">
                <P>
                  Any Ubuntu 22.04 host works. A Hetzner CAX11 (2&nbsp;GB ARM) is around €4/month and is
                  more than enough.
                </P>
              </Step>
              <Step title="Copy the stack across">
                <Terminal>{`scp -r docker/supabase/ root@YOUR_VPS_IP:/opt/claire-supabase/
scp -r supabase/migrations/ root@YOUR_VPS_IP:/opt/claire-supabase/migrations/
ssh root@YOUR_VPS_IP
cd /opt/claire-supabase && docker compose -f docker-compose.supabase.yml up -d`}</Terminal>
              </Step>
              <Step title="Apply migrations">
                <Terminal>{`psql postgresql://postgres:postgres@localhost:5432/postgres \\
  -f /opt/claire-supabase/migrations/20250806092049_initial_schema.sql`}</Terminal>
                <P>
                  Repeat for the remaining migration files in order. Supabase is then reachable at{' '}
                  <C>{'http://YOUR_VPS_IP:8000'}</C>.
                </P>
              </Step>
            </Steps>
          </Tab>
          <Tab>
            <P>
              A tunnel exposes your local Supabase publicly without provisioning anything. It only works
              while your machine is online.
            </P>
            <Terminal>{`ngrok http 8000`}</Terminal>
            <P>
              Point your deployment at the resulting URL. Supabase keys live in{' '}
              <C>docker/supabase/.env</C>, or under Project Settings → API in the dashboard.
            </P>
            <Terminal>{`railway variables set \\
  SUPABASE_URL="https://xxxx.ngrok-free.app" \\
  SUPABASE_ANON_KEY="<your-supabase-anon-key>" \\
  SUPABASE_SERVICE_KEY="<your-supabase-service-role-key>"`}</Terminal>
            <Callout kind="warning" title="Free tunnel URLs rotate">
              A free ngrok URL changes on every restart, which will silently break a deployed server. Use
              a reserved subdomain or a Cloudflare Tunnel if the host needs to stay reachable.
            </Callout>
          </Tab>
        </Tabs>
      </Section>

      <Section id="migrating" title="Migrating to hosted Supabase">
        <P>Dump the local data, apply the schema to the target, then restore.</P>
        <Terminal>{`docker exec supabase-db pg_dump -U postgres -d postgres \\
  --data-only --no-owner \\
  -t messages -t chats -t contacts -t users -t sessions \\
  > /tmp/claire_data.sql

CLOUD_DB="postgresql://postgres:YOUR_PW@db.YOUR_REF.supabase.co:5432/postgres"
psql "$CLOUD_DB" -f supabase/migrations/20250806092049_initial_schema.sql
psql "$CLOUD_DB" < /tmp/claire_data.sql`}</Terminal>
      </Section>

      <Section id="expo" title="Expo environment switching">
        <Code lang="text" title="mobile/" copy={false}>{`.env.example       Template — copy to .env.local (committed)
.env.local         Your device overrides — never commit (gitignored)
.env.production    Production keys — never commit (gitignored)
eas.json           EAS build profiles`}</Code>
        <P>
          Expo loads these in ascending priority: <C>.env</C>, then <C>.env.local</C>, then{' '}
          <C>.env.development</C> or <C>.env.production</C>.
        </P>

        <Section id="simulator" title="Simulator on a Mac" level={3}>
          <P>
            <C>mobile/.env</C> already points at <C>localhost</C>, so there is nothing to configure.
          </P>
          <Terminal cwd="mobile">{`bunx expo run:ios`}</Terminal>
        </Section>

        <Section id="device" title="Physical device on WiFi" level={3}>
          <P>
            Find your machine&rsquo;s LAN address with <C>ipconfig getifaddr en0</C> — it changes — and
            write it into <C>mobile/.env.local</C>.
          </P>
          <Code lang="ini" title="mobile/.env.local">{`EXPO_PUBLIC_API_URL=http://<your-lan-ip>:3001
EXPO_PUBLIC_SUPABASE_URL=http://<your-lan-ip>:8000
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_ENV=development`}</Code>
          <P>
            The server already listens on <C>0.0.0.0:3001</C>, so it needs no change.
          </P>
          <Terminal cwd="mobile">{`bunx expo run:ios --device`}</Terminal>
        </Section>

        <Section id="production" title="Production build" level={3}>
          <P>
            The <C>production</C> profile in <C>eas.json</C> sets <C>EXPO_PUBLIC_API_URL</C>; the Supabase
            values come from <C>.env.production</C>.
          </P>
          <Terminal cwd="mobile">{`eas build --profile preview --platform ios
eas build --profile production --platform ios`}</Terminal>
        </Section>
      </Section>

      <Section id="quick-reference" title="Quick reference">
        <Terminal>{`# What env vars does the app actually see?
cd mobile && bunx expo config --type introspect | grep EXPO_PUBLIC

# Run the API against your local .env
cd server && bun run --watch src/index.ts

# Tail deployment logs
railway logs --lines 50`}</Terminal>
      </Section>
    </Doc>
  );
}
