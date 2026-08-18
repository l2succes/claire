// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Matrix bridge integration plan",
  description: "Original implementation plan for routing Claire messaging platforms through Matrix bridges.",
  section: 'plans',
  status: 'archived',
  lastReviewed: '2026-08-17',
  related: ['/docs/build-claire/architecture', '/docs/deploy-operate/matrix-bridges'],
};

export default function Page() {
  return (
    <Doc>
      <Section id="overview" title="Overview">
      <P>Add Matrix bridge support alongside existing direct adapters. A <C>PLATFORM_MODE</C> environment variable switches between:</P>
      <ul>
              <li><b>`direct`</b> (current) - Native platform libraries (whatsapp-web.js, telegraf, etc.)</li>
              <li><b>`matrix`</b> (new) - Matrix bridges via Synapse homeserver (mautrix-*)</li>
            </ul>
      <P>Both modes use the same <C>IPlatformAdapter</C>{" interface - the client/API doesn't know the difference."}</P>
      </Section>
      <Section id="architecture" title="Architecture">
      <Code lang="text">{"┌─────────────────────────────────────────────────────────────────────┐\n│                         Claire Backend                               │\n│                      PlatformManager (existing)                      │\n│                              │                                       │\n│              ┌───────────────┴───────────────┐                      │\n│              ▼                               ▼                       │\n│     PLATFORM_MODE=direct            PLATFORM_MODE=matrix             │\n│              │                               │                       │\n│    ┌─────────┴─────────┐            ┌───────┴───────┐               │\n│    │  Direct Adapters  │            │ MatrixAdapter │               │\n│    │  (existing code)  │            │   (new code)  │               │\n│    └─────────┬─────────┘            └───────┬───────┘               │\n│              │                               │                       │\n│    Platform APIs                    Matrix Homeserver                │\n│    (whatsapp-web.js,               (Synapse + mautrix               │\n│     telegraf, etc.)                  bridges in Docker)              │\n└─────────────────────────────────────────────────────────────────────┘"}</Code>
      </Section>
      <Section id="why-matrix-bridges" title="Why Matrix Bridges?">
      <Table
              head={[<>Aspect</>, <>Direct Adapters</>, <>Matrix Bridges</>]}
              rows={[
                [<>Reliability</>, <>Untested</>, <>Battle-tested by Beeper</>],
                [<>Maintenance</>, <>We maintain</>, <>Community maintained</>],
                [<>Edge cases</>, <>We handle</>, <>Already handled</>],
                [<>Setup</>, <>npm install</>, <>Docker + config</>],
                [<>Resource usage</>, <>Light</>, <>~2-4GB RAM</>],
              ]}
            />
      </Section>
      <Section id="files-to-create" title="Files to Create">
      <Code lang="text">{"server/src/adapters/matrix/\n├── index.ts                    # MatrixBridgeAdapter class\n├── types.ts                    # Matrix-specific types\n├── client.ts                   # matrix-js-sdk wrapper\n├── room-mapper.ts              # Matrix rooms ↔ platform chats\n├── user-mapper.ts              # Ghost users ↔ platform contacts\n├── event-converter.ts          # Matrix events → UnifiedMessage\n└── bridge-auth/\n    ├── index.ts                # Auth flow coordinator\n    ├── whatsapp.ts             # QR code flow via bridge bot\n    ├── telegram.ts             # Phone login flow\n    └── instagram.ts            # Cookie auth flow\n\ndocker/matrix/\n├── docker-compose.matrix.yml   # Synapse + all bridges\n├── synapse/\n│   └── homeserver.yaml.template\n└── bridges/\n    ├── whatsapp/config.yaml.template\n    ├── telegram/config.yaml.template\n    └── instagram/config.yaml.template\n\nsupabase/migrations/\n└── 20260206_add_matrix_mappings.sql"}</Code>
      </Section>
      <Section id="files-to-modify" title="Files to Modify">
      <Table
              head={[<>File</>, <>Changes</>]}
              rows={[
                [<><C>server/src/config/index.ts</C></>, <>Add <C>PLATFORM_MODE</C>, Matrix env vars</>],
                [<><C>server/src/adapters/index.ts</C></>, <>Add <C>setMatrixMode()</C> to PlatformManager</>],
                [<><C>server/src/index.ts</C></>, <>Conditional adapter initialization</>],
                [<><C>server/package.json</C></>, <>Add <C>matrix-js-sdk</C> dependency</>],
              ]}
            />
      </Section>
      <Section id="new-dependencies" title="New Dependencies">
      <Code lang="json">{"{\n  \"matrix-js-sdk\": \"^34.0.0\"\n}"}</Code>
      </Section>
      <Section id="implementation-phases" title="Implementation Phases">
      <Section id="phase-1-configuration-types-1-hour" title="Phase 1: Configuration & Types (~1 hour)" level={3}>
      <ol>
              <li>Add to <C>server/src/config/index.ts</C>: ``<C>{"typescript PLATFORM_MODE: z.enum(['direct', 'matrix']).default('direct'), MATRIX_HOMESERVER_URL: z.string().url().optional(), MATRIX_SERVER_NAME: z.string().optional(), MATRIX_ADMIN_TOKEN: z.string().optional(), "}</C>``</li>
              <li>Create <C>server/src/adapters/matrix/types.ts</C> with Matrix-specific interfaces</li>
            </ol>
      </Section>
      <Section id="phase-2-matrixbridgeadapter-core-3-hours" title="Phase 2: MatrixBridgeAdapter Core (~3 hours)" level={3}>
      <ol>
              <li>Create <C>server/src/adapters/matrix/index.ts</C>:</li>
              <li>Extends <C>BasePlatformAdapter</C></li>
              <li>Connects to Synapse via <C>matrix-js-sdk</C></li>
              <li>Handles <C>RoomEvent.Timeline</C> for incoming messages</li>
              <li>Manages control rooms for bridge bot commands</li>
              <li>Key methods:</li>
              <li><C>initialize()</C> - Connect to homeserver, start sync</li>
              <li><C>createSession()</C> - Create control room with bridge bot, send login command</li>
              <li><C>sendMessage()</C> - Find Matrix room, send via SDK</li>
              <li><C>getChats()</C> - List rooms with bridge ghost users</li>
            </ol>
      </Section>
      <Section id="phase-3-room-user-mappers-2-hours" title="Phase 3: Room & User Mappers (~2 hours)" level={3}>
      <ol>
              <li>Create <C>room-mapper.ts</C>:</li>
              <li>Maps <C>platform:chatId</C> ↔ <C>matrixRoomId</C></li>
              <li>Identifies rooms by ghost user presence (e.g., <C>@_wa_12345:server.com</C>)</li>
              <li>Create <C>user-mapper.ts</C>:</li>
              <li>Converts ghost users to platform contacts</li>
              <li>Ghost patterns: <C>@_wa_*</C>, <C>@_telegram_*</C>, <C>@_instagram_*</C></li>
              <li>Create <C>event-converter.ts</C>:</li>
              <li>Converts Matrix <C>m.room.message</C> events to <C>UnifiedMessage</C></li>
            </ol>
      </Section>
      <Section id="phase-4-bridge-auth-flows-2-hours" title="Phase 4: Bridge Auth Flows (~2 hours)" level={3}>
      <ol>
              <li>Create <C>bridge-auth/whatsapp.ts</C>:</li>
              <li>Send <C>login</C> to bridge bot</li>
              <li>Parse QR code from <C>m.image</C> response</li>
              <li>Emit <C>qr_code</C> event for client</li>
              <li>Create <C>bridge-auth/telegram.ts</C>:</li>
              <li>Send <C>login +phone</C> to bridge bot</li>
              <li>Handle verification code prompt</li>
              <li>Create <C>bridge-auth/instagram.ts</C>:</li>
              <li>Send <C>{"login-cookie <cookies>"}</C> to bridge bot</li>
            </ol>
      </Section>
      <Section id="phase-5-docker-infrastructure-2-hours" title="Phase 5: Docker Infrastructure (~2 hours)" level={3}>
      <ol>
              <li>Create <C>docker/matrix/docker-compose.matrix.yml</C>: ``<C>yaml services: synapse: image: matrixdotorg/synapse:latest postgres-synapse: image: postgres:15-alpine mautrix-whatsapp: image: dock.mau.dev/mautrix/whatsapp:latest mautrix-telegram: image: dock.mau.dev/mautrix/telegram:latest mautrix-instagram: image: dock.mau.dev/mautrix/meta:latest </C>``</li>
              <li>Create bridge config templates with environment variable substitution</li>
              <li>Create <C>scripts/init-bridges.sh</C> for registration file generation</li>
            </ol>
      </Section>
      <Section id="phase-6-mode-switching-testing-2-hours" title="Phase 6: Mode Switching & Testing (~2 hours)" level={3}>
      <ol>
              <li>Update <C>server/src/index.ts</C>: ``<C>{"typescript if (matrixConfig.enabled) { const matrixAdapter = new MatrixBridgeAdapter(config); platformManager.setMatrixMode(matrixAdapter); } else { // existing direct adapter registration } "}</C>``</li>
              <li>Update <C>PlatformManager.getAdapter()</C> for matrix mode</li>
              <li>Write integration tests with mock Matrix server</li>
            </ol>
      </Section>
      </Section>
      <Section id="database-migration" title="Database Migration">
      <Code lang="sql">{"-- Matrix room mappings for bridge mode\nCREATE TABLE public.matrix_room_mappings (\n    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),\n    user_id UUID NOT NULL REFERENCES public.users(id),\n    session_id TEXT NOT NULL,\n    platform platform_type NOT NULL,\n    matrix_room_id TEXT NOT NULL,\n    platform_chat_id TEXT NOT NULL,\n    is_control_room BOOLEAN DEFAULT FALSE,\n    UNIQUE(matrix_room_id)\n);"}</Code>
      </Section>
      <Section id="environment-variables" title="Environment Variables">
      <Code lang="bash">{"# Platform Mode\nPLATFORM_MODE=direct   # or 'matrix'\n\n# Matrix Configuration (required when PLATFORM_MODE=matrix)\nMATRIX_HOMESERVER_URL=http://localhost:8008\nMATRIX_SERVER_NAME=claire.local\nMATRIX_ADMIN_TOKEN=replace_with_admin_token\n\n# Telegram API (required for mautrix-telegram)\nTELEGRAM_API_ID=12345\nTELEGRAM_API_HASH=replace_with_telegram_api_hash"}</Code>
      </Section>
      <Section id="platform-auth-flows-matrix-mode" title="Platform Auth Flows (Matrix Mode)">
      <Table
              head={[<>Platform</>, <>Bridge Bot</>, <>Auth Command</>, <>User Action</>]}
              rows={[
                [<>WhatsApp</>, <>@whatsappbot</>, <><C>login</C></>, <>Scan QR with phone</>],
                [<>Telegram</>, <>@telegrambot</>, <><C>login +phone</C></>, <>Enter SMS code</>],
                [<>Instagram</>, <>@instagrambot</>, <><C>{"login-cookie <c>"}</C></>, <>Extract browser cookies</>],
                [<>iMessage</>, <>N/A</>, <>N/A</>, <>Not recommended via Matrix</>],
              ]}
            />
      </Section>
      <Section id="imessage-note" title="iMessage Note">
      <P><b>iMessage via mautrix-imessage is NOT recommended</b> for server deployment:</P>
      <ul>
              <li>Requires local macOS machine with SIP disabled</li>
              <li>Cannot run in Docker</li>
              <li>Keep using direct iMessage adapter instead</li>
            </ul>
      </Section>
      <Section id="verification" title="Verification">
      <ol>
              <li><b>Start Matrix stack</b>: <C>docker compose -f docker/matrix/docker-compose.matrix.yml up -d</C></li>
              <li><b>Set env</b>: <C>PLATFORM_MODE=matrix</C></li>
              <li><b>Start server</b>: <C>bun run dev</C></li>
              <li><b>Test WhatsApp</b>:</li>
              <li><C>POST /platforms/whatsapp/connect</C> → Get QR code</li>
              <li>Scan with phone</li>
              <li>Send message → Verify received in Claire</li>
              <li><b>Test Telegram</b>:</li>
              <li><C>POST /platforms/telegram/connect</C> with phone number</li>
              <li>Enter verification code</li>
              <li>Message bot → Verify received</li>
              <li><b>Run tests</b>: <C>bun test src/adapters/matrix</C></li>
            </ol>
      </Section>
      <Section id="critical-files" title="Critical Files">
      <ul>
              <li><C>server/src/adapters/types.ts</C> - IPlatformAdapter interface to implement</li>
              <li><C>server/src/adapters/base-adapter.ts</C> - Base class to extend</li>
              <li><C>server/src/adapters/index.ts</C> - PlatformManager to modify</li>
              <li><C>server/src/config/index.ts</C> - Config schema to extend</li>
              <li><C>server/src/index.ts</C> - Server startup to modify</li>
            </ul>
      </Section>
      <Section id="estimated-time" title="Estimated Time">
      <Table
              head={[<>Phase</>, <>Time</>]}
              rows={[
                [<>{"Phase 1: Config & Types"}</>, <>1 hour</>],
                [<>Phase 2: MatrixBridgeAdapter</>, <>3 hours</>],
                [<>Phase 3: Mappers</>, <>2 hours</>],
                [<>Phase 4: Auth Flows</>, <>2 hours</>],
                [<>Phase 5: Docker</>, <>2 hours</>],
                [<>Phase 6: Testing</>, <>2 hours</>],
                [<><b>Total</b></>, <><b>~12 hours</b></>],
              ]}
            />
      </Section>
      <Section id="rollback-plan" title="Rollback Plan">
      <P>If Matrix mode has issues:</P>
      <ol>
              <li>Set <C>PLATFORM_MODE=direct</C></li>
              <li>Restart server</li>
              <li>Direct adapters resume immediately</li>
              <li>No data loss - sessions stored separately by mode</li>
            </ol>
      </Section>
    </Doc>
  );
}
