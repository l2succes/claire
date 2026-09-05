// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, P, Section, Step, Steps, Table, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Google OAuth setup',
  description: 'Configure Google sign-in for Claire without committing provider credentials.',
  section: 'deploy-operate',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 9,
  hero: { kind: 'mockup', surface: 'mobile', screen: 'welcome', caption: 'The sign-in screen this configures' },
  related: ['/docs/get-started/environment', '/docs/deploy-operate/production-setup'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Google sign-in runs through Supabase Auth. Most of the work is in two consoles, and almost every
        failure is a redirect URI that does not match exactly.
      </P>

      <Section id="prerequisites" title="Prerequisites">
        <ul>
          <li>A Google Cloud Console account</li>
          <li>Access to your Supabase project dashboard</li>
          <li>Claire running locally</li>
        </ul>
      </Section>

      <Section id="google" title="Google Cloud Console">
        <Steps>
          <Step title="Create or select a project">
            <P>
              In the{' '}
              <a href="https://console.cloud.google.com/" rel="noreferrer" target="_blank">
                Google Cloud Console
              </a>
              , create a new project or pick an existing one.
            </P>
          </Step>
          <Step title="Enable the Google+ API">
            <P>APIs &amp; Services → Library → search for &ldquo;Google+ API&rdquo; → Enable.</P>
          </Step>
          <Step title="Configure the OAuth consent screen">
            <P>
              Choose <b>External</b> for the user type, fill in the app name and support email, and add
              your own address to the test users.
            </P>
          </Step>
          <Step title="Create an OAuth client ID">
            <P>
              APIs &amp; Services → Credentials → Create Credentials → OAuth client ID. Application type{' '}
              <b>Web application</b>.
            </P>
            <Table
              head={['Field', 'Value']}
              rows={[
                ['Authorized JavaScript origin', <C key="a">{'https://<your-project-ref>.supabase.co'}</C>],
                ['Authorized redirect URI', <C key="b">{'https://<your-project-ref>.supabase.co/auth/v1/callback'}</C>],
              ]}
            />
          </Step>
          <Step title="Copy the client ID and secret">
            <P>You will paste both into Supabase in the next section.</P>
          </Step>
        </Steps>
      </Section>

      <Section id="supabase" title="Supabase">
        <Steps>
          <Step title="Open Authentication → Providers and enable Google" />
          <Step title="Paste the client ID and secret" />
          <Step title="Configure the redirect URLs">
            <Table
              head={['Setting', 'Value']}
              rows={[
                ['Site URL', <C key="a">claire://auth/callback</C>],
                ['Additional redirect', <C key="b">http://localhost:3000</C>],
                ['Additional redirect', <C key="c">claire://auth/callback</C>],
                ['Additional redirect', <C key="d">{'exp://<your-lan-ip>:8081'}</C>],
              ]}
            />
          </Step>
          <Step title="Save" />
        </Steps>
      </Section>

      <Section id="test" title="Test the integration">
        <Terminal cwd="mobile">{`bun run ios`}</Terminal>
        <P>
          Open the sign-in screen and choose &ldquo;Sign in with Google&rdquo;. A browser opens with
          Google&rsquo;s login page, and a successful authentication redirects back into the app.
        </P>
      </Section>

      <Section id="production" title="Going to production">
        <ol>
          <li>Set the OAuth consent screen to Published in Google Cloud Console.</li>
          <li>Add your production domain to the authorized origins and redirect URIs.</li>
          <li>Update the Supabase redirect URLs with the production values.</li>
          <li>Confirm deep linking is configured in the mobile app.</li>
        </ol>
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <Table
          head={['Symptom', 'Cause and fix']}
          rows={[
            ['Redirect URI mismatch', 'The app’s redirect URI must match Google’s configuration exactly, and the Supabase URL must be an authorized JavaScript origin.'],
            ['“User cancelled login”', 'Normal when the browser is closed before authenticating. No action needed.'],
            ['Deep link does not open the app', <span key="a">Check the <C>claire</C> scheme in <C>app.json</C>; iOS may need associated domains and Android needs the intent filter.</span>],
            ['Token missing after redirect', <span key="b">The redirect URL must carry the hash fragment; verify the parsing in <C>googleAuth.ts</C>.</span>],
          ]}
        />
      </Section>

      <Section id="security" title="Security notes">
        <Callout kind="danger" title="The client secret is a secret">
          Never commit it. Keep it in environment variables or a secret store, restrict the OAuth client
          to specific domains in production, and rotate it periodically.
        </Callout>
      </Section>
    </Doc>
  );
}
