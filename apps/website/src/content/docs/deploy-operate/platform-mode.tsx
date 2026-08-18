// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Doc, P, Section, Step, Steps, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Platform mode',
  description: 'Production configuration for direct and Matrix-backed platform adapters.',
  section: 'deploy-operate',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 6,
  related: ['/docs/deploy-operate/matrix-bridges', '/docs/get-started/mock-mode'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        <C>PLATFORM_MODE</C> selects how Claire reaches messaging networks. Getting it wrong is quiet
        rather than loud, which is why the server now refuses to guess in production.
      </P>

      <Table
        head={['Mode', 'What it does', 'Intended for']}
        rows={[
          [<C key="a">matrix</C>, 'Synapse plus mautrix bridges. All networks flow through Matrix rooms.', 'Production'],
          [<C key="b">direct</C>, 'Native per-platform adapters (whatsapp-web.js and friends).', 'Local development'],
          [<C key="c">MOCK_BRIDGE=true</C>, 'Scripted fixtures; no infrastructure at all.', 'Tests and demos'],
        ]}
      />

      <Section id="the-guard" title="The bug this guards against">
        <P>
          <C>PLATFORM_MODE</C> defaults to <C>direct</C>. A production deploy that forgets to set it boots
          in direct mode and silently diverges from the documented architecture — everything looks healthy
          while the system is not the system you designed. Config validation now fails fast in production
          when the variable is unset:
        </P>
        <Code lang="text" title="Startup failure" copy={false}>{`PLATFORM_MODE must be set explicitly in production (matrix|direct).
Refusing to default to direct mode.`}</Code>
      </Section>

      <Section id="required" title="Required configuration">
        <Table
          head={['Mode', 'Required environment']}
          rows={[
            [
              <C key="a">matrix</C>,
              <span key="b">
                <C>MATRIX_HOMESERVER_URL</C>, <C>MATRIX_SERVER_NAME</C>, and in production{' '}
                <C>MATRIX_ADMIN_TOKEN</C>. <C>MATRIX_BOT_USER_ID</C> is recommended.
              </span>,
            ],
            [<C key="c">direct</C>, 'Per-platform credentials, as applicable.'],
            [<C key="d">mock</C>, <span key="e"><C>MOCK_BRIDGE=true</C>, which overrides the above.</span>],
          ]}
        />
        <P>
          <C>PLATFORM_MODE=matrix</C> with missing bridge configuration fails at startup and names the
          missing variables.
        </P>
      </Section>

      <Section id="observability" title="Observability">
        <P>
          <C>GET /health</C> reports the effective mode, and in Matrix mode also checks that Synapse is
          reachable.
        </P>
        <Code lang="json" title="GET /health">{`{ "status": "ok", "platformMode": "matrix", "checks": { "matrix": { "status": "ok" } } }`}</Code>
        <P>Direct mode in production additionally logs a prominent startup warning.</P>
      </Section>

      <Section id="recovery" title="Recovery">
        <Steps>
          <Step title="Set the mode and its Matrix variables on the deployment" />
          <Step title="Redeploy and confirm">
            <P>
              The startup log should read <C>Initializing platform adapters in matrix mode</C>, and{' '}
              <C>/health</C> should show <C>&quot;platformMode&quot;: &quot;matrix&quot;</C> with{' '}
              <C>matrix: ok</C>.
            </P>
          </Step>
          <Step title="If startup fails with a platform-mode error, set the variable it names">
            <Callout kind="danger">
              Do not remove the guard. It exists because the failure it prevents is invisible in every
              other signal.
            </Callout>
          </Step>
        </Steps>
      </Section>
    </Doc>
  );
}
