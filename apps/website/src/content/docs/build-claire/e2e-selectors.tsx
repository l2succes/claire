// SPDX-License-Identifier: Apache-2.0
import { C, Callout, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'E2E test selector map',
  description: 'Stable test identifiers for Claire’s browser and mobile acceptance flows.',
  section: 'build-claire',
  status: 'current',
  lastReviewed: '2026-08-17',
  order: 6,
  roadmap: {
    status: 'in_progress',
    summary: 'Rewrite the mock end-to-end suite for the redesigned inbox.',
    issue: 'https://github.com/l2succes/claire/issues/145',
  },
  related: ['/docs/build-claire/testing', '/docs/get-started/mock-mode'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Every stable <C>testID</C> used by the Playwright suite. These are a contract: renaming one
        breaks tests silently in the sense that they fail for the wrong reason, so change them
        deliberately and update this page in the same commit.
      </P>

      <Callout kind="note" title="Convention">
        <C>testID</C> props are set on React Native components. On web, React Native Web surfaces them as{' '}
        <C>data-testid</C> attributes, and <C>page.getByTestId(id)</C> maps to{' '}
        <C>[data-testid=&quot;id&quot;]</C>.
      </Callout>

      <Section id="auth" title="Auth screens">
        <Section id="sign-in" title="Sign in — /(auth)/signin" level={3}>
          <Table
            head={['Selector', 'Element']}
            rows={[
              [<C key="a">signin-screen</C>, 'Root KeyboardAvoidingView'],
              [<C key="b">signin-email-input</C>, 'Email TextInput'],
              [<C key="c">signin-password-input</C>, 'Password TextInput'],
              [<C key="d">signin-submit</C>, 'Submit TouchableOpacity'],
              [<C key="e">google-sign-in-signin</C>, 'Google sign-in button'],
            ]}
          />
        </Section>

        <Section id="sign-up" title="Sign up — /(auth)/signup" level={3}>
          <Table
            head={['Selector', 'Element']}
            rows={[
              [<C key="a">signup-screen</C>, 'Root view'],
              [<C key="b">signup-name-input</C>, 'Name TextInput'],
              [<C key="c">signup-email-input</C>, 'Email TextInput'],
              [<C key="d">signup-password-input</C>, 'Password TextInput'],
              [<C key="e">signup-submit</C>, 'Submit TouchableOpacity'],
            ]}
          />
        </Section>

        <Section id="platform-connect" title="Platform connect — /(auth)/login" level={3}>
          <Table
            head={['Selector', 'Element']}
            rows={[
              [<C key="a">platform-login-screen</C>, 'Root View'],
              [<C key="b">platform-selector-whatsapp</C>, 'WhatsApp selector tile'],
              [<C key="c">platform-selector-telegram</C>, 'Telegram selector tile'],
              [<C key="d">platform-selector-instagram</C>, 'Instagram selector tile'],
              [<C key="e">platform-login-continue</C>, '“Continue to Inbox” — shown once ≥1 platform is connected'],
              [<C key="f">platform-login-skip-dev</C>, '“Skip (dev mode)” — only in __DEV__'],
            ]}
          />
        </Section>
      </Section>

      <Section id="tabs" title="Tab screens">
        <Section id="dashboard" title="Dashboard — /(tabs)/dashboard" level={3}>
          <Table
            head={['Selector', 'Element']}
            rows={[
              [<C key="a">dashboard-screen</C>, 'Root ScrollView'],
              [<C key="b">morning-brief-container</C>, 'Wrapper around MorningBrief; only rendered when brief text exists'],
              [<C key="c">urgent-cards-container</C>, 'Wrapper for UrgentCard rows; only rendered when urgent_messages are present'],
            ]}
          />
        </Section>

        <Section id="messages" title="Inbox — /(tabs)/messages" level={3}>
          <Table
            head={['Selector', 'Element']}
            rows={[
              [<C key="a">messages-screen</C>, 'Root View'],
              [<C key="b">messages-loading</C>, 'Loading spinner'],
              [<C key="c">messages-search-input</C>, 'Search TextInput'],
              [<C key="d">messages-list</C>, 'Conversation FlatList'],
              [<C key="e">messages-empty</C>, 'Empty state'],
              [<C key="f">message-card-&lt;id&gt;</C>, 'Individual MessageCard row; id is the message UUID'],
              [<C key="g">message-card-promise-badge-&lt;id&gt;</C>, 'Amber promise badge when the chat has an open promise'],
            ]}
          />
        </Section>

        <Section id="contacts" title="Contacts — /(tabs)/contacts" level={3}>
          <Table
            head={['Selector', 'Element']}
            rows={[
              [<C key="a">contacts-screen</C>, 'Root View'],
              [<C key="b">contacts-search-input</C>, 'Search TextInput'],
              [<C key="c">contacts-list</C>, 'Contacts FlatList'],
              [<C key="d">contacts-empty</C>, 'Empty state'],
            ]}
          />
        </Section>

        <Section id="promises" title="Promises — /(tabs)/promises" level={3}>
          <Table
            head={['Selector', 'Element']}
            rows={[
              [<C key="a">promises-screen</C>, 'Root ScrollView'],
              [<C key="b">promises-empty</C>, 'Empty state'],
              [<C key="c">promises-list</C>, 'Promises list'],
              [<C key="d">promise-item-&lt;id&gt;</C>, 'Individual promise row'],
              [<C key="e">promise-complete-&lt;id&gt;</C>, 'Mark-complete button'],
              [<C key="f">promise-snooze-&lt;id&gt;</C>, 'Snooze button'],
              [<C key="g">promise-source-&lt;id&gt;</C>, 'Source chat link'],
            ]}
          />
        </Section>

        <Section id="settings" title="Settings — /(tabs)/settings" level={3}>
          <Table
            head={['Selector', 'Element']}
            rows={[
              [<C key="a">settings-screen</C>, 'Root ScrollView'],
              [<C key="b">settings-refresh-platforms</C>, 'Refresh platforms'],
              [<C key="c">settings-add-platform</C>, 'Add platform'],
              [<C key="d">settings-no-platforms</C>, 'Empty platforms view'],
              [<C key="e">settings-connect-platform</C>, '“Connect Platform” in the empty state'],
              [<C key="f">settings-account</C>, 'Account row'],
              [<C key="g">settings-notifications</C>, 'Notifications row'],
              [<C key="h">settings-ai</C>, 'AI settings row'],
              [<C key="i">settings-logout</C>, 'Logout row'],
              [<C key="j">connected-platforms-list</C>, 'Connected platforms view'],
              [<C key="k">connected-platform-&lt;platform&gt;</C>, 'Platform row, e.g. connected-platform-whatsapp'],
              [<C key="l">reconnect-platform-&lt;platform&gt;</C>, 'Reconnect button'],
              [<C key="m">disconnect-platform-&lt;platform&gt;</C>, 'Disconnect button'],
            ]}
          />
        </Section>
      </Section>

      <Section id="chat" title="Chat screen — /chat/[chatId]">
        <Table
          head={['Selector', 'Element']}
          rows={[
            [<C key="a">chat-screen</C>, 'Root SafeAreaView'],
            [<C key="b">chat-loading</C>, 'Loading spinner'],
            [<C key="c">chat-message-list</C>, 'Messages FlatList'],
            [<C key="d">chat-empty</C>, 'Empty state'],
            [<C key="e">chat-input</C>, 'Composer TextInput'],
            [<C key="f">chat-send-button</C>, 'Send button'],
          ]}
        />

        <Section id="ai-suggestions" title="AI suggestion strip" level={3}>
          <Table
            head={['Selector', 'Element']}
            rows={[
              [<C key="a">ai-suggestion-strip</C>, 'Root; only visible when suggestions exist'],
              [<C key="b">ai-suggestion-scroll</C>, 'Horizontal ScrollView of chips'],
              [<C key="c">ai-suggestion-chip-&lt;index&gt;</C>, 'Individual suggestion card, 0-based'],
              [<C key="d">ai-suggestion-use-&lt;index&gt;</C>, '“Use” — fills the composer'],
              [<C key="e">draft-reply-container</C>, 'Shown when no stored suggestions exist'],
              [<C key="f">draft-reply-button</C>, 'Calls /ai/responses/generate on demand'],
              [<C key="g">draft-reply-error</C>, 'Error text if generation fails'],
            ]}
          />
        </Section>
      </Section>

      <Section id="platform-auth" title="Platform auth modal">
        <Table
          head={['Selector', 'Element']}
          rows={[
            [<C key="a">platform-auth-modal</C>, 'Modal root'],
            [<C key="b">platform-auth-scroll</C>, 'Scrollable content'],
            [<C key="c">platform-auth-success</C>, 'Success state'],
            [<C key="d">platform-auth-error</C>, 'Error state'],
            [<C key="e">instagram-web-login</C>, 'Instagram web login root'],
            [<C key="f">instagram-username-input</C>, 'Username TextInput'],
            [<C key="g">instagram-password-input</C>, 'Password TextInput'],
            [<C key="h">instagram-toggle-password</C>, 'Show/hide password'],
            [<C key="i">instagram-sign-in-button</C>, 'Sign in'],
            [<C key="j">instagram-2fa-input</C>, '2FA code TextInput'],
            [<C key="k">instagram-2fa-submit</C>, '2FA submit'],
            [<C key="l">instagram-try-again</C>, 'Retry'],
            [<C key="m">instagram-web-login-close</C>, 'Close'],
            [<C key="n">instagram-native-webview</C>, 'Native WebView'],
            [<C key="o">instagram-native-login-loading</C>, 'Native loading view'],
            [<C key="p">instagram-native-login-close</C>, 'Native close'],
          ]}
        />
      </Section>

      <Section id="notes" title="Notes">
        <ul>
          <li>
            Platform-prefixed selectors use the lowercase <C>Platform</C> enum value.
          </li>
          <li>
            Dynamic selectors written as <C>&lt;id&gt;</C> use the entity&rsquo;s database UUID.
          </li>
          <li>
            The web build is required for Playwright — see <C>mobile/playwright.config.mjs</C>.
          </li>
        </ul>
      </Section>
    </Doc>
  );
}
