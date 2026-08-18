// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Card, Cards, Code, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Design system migration guide',
  description: 'Move Claire surfaces onto shared semantic tokens and native primitives, incrementally.',
  section: 'build-claire',
  status: 'draft',
  lastReviewed: '2026-08-17',
  order: 4,
  hero: { kind: 'mockup', surface: 'mobile', screen: 'contacts', caption: 'The visual target for migrated screens' },
  related: ['/docs/build-claire/mobile', '/docs/build-claire/desktop'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        This guide moves the existing Expo client toward the visual system the mockups demonstrate. The
        migration must stay incremental — do not rewrite routing, data fetching, and presentation in one
        change.
      </P>

      <Cards>
        <Card href="/mockups/mobile" icon="phone" title="Mobile mockups" description="The reference for every mobile screen." />
        <Card href="/mockups/desktop" icon="desktop" title="Desktop mockups" description="Window composition and desktop density." />
      </Cards>

      <Section id="goals" title="Migration goals">
        <ul>
          <li>One semantic token source for iOS, Android, macOS, Windows, and marketing web.</li>
          <li>
            A shared product language, without pretending mobile and desktop layouts are the same thing.
          </li>
          <li>One-off colors, radii, and text sizes replaced by primitives.</li>
          <li>
            Messaging, bridge, authentication, and AI behaviour preserved throughout the visual rollout.
          </li>
          <li>Every migrated screen easy to compare against the design reference.</li>
        </ul>
      </Section>

      <Section id="package" title="The design-system package">
        <Code lang="text" title="packages/design-system" copy={false}>{`src/
  tokens/      color · type · space · radius · motion
  theme/       ThemeProvider · useTheme
  primitives/  ClaireText · ClaireButton · ClaireIconButton · ClaireCard
               ClaireAvatar · ClaireChip · ClaireField · ClaireDivider
  patterns/    ConversationRow · MessageBubble · PlatformBadge
               AIAssistCard · PromiseCard`}</Code>
        <P>
          Start inside <C>mobile/design-system/</C> if workspace wiring would slow the first pull
          request, then extract to <C>packages/</C> when the desktop bootstrap begins.
        </P>
      </Section>

      <Section id="tokens" title="Token translation">
        <P>
          The HTML mockups use CSS custom properties as documentation only. Native apps import typed
          token objects.
        </P>
        <Code lang="typescript" title="packages/design-system/src/tokens.ts">{`export const colors = {
  ink: '#10120F',
  cream: '#F4F1EA',
  paper: '#FFFDF8',
  lime: '#DFFF64',
  sky: '#B9DCFF',
  focus: '#3C68FF',
  success: '#18794E',
  warning: '#B75D00',
  danger: '#C83A3A',
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64, 24: 96 } as const;
export const radius = { control: 12, card: 20, panel: 32, feature: 48, pill: 999 } as const;`}</Code>
        <Callout kind="note" title="System fonts win on native">
          Public Sans may stay in marketing pages, but an AppKit/UIKit system font gives better platform
          metrics and accessibility. DM Mono is optional for compact metadata; prefer the platform
          monospaced font where possible.
        </Callout>
      </Section>

      <Section id="typography" title="Semantic typography">
        <P>Define variants rather than passing raw font sizes.</P>
        <Table
          head={['Variant', 'Mobile', 'Desktop', 'Usage']}
          rows={[
            [<C key="a">display</C>, '42/42', '52/52', 'Onboarding and major empty states'],
            [<C key="b">screenTitle</C>, '31/34', '28/31', 'Screen or window destination title'],
            [<C key="c">sectionTitle</C>, '20/24', '18/22', 'Section and inspector headings'],
            [<C key="d">body</C>, '15/22', '14/20', 'Primary reading text'],
            [<C key="e">bodySmall</C>, '13/18', '12/17', 'Supporting content'],
            [<C key="f">label</C>, '11/15', '10/14', 'Controls and metadata'],
            [<C key="g">monoLabel</C>, '10/14', '9/13', 'AI and status labels'],
          ]}
        />
        <P>
          Every text component must support Dynamic Type and system font scaling. Avoid fixed-height
          containers around user-generated text.
        </P>
      </Section>

      <Section id="component-rules" title="Component rules">
        <Section id="avatar" title="Avatar" level={3}>
          <ul>
            <li>
              Always set equal width and height, <C>aspectRatio: 1</C>, and <C>flexShrink: 0</C>.
            </li>
            <li>
              The platform badge is positioned relative to the avatar wrapper and never allowed to change
              avatar layout.
            </li>
            <li>The text fallback uses initials with a stable contact-derived color.</li>
          </ul>
        </Section>

        <Section id="platform-badge" title="Platform badge" level={3}>
          <ul>
            <li>Include a glyph and an accessible platform name — color alone is insufficient.</li>
            <li>Keep the badge subordinate to the person and the conversation.</li>
            <li>Use real vector or SF Symbol assets in production, not the letter placeholders.</li>
          </ul>
        </Section>

        <Section id="ai-assist" title="AI assist card" level={3}>
          <ul>
            <li>
              Always state why it appeared: quick context, promise found, suggested reply, or answer.
            </li>
            <li>Generated answers link back to their source messages.</li>
            <li>The primary action is explicit; dismissal and correction are always available.</li>
            <li>
              AI color is contextual — sky, lavender, or a warm promise yellow — never a generic gradient.
            </li>
          </ul>
        </Section>

        <Section id="button" title="Button" level={3}>
          <ul>
            <li>Mobile touch target at least 44 points, even when the icon is smaller.</li>
            <li>Desktop pointer target at least 28 points, ideally 32–36.</li>
            <li>Focus ring: a 3-point focus token with offset.</li>
            <li>Destructive actions use the danger token only once intent is clear.</li>
          </ul>
        </Section>
      </Section>

      <Section id="screen-mapping" title="Existing screen mapping">
        <Table
          head={['Existing route', 'New target', 'Migration note']}
          rows={[
            [<C key="a">app/(tabs)/dashboard.tsx</C>, 'Daily brief', 'Keep the smart-card data; replace section composition.'],
            [<C key="b">app/(tabs)/messages.tsx</C>, 'Unified inbox', 'Move platform filters into chips; normalize conversation rows.'],
            [<C key="c">app/chat/[chatId].tsx</C>, 'Chat', 'Add the AI context ribbon and inline promise card behind flags.'],
            [<C key="d">app/(tabs)/promises.tsx</C>, 'Promises', 'Introduce summary metrics and source-message links.'],
            [<C key="e">app/(tabs)/contacts.tsx</C>, 'People', 'Add a context-needed section and a relationship entry.'],
            [<C key="f">app/chat/settings/[chatId].tsx</C>, 'Relationship memory', 'Recompose prompt, type, and tone around a contact model.'],
            [<C key="g">app/(tabs)/settings.tsx</C>, 'Settings hub', 'Split Claire behaviour from app and infrastructure settings.'],
            [<C key="h">PlatformAuthModal.tsx</C>, 'Connection setup', 'Render steps from capability and connection definitions.'],
            [<C key="i">MessageCard.tsx</C>, 'Conversation and message patterns', 'Split the inbox row from the chat bubble instead of one card doing both.'],
          ]}
        />
      </Section>

      <Section id="rollout" title="Recommended rollout">
        <ol>
          <li>
            <b>Snapshot and protect behaviour.</b> Capture screenshots and flow tests for sign-in, inbox
            filters, chat send, platform auth, promise tracking, and relationship settings. Add a{' '}
            <C>newDesignSystem</C> flag that switches presentation only — never maintain two data
            implementations.
          </li>
          <li>
            <b>Tokens and primitives.</b> Typed tokens, then text, button, icon button, card, avatar,
            chip, field, and divider. Test light mode first.
          </li>
          <li>
            <b>Shared patterns.</b> Platform badge, conversation row, message bubble and composer, AI
            assist and promise cards, settings row and toggle, and the empty, error, and skeleton states.
          </li>
          <li>
            <b>Migrate the core loop</b>, one screen at a time behind the flag: inbox, chat, daily brief,
            promises, search.
          </li>
          <li>
            <b>People and settings.</b> Replace free-form relationship strings with an enum plus an
            optional custom label; keep the prompt user-authored and visible.
          </li>
          <li>
            <b>Remove legacy styling.</b> Delete old color constants only when no references remain, then
            drop the flag.
          </li>
          <li>
            <b>Extract for desktop.</b> Move tokens and primitives to <C>packages/design-system</C>, and
            keep navigation and window composition outside the shared package.
          </li>
        </ol>
      </Section>

      <Section id="navigation" title="Navigation migration">
        <P>
          The proposed mobile shell is Home, Inbox, Promises, and Search, with People as an Inbox subview
          and Settings opening from the profile.
        </P>
        <Callout kind="warning" title="Do not change topology and visuals together">
          Reskin the existing tabs without route changes first. Then add Search, move Contacts into the
          Inbox stack, move Settings to the profile entry, update deep links and notification routes, and
          only remove old tab routes once telemetry and tests confirm equivalent access.
        </Callout>
      </Section>

      <Section id="relationship-memory" title="Relationship memory data model">
        <Code lang="typescript" title="Relationship memory">{`type RelationshipType =
  | 'business' | 'client' | 'colleague' | 'mentor'
  | 'family' | 'close_friend' | 'friend' | 'acquaintance'
  | 'dating' | 'partner' | 'former_partner'
  | 'community' | 'service_provider' | 'other';

type SuggestionTone = 'warm_direct' | 'professional' | 'casual' | 'playful' | 'custom';

interface RelationshipMemory {
  contactId: string;
  type: RelationshipType;
  customType?: string;
  prompt?: string;
  suggestionTone: SuggestionTone;
  updatedAt: string;
}`}</Code>
        <Callout kind="danger" title="Relationship type changes suggestion context only">
          It must never change access, notification priority, retention, or safety policy without a
          separate, explicit control.
        </Callout>
      </Section>

      <Section id="platform-styling" title="Platform-specific styling policy">
        <P>Three layers, in order:</P>
        <ol>
          <li>
            <b>Shared semantics.</b> Colors, spacing, typography variants, state names.
          </li>
          <li>
            <b>Shared patterns.</b> Data and interaction contract.
          </li>
          <li>
            <b>Platform composition.</b> Mobile tab screens versus desktop panes and windows.
          </li>
        </ol>
        <P>
          So <C>ConversationRow.tsx</C> shares behaviour and base visuals, while{' '}
          <C>ConversationRow.macos.tsx</C> and <C>ConversationRow.windows.tsx</C> add host keyboard
          conventions, hover, context menus, selection, and pointer density. Do not scale a 390-point
          phone screen to fill a desktop window.
        </P>
      </Section>

      <Section id="styling-tech" title="Styling technology">
        <P>
          Native production code consumes token objects and React Native style props. Do not make
          Tailwind or NativeWind a requirement for the shared desktop package until both desktop-host
          compatibility spikes are proven.
        </P>
        <ul>
          <li>Existing NativeWind screens can import token values through the client Tailwind mapping.</li>
          <li>New shared primitives accept semantic props and produce native styles internally.</li>
          <li>Feature screens must not contain raw hex codes.</li>
          <li>Use continuous border curves on Apple platforms where supported.</li>
          <li>
            Use native <C>boxShadow</C>, not the legacy <C>shadow*</C> or <C>elevation</C> APIs.
          </li>
        </ul>
      </Section>

      <Section id="accessibility" title="Accessibility checklist">
        <ul>
          <li>44-point mobile touch targets and visible keyboard focus on desktop.</li>
          <li>Correct roles and labels for icon-only buttons.</li>
          <li>Platform badges announced after the contact or conversation name.</li>
          <li>Dynamic Type, system text scaling, reduced motion, and reduced transparency.</li>
          <li>Contrast testing for cream, paper, and all pastel surfaces.</li>
          <li>Text or icons accompany every status color.</li>
          <li>Message state — sending, failed, read — is never communicated by color alone.</li>
        </ul>
      </Section>

      <Section id="visual-qa" title="Visual QA matrix">
        <P>Test each migrated screen at:</P>
        <ul>
          <li>iPhone SE width, standard iPhone, and large iPhone; iPad split view if enabled.</li>
          <li>macOS and Windows at 1024×680 minimum, 1280×800, and 1440×900.</li>
          <li>Increased text size at 135% and 200%.</li>
          <li>Reduce Motion, Increase Contrast, and VoiceOver.</li>
          <li>Empty, one-item, typical, and high-density data.</li>
          <li>Every platform capability combination.</li>
          <li>Light mode — add dark only after semantic dark tokens are approved.</li>
        </ul>
      </Section>

      <Section id="done" title="Definition of done, per screen">
        <ul>
          <li>No raw colors, radii, or spacing values outside an approved exception.</li>
          <li>All icon-only controls have accessible names and correct target sizes.</li>
          <li>Existing functional flow tests pass, and new visual states have screenshot coverage.</li>
          <li>Loading, empty, offline, error, and partial states all exist.</li>
          <li>User-generated text scales without clipping.</li>
          <li>Platform-specific actions are capability-gated.</li>
          <li>Design reference and implementation differ only for documented native behaviour.</li>
        </ul>
      </Section>
    </Doc>
  );
}
