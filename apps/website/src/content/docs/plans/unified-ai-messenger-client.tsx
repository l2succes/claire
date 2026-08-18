// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Unified AI messenger client plan",
  description: "Client architecture and implementation plan for the unified messaging experience.",
  section: 'plans',
  status: 'draft',
  lastReviewed: '2026-08-17',
  related: ['/docs/build-claire/architecture'],
};

export default function Page() {
  return (
    <Doc>
      <Section id="overview" title="Overview">
      <P>Extend the Claire mobile client to support multiple messaging platforms (WhatsApp, Telegram, Instagram, iMessage) in a unified inbox. Users can connect each platform independently and view/send messages across all of them from a single interface.</P>
      </Section>
      <Section id="architecture" title="Architecture">
      <Code lang="text">{"┌─────────────────────────────────────────────────────────────┐\n│                    React Native Client                       │\n│                                                              │\n│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐  │\n│  │  Auth Flow   │    │   Dashboard  │    │   Settings    │  │\n│  │              │    │              │    │               │  │\n│  │ - Sign in    │    │ - Unified    │    │ - Platform    │  │\n│  │ - Platform   │    │   Inbox      │    │   management  │  │\n│  │   connection │    │ - Filtering  │    │ - Connect /   │  │\n│  │   check      │    │   by platform│    │   disconnect  │  │\n│  └──────────────┘    └──────────────┘    └───────────────┘  │\n│           │                 │                   │            │\n│           └─────────────────┴───────────────────┘           │\n│                             │                                │\n│                   ┌─────────▼─────────┐                     │\n│                   │   platformStore   │                     │\n│                   │  (Zustand state)  │                     │\n│                   └─────────┬─────────┘                     │\n│                             │                                │\n│                   ┌─────────▼─────────┐                     │\n│                   │  Platform Service │                     │\n│                   │   (API calls)     │                     │\n│                   └─────────┬─────────┘                     │\n└─────────────────────────────┼───────────────────────────────┘\n                              │\n                    ┌─────────▼─────────┐\n                    │   Claire Backend   │\n                    │  /api/platforms/*  │\n                    └───────────────────┘"}</Code>
      </Section>
      <Section id="components" title="Components">
      <Section id="new-components" title="New Components" level={3}>
      <Table
              head={[<>Component</>, <>Path</>, <>Description</>]}
              rows={[
                [<><C>PlatformIcon</C></>, <><C>components/PlatformIcon</C></>, <>Platform logo with status indicator</>],
                [<><C>PlatformSelector</C></>, <><C>components/PlatformSelector</C></>, <>Horizontal scroll to filter by platform</>],
                [<><C>PlatformAuthModal</C></>, <><C>components/PlatformAuthModal</C></>, <>Platform connection flow (QR, phone, cookie)</>],
                [<><C>ConnectedPlatformsList</C></>, <><C>components/ConnectedPlatformsList</C></>, <>List of connected platforms in settings</>],
              ]}
            />
      </Section>
      <Section id="modified-components-screens" title="Modified Components / Screens" level={3}>
      <Table
              head={[<>File</>, <>Changes</>]}
              rows={[
                [<><C>components/MessageCard</C></>, <>Add platform badge (icon + color) to each message</>],
                [<><C>screens/LoginScreen</C></>, <>Add platform connection step after sign-in</>],
                [<><C>screens/DashboardScreen</C></>, <>Unified inbox with platform filter tabs</>],
                [<><C>screens/SettingsScreen</C></>, <>Platform management section</>],
                [<><C>screens/SignInScreen</C></>, <>Check all platform connections on load</>],
              ]}
            />
      </Section>
      </Section>
      <Section id="state-management" title="State Management">
      <Section id="platformstore-zustand" title="platformStore (Zustand)" level={3}>
      <Code lang="typescript">{"interface PlatformStore {\n  platforms: PlatformConnection[];       // All platforms with status\n  activePlatformFilter: string | null;   // Current inbox filter\n  isLoading: boolean;\n  error: string | null;\n\n  fetchPlatforms: () => Promise<void>;\n  connectPlatform: (type: PlatformType) => Promise<void>;\n  disconnectPlatform: (type: PlatformType) => Promise<void>;\n  setFilter: (platform: string | null) => void;\n}"}</Code>
      </Section>
      <Section id="mobile-side-types" title="Mobile-Side Types" level={3}>
      <Code lang="typescript">{"type PlatformType = 'whatsapp' | 'telegram' | 'instagram' | 'imessage';\n\ninterface PlatformConnection {\n  type: PlatformType;\n  status: 'connected' | 'connecting' | 'disconnected' | 'error';\n  displayName: string;\n  lastSeen?: Date;\n}\n\ninterface UnifiedMessage extends Message {\n  platform: PlatformType;\n  platformChatId: string;\n}"}</Code>
      </Section>
      </Section>
      <Section id="platform-auth-flows" title="Platform Auth Flows">
      <Table
              head={[<>Platform</>, <>Method</>, <>User Action</>]}
              rows={[
                [<>WhatsApp</>, <>QR Code</>, <>Scan with WhatsApp mobile app</>],
                [<>Telegram</>, <>Phone + Code</>, <>Enter phone, then SMS code</>],
                [<>Instagram</>, <>Session cookie</>, <>Extract from browser (advanced)</>],
                [<>iMessage</>, <>Mac pairing</>, <>Pair with local macOS device</>],
              ]}
            />
      </Section>
      <Section id="api-endpoints-used" title="API Endpoints Used">
      <Code lang="text">{"GET  /api/platforms              - List connected platforms + status\nPOST /api/platforms/:type/connect    - Start connection flow\nPOST /api/platforms/:type/disconnect - Disconnect platform\nGET  /api/platforms/:type/status     - Poll connection status\nGET  /api/messages?platform=all      - Unified inbox\nGET  /api/messages?platform=whatsapp - Filtered inbox"}</Code>
      </Section>
      <Section id="tasks" title="Tasks">
      <Table
              head={[<>#</>, <>Task</>, <>Status</>]}
              rows={[
                [<>1</>, <>Create platform service layer for API calls</>, <>Done</>],
                [<>2</>, <>Create platformStore for multi-platform state management</>, <>Done</>],
                [<>3</>, <>Create PlatformIcon component</>, <>Done</>],
                [<>4</>, <>Create PlatformSelector component</>, <>Done</>],
                [<>5</>, <>Create PlatformAuthModal component</>, <>Done</>],
                [<>6</>, <>Update MessageCard to show platform badges</>, <>Done</>],
                [<>7</>, <>Create ConnectedPlatformsList component</>, <>Done</>],
                [<>8</>, <>Update login screen for multi-platform connection</>, <>Done</>],
                [<>9</>, <>Update dashboard for unified inbox with platform filtering</>, <>Done</>],
                [<>10</>, <>Update settings screen with platform management</>, <>Done</>],
                [<>11</>, <>Create type definitions for client-side platform types</>, <>Done</>],
                [<>12</>, <>Update signin flow to check all platform connections</>, <>Done</>],
                [<>13</>, <>Add platform connection status polling</>, <>Pending</>],
                [<>14</>, <>Create integration tests for platform flows</>, <>Pending</>],
              ]}
            />
      </Section>
      <Section id="remaining-work" title="Remaining Work">
      <Section id="task-13-platform-connection-status-polling" title="Task 13: Platform Connection Status Polling" level={3}>
      <P>Poll <C>GET /api/platforms/:type/status</C> while a connection is in progress (e.g. waiting for QR scan). Stop polling once connected or failed.</P>
      <ul>
              <li>Interval: every 3 seconds</li>
              <li>Timeout: 2 minutes</li>
              <li>Trigger: when platform status is <C>connecting</C></li>
              <li>Update platformStore on each poll</li>
            </ul>
      </Section>
      <Section id="task-14-integration-tests" title="Task 14: Integration Tests" level={3}>
      <P>Cover the main platform flows end-to-end:</P>
      <ul>
              <li>Connect WhatsApp (QR code flow)</li>
              <li>Connect Telegram (phone + code flow)</li>
              <li>Filter unified inbox by platform</li>
              <li>Disconnect a platform</li>
              <li>Sign-in with all platforms already connected</li>
            </ul>
      </Section>
      </Section>
    </Doc>
  );
}
