// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Diagram, Doc, P, Section, Step, Steps, Table, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Deploying Claire to Railway',
  description: 'A worked example of deploying the Claire API and its dependencies to a managed host.',
  section: 'deploy-operate',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 3,
  related: ['/docs/deploy-operate/production-setup', '/docs/deploy-operate/platform-mode', '/docs/plans/railway-deployment'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Railway is the simplest managed path for the Claire API. It suits direct mode well; a full Matrix
        stack is usually better placed on a VPS beside it.
      </P>

      <Section id="prerequisites" title="Prerequisites">
        <ul>
          <li>A Railway account</li>
          <li>A Supabase project for database and auth</li>
          <li>An OpenAI API key, if you want AI features</li>
        </ul>
      </Section>

      <Section id="quick-start" title="Quick start">
        <Steps>
          <Step title="Install the CLI and sign in">
            <Terminal>{`npm install -g @railway/cli
railway login`}</Terminal>
          </Step>
          <Step title="Create the project">
            <Terminal>{`railway init`}</Terminal>
          </Step>
          <Step title="Add Redis">
            <P>
              In the dashboard: <b>+ New → Database → Redis</b>. Railway sets <C>REDIS_URL</C> on the
              service automatically.
            </P>
          </Step>
          <Step title="Configure environment variables">
            <Table
              head={['Variable', 'Value']}
              rows={[
                [<C key="a">SUPABASE_URL</C>, 'Your Supabase project URL'],
                [<C key="b">SUPABASE_ANON_KEY</C>, 'Supabase anon key'],
                [<C key="c">SUPABASE_SERVICE_KEY</C>, 'Supabase service-role key'],
                [<C key="d">DATABASE_URL</C>, 'Supabase connection string'],
                [<C key="e">JWT_SECRET</C>, 'Random 32+ character string'],
                [<C key="f">ENCRYPTION_KEY</C>, 'Random 32 hex characters'],
                [<C key="g">OPENAI_API_KEY</C>, 'Your OpenAI key'],
                [<C key="h">PLATFORM_MODE</C>, 'Must be set explicitly — the server refuses to guess'],
              ]}
            />
            <Terminal>{`openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 16   # ENCRYPTION_KEY`}</Terminal>
          </Step>
          <Step title="Deploy">
            <Terminal>{`railway up`}</Terminal>
            <P>Or connect the GitHub repository for automatic deployments on push.</P>
          </Step>
        </Steps>
      </Section>

      <Section id="architecture" title="Architecture options">
        <Section id="direct-mode" title="Direct mode" level={3}>
          <Diagram
            caption="Direct mode on a managed host"
            summary="The Claire server and Redis run on Railway; platform APIs and Supabase and OpenAI are external."
          >{`flowchart TB
  subgraph Railway
    Server["Claire server"] --- Redis["Redis plugin"]
  end
  Server --> Platforms["Platform APIs (whatsapp-web.js, telegraf)"]
  Server --> External["Supabase · OpenAI"]`}</Diagram>
          <P>
            Cheaper and simpler, at the cost of maintaining platform integration code and reconnecting
            WhatsApp after restarts.
          </P>
        </Section>

        <Section id="matrix-mode" title="Matrix mode" level={3}>
          <P>
            Matrix needs more services than a single managed service comfortably holds. Two workable
            shapes:
          </P>
          <ul>
            <li>
              Run the Claire server on Railway and the Matrix stack on a VPS, pointing{' '}
              <C>MATRIX_HOMESERVER_URL</C> at the VPS.
            </li>
            <li>
              Self-host everything with <C>docker-compose.prod.yml --profile matrix</C>.
            </li>
          </ul>
        </Section>
      </Section>

      <Section id="resources" title="Resource sizing">
        <Table
          head={['Tier', 'Resources', 'Suitable for']}
          rows={[
            ['Hobby (~$5/mo)', '512 MB RAM, shared CPU', 'Testing'],
            ['Pro (~$20/mo)', '2 GB RAM, dedicated CPU', 'Production, one or two users'],
            ['Team ($50+/mo)', '4 GB+ RAM, multiple replicas', 'Multiple users'],
          ]}
        />
        <Callout kind="warning" title="Puppeteer is the memory floor">
          Direct mode runs whatsapp-web.js on Puppeteer, which needs roughly 1&nbsp;GB of RAM on its own.
          If you are hitting memory limits, that is almost always why — upgrade the plan or move to Matrix
          mode.
        </Callout>
      </Section>

      <Section id="sessions" title="WhatsApp session persistence">
        <P>WhatsApp sessions must survive a redeploy. Either:</P>
        <ul>
          <li>
            <b>Use a volume.</b> Volumes persist across deploys; configure one in <C>railway.toml</C> or
            the dashboard.
          </li>
          <li>
            <b>Store sessions in Supabase.</b> Serialize the session data and restore it on startup.
          </li>
        </ul>
      </Section>

      <Section id="monitoring" title="Monitoring">
        <Terminal>{`railway logs
railway status
railway volume list`}</Terminal>
        <P>
          The health endpoint is <C>/health</C>, and it reports the effective platform mode along with
          Matrix and schema readiness.
        </P>
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <Table
          head={['Symptom', 'Cause and fix']}
          rows={[
            ['“Cannot find module”', <span key="a">The build did not run <C>bun install</C>. Check the Dockerfile.</span>],
            ['WhatsApp disconnects after a deploy', 'Sessions are not on a persistent volume.'],
            ['Memory exhaustion', 'Puppeteer needs ~1 GB. Upgrade, or switch to Matrix mode.'],
            ['Telegram bot silent', <span key="b">Check <C>TELEGRAM_BOT_TOKEN</C>, and that no second instance is running — Telegram allows only one.</span>],
          ]}
        />
      </Section>

      <Section id="cost" title="Rough cost">
        <Table
          head={['Component', 'Monthly']}
          rows={[
            ['Railway Pro', '$20'],
            ['Railway Redis', '$5'],
            ['Supabase free tier', '$0'],
            ['OpenAI (estimate)', '$10–50'],
            [<b key="a">Total</b>, <b key="b">$35–75</b>],
          ]}
        />
        <P>
          A Hetzner CAX21 (4&nbsp;GB ARM, around €7/month) running{' '}
          <C>docker-compose.prod.yml</C> is the cheaper self-hosted alternative, and is the only realistic
          option for the full Matrix stack.
        </P>
      </Section>
    </Doc>
  );
}
