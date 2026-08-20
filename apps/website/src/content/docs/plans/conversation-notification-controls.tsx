// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Per-conversation notification controls',
  description: 'Product and technical specification for turning Claire notifications on or off for one conversation at a time.',
  section: 'plans',
  status: 'draft',
  lastReviewed: '2026-08-19',
  related: ['/docs/product/notifications', '/docs/plans/conversation-settings-smart-cards', '/docs/product/security'],
};

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire should let a person decide which individual conversations may interrupt them. The
        control belongs in Conversation settings, applies across that person&apos;s Claire devices, and
        suppresses Claire notifications only. It never changes notification settings in WhatsApp,
        Instagram, Telegram, or another connected service.
      </P>

      <Section id="decision" title="Decision and scope">
        <P>
          Version one is a simple two-state preference: <b>Notifications on</b> or <b>Notifications
          off</b>. It is stored per user and per Claire conversation, so a mute set on iPhone also
          applies on desktop and future devices. The preference affects only new-message push
          notifications; messages still arrive, increment the unread count, appear in search, and
          remain available in the inbox.
        </P>
        <Table
          head={[<>In scope</>, <>Not in version one</>]}
          rows={[
            [<>Turn notifications on or off for one Claire conversation.</>, <>Timed mute durations, schedules, keyword rules, and notification digests.</>],
            [<>Reflect the result immediately in Conversation settings and the inbox.</>, <>Changing the mute setting inside the underlying platform&apos;s app.</>],
            [<>Suppress outbound Claire pushes on every registered device.</>, <>Suppressing message sync, unread counts, AI processing, or reminders.</>],
            [<>Explain when a device or global setting still prevents delivery.</>, <>A promise that the operating system or an external provider will always show a notification.</>],
          ]}
        />
      </Section>

      <Section id="experience" title="Product experience">
        <Section id="entry" title="Entry point" level={3}>
          <P>
            In <C>apps/client/app/chat/settings/[chatId].tsx</C>, add a <b>Notifications</b> section
            below the conversation identity and above relationship/AI controls. This keeps a
            delivery preference separate from what Claire remembers about someone.
          </P>
          <Code lang="text">{"Conversation settings\n\nNotifications\n  [bell] Notifications                         [On | Off]\n  Receive Claire alerts for new messages in this conversation.\n\nRelationship memory\n  …"}</Code>
        </Section>

        <Section id="states" title="States and microcopy" level={3}>
          <Table
            head={[<>State</>, <>Row value</>, <>Supporting copy</>]}
            rows={[
              [<>Default / enabled</>, <><b>On</b></>, <>Receive Claire alerts for new messages in this conversation.</>],
              [<>Disabled by this conversation</>, <><b>Off</b></>, <>New messages will stay in your inbox without sending Claire alerts.</>],
              [<>Global notifications disabled</>, <><b>Off</b> + disabled control</>, <>Turn on notifications in Claire settings to manage alerts for individual conversations.</>],
              [<>OS permission denied or no device token</>, <><b>On</b></>, <>This conversation can notify you when notifications are enabled for this device.</>],
              [<>Saving</>, <><b>Saving…</b></>, <>Keep the prior value visible; do not optimistically claim success before the write completes.</>],
              [<>Save failure</>, <><b>Unchanged</b></>, <>Couldn&apos;t update notifications. Try again. No provider, bridge, or database error text is shown.</>],
            ]}
          />
          <P>
            The switch must have an explicit accessible label: <C>{'"Notifications for {conversation name}"'}</C>.
            Haptics and a brief confirmation are appropriate, but no destructive confirmation dialog is
            needed: switching it back on is one tap.
          </P>
        </Section>

        <Section id="user-flow" title="User flow" level={3}>
          <ol>
            <li>Open a conversation, then open Conversation settings.</li>
            <li>Read the current notification state and its consequence.</li>
            <li>Turn the switch off. Claire saves the preference for that user and conversation.</li>
            <li>The row changes to <b>Off</b>; the inbox may show a small muted-bell indicator without hiding the conversation.</li>
            <li>For a later inbound message, Claire records a suppressed delivery with the metadata-only reason <C>conversation_muted</C> and sends no push.</li>
            <li>Turn the switch back on to restore normal eligibility for the next incoming message.</li>
          </ol>
          <P>
            This does not retract a notification already submitted to APNs/Expo, and it does not
            alter messages that arrive while the app is foregrounded. The existing active-chat
            suppression remains in effect independently.
          </P>
        </Section>
      </Section>

      <Section id="precedence" title="Notification eligibility and precedence">
        <P>
          Delivery is allowed only after all applicable controls allow it. A per-conversation setting
          narrows delivery; it never overrides a global, device, operating-system, or presence
          suppression.
        </P>
        <Code lang="text">{"Incoming message\n  → Ignore if it is sent by the account owner\n  → Account-level notifications enabled?             no → suppress: account_disabled\n  → Message notifications preference enabled?         no → suppress: messages_disabled\n  → Conversation notifications enabled?               no → suppress: conversation_muted\n  → Device enabled and a provider token is valid?     no → no delivery candidate\n  → Quiet hours on that device?                       yes → suppress: quiet_hours\n  → Device is actively viewing this conversation?     yes → suppress: active_chat\n  → Queue provider delivery and track the receipt"}</Code>
        <P>
          Badge counts continue to use the user&apos;s unread total, including muted conversations. A
          muted conversation is intentionally not a hidden or archived conversation.
        </P>
      </Section>

      <Section id="data" title="Data model and API">
        <Section id="table" title="New table: conversation_notification_preferences" level={3}>
          <P>
            Do not overload <C>chats.is_muted</C>. That legacy/imported platform signal can describe
            an upstream platform&apos;s state and may not be user-managed by Claire. Claire&apos;s own
            preference needs an explicit, user-scoped source of truth.
          </P>
          <Code lang="sql">{"CREATE TABLE public.conversation_notification_preferences (\n  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,\n  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,\n  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),\n  PRIMARY KEY (user_id, chat_id),\n  CONSTRAINT conversation_notification_preferences_chat_owner\n    FOREIGN KEY (chat_id, user_id) REFERENCES public.chats(id, user_id)\n);\n\nCREATE INDEX conversation_notification_preferences_lookup\n  ON public.conversation_notification_preferences (user_id, chat_id)\n  WHERE notifications_enabled = FALSE;\n\nALTER TABLE public.conversation_notification_preferences ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"Users manage their conversation notification preferences\"\n  ON public.conversation_notification_preferences\n  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);"}</Code>
          <P>
            If <C>chats</C> lacks a unique composite key for the foreign key above, add
            <C>{'UNIQUE (id, user_id)'}</C> in the same migration. The migration must include the
            project&apos;s standard <C>updated_at</C> trigger and send the PostgREST schema reload
            notification after deployment.
          </P>
        </Section>

        <Section id="client-contract" title="Client contract" level={3}>
          <P>
            Use Supabase with RLS for the settings screen, matching the existing conversation category
            and profile writes. The client reads and upserts only its own row:
          </P>
          <Code lang="ts">{"type ConversationNotificationPreference = {\n  user_id: string;\n  chat_id: string;\n  notifications_enabled: boolean;\n  updated_at: string;\n};\n\nawait supabase.from('conversation_notification_preferences').upsert(\n  { user_id: user.id, chat_id, notifications_enabled: enabled, updated_at: new Date().toISOString() },\n  { onConflict: 'user_id,chat_id' },\n);"}</Code>
          <P>
            Add <C>notificationEnabled</C>, <C>isSavingNotificationPreference</C>, and
            <C>setNotificationEnabled</C> to <C>useConversationSettingsStore</C>. On an optimistic
            update failure, refresh from the server and show the safe, generic error copy above.
          </P>
        </Section>

        <Section id="server-contract" title="Delivery service change" level={3}>
          <P>
            Before calculating badge and device delivery in
            <C>apps/server/src/services/notification-delivery.ts</C>, fetch the one preference for
            <C>{'event.userId + event.chatId'}</C>. Missing row means enabled, preserving the current
            behavior for all existing conversations.
          </P>
          <Code lang="ts">{"const { data: conversationPreference } = await supabase\n  .from('conversation_notification_preferences')\n  .select('notifications_enabled')\n  .eq('user_id', event.userId)\n  .eq('chat_id', event.chatId)\n  .maybeSingle();\n\nif (conversationPreference?.notifications_enabled === false) {\n  return await recordSuppressedDeliveries({\n    event, devices, reason: 'conversation_muted',\n  });\n}"}</Code>
          <P>
            The implementation must preserve idempotency: a delivery row continues to be unique per
            message, device, and notification type. A suppressed event is a valid delivery outcome,
            not an error or retry candidate.
          </P>
        </Section>
      </Section>

      <Section id="implementation" title="Implementation plan">
        <Table
          head={[<>Area</>, <>Change</>, <>Completion criterion</>]}
          rows={[
            [<>Database</>, <>Migration, RLS, composite ownership constraint, index, schema reload.</>, <>A user cannot read or write another user&apos;s preference; deleting a chat or user cascades safely.</>],
            [<>Mobile data</>, <>Extend <C>conversationSettingsStore</C> with fetch, optimistic update, rollback, and error state.</>, <>The setting persists after a force close and appears consistently on a second device.</>],
            [<>Mobile UI</>, <>Add an accessible Notifications section to Conversation settings using <C>useSafeAreaInsets</C> for scroll and bottom action spacing.</>, <>The row is reachable on small screens, correctly labels its state, and works with VoiceOver.</>],
            [<>Inbox</>, <>Show a restrained muted-bell affordance on a muted conversation; do not visually de-prioritize urgent unread messages.</>, <>A person can tell why one conversation does not alert without opening it.</>],
            [<>Server delivery</>, <>Add the conversation check and <C>conversation_muted</C> suppression outcome before provider enqueue.</>, <>No provider submission is attempted for a muted conversation.</>],
            [<>Operations</>, <>Count suppressions by platform and reason only; retain no title, body, participant name, token, or raw payload.</>, <>Operators can see a delivery was intentionally suppressed without learning which conversation it was.</>],
          ]}
        />
      </Section>

      <Section id="privacy" title="Privacy and safety">
        <ul>
          <li>The preference is account metadata, not message content.</li>
          <li>Push payload content is constructed only after the conversation eligibility check passes.</li>
          <li>Operational logs, metrics, traces, alerting, and the Operations Console record only the suppression reason and aggregate platform counters.</li>
          <li>Do not store contact names, message previews, device tokens, or raw provider receipts in the preference or related telemetry.</li>
          <li>Deletion of the conversation or account removes the preference through database cascades; backups follow the existing deletion and retention policy.</li>
        </ul>
      </Section>

      <Section id="verification" title="Verification and acceptance criteria">
        <ol>
          <li>With global notifications on, turn one conversation off and confirm its next inbound message creates no Expo/APNs submission while another conversation still notifies.</li>
          <li>Confirm muted messages continue to sync, increment unread count, affect the app badge, and are visible in the inbox.</li>
          <li>Turn the same conversation on from one device; confirm the next inbound message is eligible on another registered device.</li>
          <li>Confirm global disable, quiet hours, invalid token, and active-chat suppression still win over the conversation setting.</li>
          <li>Confirm a missing preference row is treated as on for every pre-existing conversation.</li>
          <li>Run server tests for eligibility order, idempotent suppressed delivery rows, and no provider call when <C>conversation_muted</C>.</li>
          <li>Run mobile tests for loading, optimistic success, rollback, system-permission copy, accessible switch label, and safe-area layout.</li>
          <li>Inspect structured logs and Operations Console payloads to prove no message body, sender name, chat title, token, or raw provider response is emitted.</li>
        </ol>
      </Section>

      <Section id="future" title="Explicit follow-ups">
        <P>
          After version one has reliable production evidence, add timed mute choices (one hour, until
          tomorrow, custom date), group-only mentions/replies, and a notification schedule. Those
          capabilities require an explicit expiry model and a separate product decision; they must not
          be silently inferred from the basic on/off setting.
        </P>
      </Section>
    </Doc>
  );
}
