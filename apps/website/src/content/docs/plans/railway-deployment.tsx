// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Railway deployment plan",
  description: "Implementation plan for deploying Claire and its supporting services to Railway.",
  section: 'plans',
  status: 'draft',
  lastReviewed: '2026-08-17',
  related: ['/docs/deploy-operate/railway'],
};

export default function Page() {
  return (
    <Doc>
      <Section id="overview" title="Overview">
      <P>Deploy Claire backend to Railway with Redis for queue management. Supports both direct mode (native adapters) and matrix mode (via external Matrix server).</P>
      </Section>
      <Section id="architecture" title="Architecture">
      <Code lang="text">{"┌─────────────────────────────────────────────────────────┐\n│                      Railway                             │\n│                                                          │\n│  ┌──────────────────┐      ┌──────────────────┐         │\n│  │  Claire Server   │      │   Redis Plugin   │         │\n│  │                  │◄────►│                  │         │\n│  │  - Express API   │      │  - Job queues    │         │\n│  │  - Platform      │      │  - Session cache │         │\n│  │    adapters      │      │                  │         │\n│  │  - Puppeteer     │      └──────────────────┘         │\n│  └────────┬─────────┘                                    │\n│           │                                              │\n└───────────┼──────────────────────────────────────────────┘\n            │\n            ▼\n    ┌───────────────┐\n    │ External APIs │\n    │               │\n    │ - Supabase    │\n    │ - OpenAI      │\n    │ - WhatsApp    │\n    │ - Telegram    │\n    │ - Instagram   │\n    └───────────────┘"}</Code>
      </Section>
      <Section id="files-created" title="Files Created">
      <Table
              head={[<>File</>, <>Description</>]}
              rows={[
                [<><C>Dockerfile</C></>, <>Multi-stage production build (Bun + Puppeteer)</>],
                [<><C>railway.toml</C></>, <>Railway deployment configuration</>],
                [<><C>docker-compose.prod.yml</C></>, <>Production Docker Compose</>],
                [<><C>.env.production.example</C></>, <>Environment variable template</>],
                [<><C>docs/deployment/RAILWAY.md</C></>, <>Detailed deployment guide</>],
              ]}
            />
      </Section>
      <Section id="deployment-steps" title="Deployment Steps">
      <Section id="prerequisites" title="Prerequisites" level={3}>
      <ul>
              <li>Railway account (https://railway.app)</li>
              <li>Supabase project with database</li>
              <li>OpenAI API key</li>
              <li>(Optional) Telegram bot token from @BotFather</li>
            </ul>
      </Section>
      <Section id="install-railway-cli" title="Install Railway CLI" level={3}>
      <Code lang="bash">{"npm install -g @railway/cli\nrailway login"}</Code>
      </Section>
      <Section id="initialize-project" title="Initialize Project" level={3}>
      <Code lang="bash">{"cd /path/to/claire\nrailway init"}</Code>
      </Section>
      <Section id="add-redis-plugin" title="Add Redis Plugin" level={3}>
      <P>In Railway dashboard:</P>
      <ol>
              <li>Click <b>+ New</b> → <b>Database</b> → <b>Redis</b></li>
              <li><C>REDIS_URL</C> is automatically set</li>
            </ol>
      </Section>
      <Section id="configure-environment-variables" title="Configure Environment Variables" level={3}>
      <P>Set in Railway dashboard or via CLI:</P>
      <Code lang="bash">{"# Required\nrailway variables set SUPABASE_URL=\"$SUPABASE_URL\"\nrailway variables set SUPABASE_ANON_KEY=\"$SUPABASE_ANON_KEY\"\nrailway variables set SUPABASE_SERVICE_KEY=\"$SUPABASE_SERVICE_KEY\"\nrailway variables set DATABASE_URL=\"$DATABASE_URL\"\nrailway variables set JWT_SECRET=\"$(openssl rand -hex 32)\"\nrailway variables set ENCRYPTION_KEY=\"$(openssl rand -hex 16)\"\nrailway variables set OPENAI_API_KEY=\"$OPENAI_API_KEY\"\n\n# Platform mode\nrailway variables set PLATFORM_MODE=direct\n\n# Optional - Telegram\nrailway variables set TELEGRAM_BOT_TOKEN=123456:ABC..."}</Code>
      </Section>
      <Section id="deploy" title="Deploy" level={3}>
      <Code lang="bash">{"railway up"}</Code>
      <P>Or connect GitHub for auto-deploy on push.</P>
      </Section>
      </Section>
      <Section id="environment-variables-reference" title="Environment Variables Reference">
      <Table
              head={[<>Variable</>, <>Required</>, <>Description</>]}
              rows={[
                [<><C>SUPABASE_URL</C></>, <>Yes</>, <>Supabase project URL</>],
                [<><C>SUPABASE_ANON_KEY</C></>, <>Yes</>, <>Supabase anonymous key</>],
                [<><C>SUPABASE_SERVICE_KEY</C></>, <>Yes</>, <>Supabase service role key</>],
                [<><C>DATABASE_URL</C></>, <>Yes</>, <>PostgreSQL connection string</>],
                [<><C>JWT_SECRET</C></>, <>Yes</>, <>32+ character secret for JWT</>],
                [<><C>ENCRYPTION_KEY</C></>, <>Yes</>, <>32 character encryption key</>],
                [<><C>OPENAI_API_KEY</C></>, <>Yes</>, <>OpenAI API key</>],
                [<><C>REDIS_URL</C></>, <>Auto</>, <>Set by Railway Redis plugin</>],
                [<><C>PLATFORM_MODE</C></>, <>No</>, <><C>direct</C> (default) or <C>matrix</C></>],
                [<><C>TELEGRAM_BOT_TOKEN</C></>, <>No</>, <>Telegram bot token</>],
                [<><C>PORT</C></>, <>No</>, <>Server port (default: 3001)</>],
              ]}
            />
      </Section>
      <Section id="resource-requirements" title="Resource Requirements">
      <Table
              head={[<>Plan</>, <>RAM</>, <>CPU</>, <>Use Case</>]}
              rows={[
                [<>Hobby</>, <>512MB</>, <>Shared</>, <>Testing only</>],
                [<>Pro</>, <>2GB</>, <>Dedicated</>, <>Production (1-2 users)</>],
                [<>Team</>, <>4GB+</>, <>Dedicated</>, <>Multiple users</>],
              ]}
            />
      <P><b>Note:</b> WhatsApp adapter with Puppeteer requires ~1GB RAM minimum.</P>
      </Section>
      <Section id="cost-breakdown" title="Cost Breakdown">
      <Table
              head={[<>Component</>, <>Monthly Cost</>]}
              rows={[
                [<>Railway Pro</>, <>$20</>],
                [<>Railway Redis</>, <>$5</>],
                [<>Supabase (Free tier)</>, <>$0</>],
                [<>OpenAI API (estimate)</>, <>$10-50</>],
                [<><b>Total</b></>, <><b>$35-75</b></>],
              ]}
            />
      </Section>
      <Section id="monitoring-debugging" title="Monitoring & Debugging">
      <Code lang="bash">{"# View logs\nrailway logs\n\n# Check status\nrailway status\n\n# Open dashboard\nrailway open"}</Code>
      <P>Health endpoint: <C>https://your-app.railway.app/health</C></P>
      </Section>
      <Section id="matrix-mode-advanced" title="Matrix Mode (Advanced)">
      <P>For Matrix bridge integration:</P>
      <ol>
              <li>Deploy Matrix stack separately (VPS recommended)</li>
              <li>Set environment variables: ``<C>bash railway variables set PLATFORM_MODE=matrix railway variables set MATRIX_HOMESERVER_URL=https://matrix.yourserver.com railway variables set MATRIX_SERVER_NAME=yourserver.com railway variables set MATRIX_ADMIN_TOKEN=syt_... </C>``</li>
            </ol>
      <P>See <C>docs/plans/matrix-bridge-integration.md</C> for full Matrix setup.</P>
      </Section>
      <Section id="local-development" title="Local Development">
      <P>Test the production setup locally:</P>
      <Code lang="bash">{"# Copy environment file\ncp .env.production.example .env\n# Edit .env with your values\n\n# Run in direct mode\ndocker compose -f docker-compose.prod.yml up -d\n\n# Run in matrix mode (includes Synapse + bridges)\ndocker compose -f docker-compose.prod.yml --profile matrix up -d\n\n# View logs\ndocker compose -f docker-compose.prod.yml logs -f claire-server\n\n# Stop\ndocker compose -f docker-compose.prod.yml down"}</Code>
      </Section>
      <Section id="rollback" title="Rollback">
      <P>If deployment fails:</P>
      <Code lang="bash">{"# View deployment history\nrailway deployments\n\n# Rollback to previous\nrailway rollback"}</Code>
      </Section>
      <Section id="security-checklist" title="Security Checklist">
      <ul>
              <li>[ ] All secrets stored in Railway variables (not in code)</li>
              <li>[ ] <C>JWT_SECRET</C> is unique and 32+ characters</li>
              <li>[ ] <C>ENCRYPTION_KEY</C> is unique and 32 characters</li>
              <li>[ ] CORS configured for production domain</li>
              <li>[ ] Supabase RLS policies enabled</li>
              <li>[ ] Rate limiting configured</li>
            </ul>
      </Section>
    </Doc>
  );
}
