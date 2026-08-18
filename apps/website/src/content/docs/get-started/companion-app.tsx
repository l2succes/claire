// SPDX-License-Identifier: Apache-2.0
import { Callout, Definitions, Doc, Mockup, P, Section, Step, Steps, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Desktop companion setup',
  description: 'Set up the Claire Desktop companion for connection flows that require a computer.',
  section: 'get-started',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 4,
  hero: { kind: 'mockup', surface: 'desktop', screen: 'connections', caption: 'Connected platforms in Claire Desktop' },
  related: ['/docs/build-claire/desktop', '/docs/product/connectors'],
};

export default function Page() {
  return (
    <Doc>
      <Callout kind="warning" title="Product status">
        This guide defines the companion connection experience. Signed Claire Desktop installers and
        device pairing are the next implementation milestone — do not publish a download link until they
        ship.
      </Callout>

      <P lede>
        Some chat networks require a desktop companion, because their connection is tied to a computer or
        to an app-owned desktop browser session. Once connected, Claire synchronizes the messages you
        approved for cloud sync, so the inbox and AI features work on your other clients.
      </P>

      <Section id="at-a-glance" title="At a glance">
        <Table
          head={['Network', 'Companion required', 'What you need']}
          rows={[
            ['WhatsApp', 'No', 'Your primary WhatsApp phone, for the normal linked-device flow.'],
            ['Telegram', 'No', 'Your phone number and a Telegram verification code.'],
            ['Instagram', 'Yes', 'Claire Desktop on a Mac or Windows computer.'],
            ['iMessage', 'Yes, macOS only', 'A Mac that stays signed in to Messages with your Apple Account.'],
          ]}
        />
      </Section>

      <Section id="instagram" title="Instagram">
        <P>
          Instagram uses the companion rather than a form in the mobile or web app. The companion owns the
          browser session the bridge needs, so Claire never asks you to open developer tools or paste a
          browser cookie.
        </P>

        <Steps>
          <Step title="Sign in to Claire Desktop">
            <P>Use the same Claire account as your phone or the web app.</P>
          </Step>
          <Step title="Open Settings → Connected platforms → Instagram → Connect" />
          <Step title="Complete Instagram's own sign-in">
            <P>Finish any challenge or two-factor prompt inside the companion window.</P>
          </Step>
          <Step title="Wait for Connected">
            <P>Keep the companion running through the first sync.</P>
          </Step>
          <Step title="Refresh Connected platforms on any client">
            <P>Your Instagram conversations appear as the companion syncs them.</P>
          </Step>
        </Steps>

        <Callout kind="danger" title="Never share credentials">
          Instagram may ask you to approve a new browser or device login — that is normal. Do not give an
          Instagram password, a copied cURL command, or a cookie value to Claire support, and never paste
          one into Claire.
        </Callout>
      </Section>

      <Section id="imessage" title="iMessage">
        <P>
          iMessage requires a Mac companion. iOS, Android, Windows, Linux, and web clients cannot read or
          send through Apple&rsquo;s Messages database directly.
        </P>

        <Steps>
          <Step title="Use a Mac signed in to the owning Apple Account" />
          <Step title="Keep Messages enabled and grant the requested permissions">
            <P>Claire Desktop needs to read local message history and automate sending.</P>
          </Step>
          <Step title="Connect from Settings → Connected platforms → iMessage" />
          <Step title="Leave the Mac powered on and online">
            <P>It is the source of new iMessage events for the rest of Claire.</P>
          </Step>
        </Steps>

        <P>
          The companion uses the normal macOS security model and will not ask you to disable System
          Integrity Protection. That supports basic bridging; some advanced bridge capabilities may remain
          unavailable on a stock Mac.
        </P>

        <Mockup
          surface="desktop"
          screen="imessage-setup"
          caption="The native permission wizard for on-device iMessage setup"
        />
      </Section>

      <Section id="privacy" title="Privacy and reliability">
        <Definitions
          items={[
            {
              term: 'The session stays on your computer',
              description: 'The companion keeps the upstream network session locally, not on Claire servers.',
            },
            {
              term: 'Sync starts only after you connect',
              description:
                'Synced text and captions power the unified inbox, Ask Claire, reply suggestions, and promise tracking.',
            },
            {
              term: 'Disconnecting revokes the connection',
              description: 'Deleting already-imported message history is a separate account-data action.',
            },
            {
              term: 'A companion must be online to receive new messages',
              description:
                'Claire always shows a last-sync timestamp, so it never implies a disconnected computer is live.',
            },
          ]}
        />
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <Table
          head={['Symptom', 'What to do']}
          rows={[
            ['Instagram sign-in is challenged', 'Approve the login in Instagram, finish two-factor, then retry from Claire Desktop.'],
            ['Instagram connected but chats are missing', 'Leave the companion open through the initial sync, then refresh after the last-sync time advances.'],
            ['iMessage is unavailable', 'Confirm the Mac is signed in to Messages, awake, online, and that Claire Desktop has the required permissions.'],
            ['Companion is offline', 'Already-synced messages still show everywhere; new messages cannot arrive until it reconnects.'],
          ]}
        />
      </Section>
    </Doc>
  );
}
