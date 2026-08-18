// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Code, Diagram, Doc, P, Section, Table, Terminal } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Matrix bridge reference',
  description: 'Reference for Claire’s Synapse and mautrix bridge integration.',
  section: 'deploy-operate',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 5,
  roadmap: {
    status: 'in_progress',
    summary: 'Provision Synapse and mautrix bridges for production.',
    issue: 'https://github.com/l2succes/claire/issues/106',
  },
  related: ['/docs/build-claire/architecture', '/docs/deploy-operate/platform-mode'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire bridges every messaging network through Matrix. This is the working reference for the
        mautrix APIs it depends on; the upstream documentation lives at{' '}
        <a href="https://docs.mau.fi/" rel="noreferrer" target="_blank">
          docs.mau.fi
        </a>
        .
      </P>

      <Diagram
        caption="Where the bridges sit"
        summary="The Claire server talks to Synapse, which talks to one mautrix bridge per network, which talks to WhatsApp, Telegram, and Instagram."
      >{`flowchart LR
  Server["Claire server"] --> Synapse["Synapse"]
  Synapse --> WA["mautrix-whatsapp"]
  Synapse --> TG["mautrix-telegram"]
  Synapse --> IG["mautrix-meta"]
  WA --> WhatsApp["WhatsApp"]
  TG --> Telegram["Telegram"]
  IG --> Instagram["Instagram"]`}</Diagram>

      <Section id="bot-commands" title="Bridge bot commands">
        <P>
          Each bridge has a bot user that accepts commands in a control room — a direct message with the
          bot.
        </P>

        <Section id="whatsapp" title="WhatsApp" level={3}>
          <P>
            Bot: <C>@whatsappbot:claire.local</C>
          </P>
          <Table
            head={['Command', 'Effect']}
            rows={[
              [<C key="a">login qr</C>, 'Start the QR code login flow'],
              [<C key="b">login phone</C>, 'Start the phone pairing-code flow'],
              [<C key="c">logout</C>, 'Disconnect WhatsApp'],
              [<C key="d">ping</C>, 'Check connection status'],
              [<C key="e">help</C>, 'List available commands'],
            ]}
          />
          <P>After a successful login the bridge does three things, in order:</P>
          <ol>
            <li>
              Sends <C>Successfully logged in as +&lt;phone&gt;</C> as an <C>m.notice</C>.
            </li>
            <li>Creates portal rooms for each WhatsApp chat, which takes about a minute.</li>
            <li>Backfills the 50 most recent messages per room, configurably.</li>
          </ol>
        </Section>

        <Section id="telegram" title="Telegram" level={3}>
          <P>
            Bot: <C>@telegrambot:claire.local</C>. <C>login</C> prompts for a phone number and then a
            verification code; <C>logout</C> and <C>ping</C> behave as above.
          </P>
        </Section>

        <Section id="instagram" title="Instagram" level={3}>
          <P>
            Bot: <C>@instagrambot:claire.local</C>, with <C>login-cookie</C> to authenticate. The bridge
            is the Meta bridge, so it uses the <C>meta_</C> prefix; set <C>network.mode</C> for Instagram
            DMs.
          </P>
        </Section>
      </Section>

      <Section id="ghost-users" title="Ghost user patterns">
        <P>
          Ghost users represent remote platform contacts inside Matrix. Their IDs follow{' '}
          <C>@&lt;prefix&gt;&lt;platform_id&gt;:&lt;server_name&gt;</C>.
        </P>
        <Table
          head={['Platform', 'Prefix', 'Example']}
          rows={[
            ['WhatsApp', <C key="a">whatsapp_</C>, <C key="b">@whatsapp_15551234567:claire.local</C>],
            ['Telegram', <C key="c">_telegram_</C>, <C key="d">@_telegram_123456789:claire.local</C>],
            ['Instagram', <C key="e">meta_</C>, <C key="f">@meta_987654321:claire.local</C>],
            ['iMessage', <C key="g">_imessage_</C>, <C key="h">@_imessage_+15551234567:claire.local</C>],
          ]}
        />
        <Callout kind="warning" title="These must match in two places">
          The prefixes are configured in <C>server/src/adapters/matrix/types.ts</C> and must match the{' '}
          <C>username_template</C> in each bridge&rsquo;s appservice registration. A mismatch shows up as
          &ldquo;user not found&rdquo; rather than as a config error.
        </Callout>
      </Section>

      <Section id="self-ghost" title="The self ghost user">
        <P>
          Without double puppeting, a user&rsquo;s own messages arrive from their ghost user rather than
          from the bot. If the linked WhatsApp number is +15551234567, outgoing messages come from{' '}
          <C>@whatsapp_15551234567:claire.local</C>. The server parses the number out of the login success
          message and tracks it as the session&rsquo;s self ghost ID, so <C>isFromMe</C> is set correctly.
        </P>
      </Section>

      <Section id="double-puppeting" title="Double puppeting">
        <P>
          Enabled in Claire, gated behind <C>ENABLE_DOUBLE_PUPPETING=true</C> in the server environment.
          With it active, messages a user sends from their phone appear as their actual Matrix account
          instead of their ghost, the server tracks <C>matrixUserId</C> per session, and locally sent
          event IDs are tracked to prevent echo loops.
        </P>
        <Code lang="yaml" title="docker/matrix/bridges/<platform>/config.yaml">{`bridge:
  double_puppet:
    secrets:
      claire.local: "as_token:<bridge_as_token>"`}</Code>
      </Section>

      <Section id="backfill" title="Backfill behaviour">
        <P>
          Backfill is constrained by Matrix itself, and the constraints surprise people, so they are worth
          stating plainly:
        </P>
        <ul>
          <li>Matrix does not support inserting messages into room history.</li>
          <li>Backfilled messages land at the end of the timeline regardless of their original timestamp.</li>
          <li>Historical backfill only works in new, empty rooms.</li>
          <li>WhatsApp uses one-time history-sync blobs sent after device linking.</li>
          <li>MSC2716, which would have allowed true history insertion, was abandoned.</li>
        </ul>
      </Section>

      <Section id="appservice" title="Appservice registration">
        <P>
          Each bridge needs a registration file referenced from Synapse&rsquo;s <C>homeserver.yaml</C>.
        </P>
        <Code lang="yaml" title="homeserver.yaml">{`app_service_config_files:
  - /data/whatsapp-registration.yaml
  - /data/telegram-registration.yaml
  - /data/instagram-registration.yaml`}</Code>
        <Table
          head={['Field', 'Purpose']}
          rows={[
            [<C key="a">as_token / hs_token</C>, 'Authentication between the bridge and Synapse.'],
            [<C key="b">username_template</C>, 'Controls the ghost user ID format. Must match GHOST_USER_PREFIXES.'],
            [<C key="c">bot_username</C>, 'The bridge bot user ID.'],
          ]}
        />
      </Section>

      <Section id="troubleshooting" title="Troubleshooting">
        <Table
          head={['Symptom', 'Likely cause']}
          rows={[
            ['Bot not responding', <span key="a">Appservice connectivity — check <C>docker logs claire-synapse</C>.</span>],
            ['No messages bridged', <span key="b">Bridge is not logged in. Send <C>ping</C> in the control room.</span>],
            ['Login loop', 'WhatsApp disconnects linked devices after the phone is offline for more than two weeks.'],
            ['“User not found”', <span key="c">Ghost prefix mismatch between the bridge config and <C>types.ts</C>.</span>],
          ]}
        />
        <Terminal>{`docker logs claire-mautrix-whatsapp -f
docker logs claire-mautrix-telegram -f
docker logs claire-mautrix-instagram -f
docker logs claire-synapse -f`}</Terminal>
      </Section>
    </Doc>
  );
}
