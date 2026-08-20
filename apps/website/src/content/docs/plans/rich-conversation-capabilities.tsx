// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, Mockup, MockupStrip, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: 'Rich conversation capabilities',
  description:
    'Implementation plan for replies, attachments, voice notes, media playback, message actions, and desktop parity in Claire conversations.',
  section: 'plans',
  status: 'draft',
  lastReviewed: '2026-08-19',
  hero: {
    kind: 'mockup',
    surface: 'mobile',
    screen: 'reply-to-message',
    caption: 'Reply is a focused action in the existing conversation, never a second timeline.',
  },
  related: [
    '/docs/build-claire/architecture',
    '/docs/build-claire/desktop',
    '/docs/build-claire/design-system',
    '/docs/plans/conversation-detail-screen',
    '/docs/product/connectors',
    '/docs/product/security',
  ],
};

const capabilityRows = [
  [
    <>Text</>,
    <>Send and receive text, delivery state, copy, and retry.</>,
    <>Foundation; preserve current behavior.</>,
  ],
  [
    <>Reply to message</>,
    <>Quote one source message and send a platform-native reply where available.</>,
    <>First implementation slice.</>,
  ],
  [
    <>Photo, video, and file</>,
    <>Pick, preview, caption, upload, send, download, and retry.</>,
    <>Second slice; client-to-server upload contract required.</>,
  ],
  [
    <>Voice note</>,
    <>Record, review, discard, upload, send, and play with duration/progress.</>,
    <>Third slice; a recording permission and native capture seam are required.</>,
  ],
  [
    <>Message actions</>,
    <>React, copy, forward/share, edit/delete own message, and report a delivery failure.</>,
    <>Capability-gated; never promise a platform action Claire cannot perform.</>,
  ],
  [
    <>Find and remember</>,
    <>Search in conversation, jump to a result, pins/bookmarks, shared media, links, and files.</>,
    <>Build on durable message references and current search infrastructure.</>,
  ],
  [
    <>Presence signals</>,
    <>
      Typing, read receipts, delivery receipts, and availability where a connector supplies them.
    </>,
    <>Best-effort only; absence is not an error.</>,
  ],
];

export default function Page() {
  return (
    <Doc>
      <P lede>
        Claire&apos;s chat needs to feel native to the conversations people already have. This plan
        adds rich messaging without pretending every connected network has identical semantics. A
        reply is a reply to one message, not a separate nested thread; a platform capability is
        shown only when that bridge can carry it reliably.
      </P>

      <MockupStrip
        items={[
          { surface: 'mobile', screen: 'reply-to-message', caption: 'Mobile · reply composer' },
          {
            surface: 'mobile',
            screen: 'voice-note',
            caption: 'Mobile · record and review a voice note',
          },
          {
            surface: 'desktop',
            screen: 'rich-message-actions',
            caption: 'Desktop · fast actions and rich composer',
          },
        ]}
      />

      <Section id="decision" title="Product decision and boundaries">
        <P>
          Build a shared conversation capability layer, then render it through mobile and desktop
          containers. <b>The content, state, mutations, and message components are shared;</b>{' '}
          layout, keyboard shortcuts, drag-and-drop, file access, recording, and notification
          surfaces remain host-specific. Claire Desktop packages the Expo web client in Electron, so
          a feature built in
          <C>apps/client</C> can reach desktop, but that does not remove the need to test the
          desktop host seam.
        </P>
        <Table
          head={[<>Use one shared implementation for</>, <>Keep host-specific</>]}
          rows={[
            [
              <>
                Message model, queries, mutations, capability resolution, bubble/quote/media
                primitives, optimistic state, accessibility text, and error semantics.
              </>,
              <>
                Camera/library picker, drag-and-drop, microphone permission and capture, file-system
                access, native playback routes, keyboard commands, share sheets, window behavior,
                and OS notifications.
              </>,
            ],
            [
              <>The React Native Web renderer used by Claire Desktop.</>,
              <>Electron IPC and the desktop-only local connector/secure-store paths.</>,
            ],
          ]}
        />
        <P>
          This is a staged plan. No feature introduces an end-to-end-encryption claim, changes what
          an upstream network stores, or sends message content to Operations telemetry. AI continues
          to receive only the selected, authorized context described in Claire&apos;s privacy
          documentation.
        </P>
      </Section>

      <Section id="experience" title="Experience map">
        <Table
          head={[<>Capability</>, <>User-visible behavior</>, <>Delivery order</>]}
          rows={capabilityRows}
        />

        <Section id="reply" title="1. Reply to a message" level={3}>
          <P>
            Long-press on mobile or hover/right-click on desktop exposes <b>Reply</b>. On mobile,
            the selected bubble remains visible and a compact contextual menu is anchored beside it
            (not a bottom sheet): reactions first, then Reply, Copy, and Forward when supported.
            Claire places a compact quote preview above the composer with the source sender, a
            one-line truncation, and a clear cancel affordance. The sent and received bubble renders
            the same quote preview; a tap jumps to the original message when it remains locally
            available.
          </P>
          <Mockup
            surface="mobile"
            screen="reply-to-message"
            caption="A reply target stays visible while composing."
          />
          <P>
            Do not call this &ldquo;threaded conversations&rdquo; in product copy. WhatsApp and
            Instagram replies, Telegram <C>reply_parameters</C>, and Matrix <C>m.in_reply_to</C> can
            map to a quoted message, while a true nested-thread model differs by platform. If a
            legacy connector cannot send a native reply, Claire disables Reply before composition
            rather than silently sending plain text that looks like a reply.
          </P>
        </Section>

        <Section id="media" title="2. Send and play rich media" level={3}>
          <P>
            The plus control opens a deliberate attachment tray: Photo, Video, File, and Location
            only when the current conversation supports the choice. Selected media enters a pre-send
            review state with thumbnail, caption, filename/size or duration, remove control, and
            upload status. A failed upload remains retriable and is never represented as delivered.
          </P>
          <MockupStrip
            items={[
              {
                surface: 'mobile',
                screen: 'attachment-review',
                caption: 'Mobile · media review before sending',
              },
              {
                surface: 'mobile',
                screen: 'media-playback',
                caption: 'Mobile · video and audio playback',
              },
              {
                surface: 'desktop',
                screen: 'rich-media-library',
                caption: 'Desktop · shared media and files',
              },
            ]}
          />
          <P>
            Incoming audio and video playback already exists in the mobile chat. This phase turns it
            into a complete media surface: thumbnail/poster, full-screen viewer, audio seek and
            speed, duration, download state, caption, save/share where allowed, and media/error
            fallback. The first outbound slice is photo, video, and documents; do not let a user
            select a media type before the bridge reports it can send it.
          </P>
        </Section>

        <Section id="voice" title="3. Voice notes" level={3}>
          <P>
            The microphone is a small, always-visible control in the composer beside the text input,
            rather than its own full-screen flow. Holding it begins recording after explicit
            microphone permission; sliding away cancels and releasing opens a compact review widget
            immediately above the composer. The widget shows duration, a coarse waveform/progress
            treatment, play/pause, discard, and send. Recording starts locally and uploads only
            after the person confirms Send. Incoming voice notes use the same player but carry a
            distinct voice-note label and duration.
          </P>
          <Mockup
            surface="mobile"
            screen="voice-note"
            caption="Voice recording is reviewable before it leaves the device."
          />
        </Section>

        <Section id="actions" title="4. Message actions, search, and signals" level={3}>
          <P>
            A small, bubble-anchored message menu groups actions by certainty: reactions, Reply,
            Copy, and Forward/share; then edit/delete and details only when the platform reports
            support. It avoids a full-width mobile action sheet and repositions above or to the
            opposite side of a bubble when it would collide with a safe area, keyboard, or screen
            edge. Conversation search includes Messages, Media, Links, and Files; results reveal a
            bounded excerpt and jump to the source message. Pins/bookmarks are Claire metadata and
            must clearly say they do not pin the original message in the source app.
          </P>
          <MockupStrip
            items={[
              {
                surface: 'mobile',
                screen: 'message-actions',
                caption: 'Mobile · capability-aware message actions',
              },
              {
                surface: 'mobile',
                screen: 'conversation-search',
                caption: 'Mobile · search and shared items',
              },
              {
                surface: 'desktop',
                screen: 'rich-message-actions',
                caption: 'Desktop · hover actions and keyboard paths',
              },
            ]}
          />
        </Section>
      </Section>

      <Section id="architecture" title="Shared capability architecture">
        <P>
          One source of truth prevents UI from claiming an action that a bridge cannot perform. The
          API returns capabilities for the current platform session and conversation; the shared
          client hook resolves a consistent command model for both mobile and web/Electron.
        </P>
        <Code lang="ts">{`type ConversationCapabilities = {
  canReply: boolean;
  canSend: { text: boolean; image: boolean; video: boolean; document: boolean; voice: boolean };
  canReact: boolean;
  canEditOwn: boolean;
  canDeleteOwn: boolean;
  canReadReceipts: boolean;
  canTyping: boolean;
};

type ComposerDraft =
  | { kind: 'text'; text: string; replyTo?: MessageReference }
  | { kind: 'media'; text: string; asset: PreparedAsset; replyTo?: MessageReference }
  | { kind: 'voice'; asset: PreparedAsset; replyTo?: MessageReference };`}</Code>
        <P>
          Put this model in <C>packages/chat-core</C>. The React Native client owns the shared UI
          and data hooks; <C>@claire/host</C> supplies an adapter for picking assets, recording
          audio, opening a file, sharing media, and platform permission checks. Native iOS/Android
          and Electron/browser adapters implement that interface without leaking host code into the
          conversation screen.
        </P>
        <Table
          head={[<>Layer</>, <>Change</>, <>Reason</>]}
          rows={[
            [
              <>
                <C>packages/chat-core</C>
              </>,
              <>
                Capability types, message references, attachment validation rules, composer state
                machine, and pure tests.
              </>,
              <>Identical semantics in mobile and desktop.</>,
            ],
            [
              <>
                <C>packages/host</C>
              </>,
              <>
                Picker, recorder, filesystem, share, haptics, and permission interfaces plus
                native/web/Electron implementations.
              </>,
              <>The same UI can request a host action safely.</>,
            ],
            [
              <>
                <C>apps/client/features/chat</C>
              </>,
              <>
                Quote preview, attachment tray/review, voice recorder/review, message menu, playback
                components, and in-chat search UI.
              </>,
              <>Route files remain thin and platform UI stays composable.</>,
            ],
            [
              <>
                <C>apps/server</C>
              </>,
              <>
                Validated multipart/media send endpoint, signed/private asset flow, capability
                response, reply persistence, and adapter normalization.
              </>,
              <>One durable, authenticated boundary for every client.</>,
            ],
            [
              <>
                <C>apps/desktop</C>
              </>,
              <>
                Electron IPC for file/recording/drag-drop/native share where web behavior is
                insufficient.
              </>,
              <>Desktop adds host power without forks of chat logic.</>,
            ],
          ]}
        />
      </Section>

      <Section id="data-contract" title="Data contracts and bridge work">
        <Section id="reply-storage" title="Reply references" level={3}>
          <P>
            Claire already accepts <C>replyToMessageId</C> on the platform send route and adapters
            detect inbound replies, but the normalized message row does not yet persist a durable
            reply link. Add both a local foreign key and the external platform identifier so
            delayed/out-of-order sync can resolve later without losing the quoted relationship.
          </P>
          <Code lang="sql">{`ALTER TABLE public.messages
  ADD COLUMN reply_to_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN reply_to_platform_message_id TEXT;

CREATE INDEX messages_reply_target_idx
  ON public.messages (chat_id, reply_to_platform_message_id)
  WHERE reply_to_platform_message_id IS NOT NULL;`}</Code>
          <P>
            Ingestion stores <C>reply_to_platform_message_id</C> immediately, resolves
            <C>reply_to_message_id</C> when the referenced row is available, and runs a small scoped
            reconciliation after later backfill. Every outgoing reply stores its target before the
            bridge call and emits Matrix&apos;s <C>m.relates_to.m.in_reply_to</C> where Matrix is
            the transport. The rendered quote never requires fetching message content from another
            account.
          </P>
        </Section>

        <Section id="media-contract" title="Media delivery" level={3}>
          <P>
            Replace the text-only JSON send body with a two-step flow: prepare a bounded client
            asset, upload it to an authenticated private staging object, then create an outbound
            message that references the opaque asset ID. The server revalidates user, session,
            conversation, capability, MIME signature, byte limit, checksum, and ownership before
            downloading a short-lived stream and passing bytes to the bridge. Do not place base64
            media in JSON, logs, realtime payloads, or the Operations Console.
          </P>
          <Code lang="text">{`Pick or record locally
  → inspect size/type/duration and show review
  → POST /media/uploads (authenticated, private, resumable)
  → POST /platforms/:platform/send { chatId, text, replyToMessageId?, assetId? }
  → server verifies capability + asset ownership + limits
  → adapter uploads/sends to Matrix or source network
  → persist outbound row and delivery state
  → realtime confirmation or retryable failure`}</Code>
          <P>
            The Matrix adapter already uploads media but must add reply relation content and
            complete message metadata. Direct adapters have uneven existing support, so their
            advertised capability must be tested rather than inferred from a method name.
            Unsupported paths return a typed <C>platform_capability_unavailable</C> error, not a
            generic 500.
          </P>
        </Section>
      </Section>

      <Section id="platforms" title="Platform capability policy">
        <P>
          The capability matrix lives with each adapter and is returned with the session. It begins
          in a conservative state: available only after connector-level tests confirm send and
          receive behavior in the deployed Matrix/direct mode. Product UI must never turn a partial
          bridge implementation into a silent degradation.
        </P>
        <Table
          head={[<>Platform / transport</>, <>Known implementation signal</>, <>Release rule</>]}
          rows={[
            [
              <>Matrix</>,
              <>
                Inbound Matrix replies are converted; outbound media upload exists; outbound reply
                relation still needs implementation.
              </>,
              <>Ship reply/media only after relation and media event tests pass end-to-end.</>,
            ],
            [
              <>Telegram direct adapter</>,
              <>Reply parameters and media send branches already exist in adapter code.</>,
              <>
                Expose a capability only after API upload path, persistence, and a real bot test
                cover it.
              </>,
            ],
            [
              <>Instagram direct adapter</>,
              <>Inbound reply/media signals and selected image/voice send branches exist.</>,
              <>
                Treat video, files, reactions, edit, and delete as unavailable until verified for
                the deployed connector.
              </>,
            ],
            [
              <>WhatsApp / mautrix</>,
              <>
                Inbound quote metadata is detected; actual behavior travels through the configured
                Matrix bridge.
              </>,
              <>
                Use Matrix connector tests, including bridge restart and source-phone verification,
                before enabling each action.
              </>,
            ],
            [
              <>iMessage companion</>,
              <>Desktop-local lifecycle and host capabilities differ from cloud connectors.</>,
              <>
                Gate separately on a connected Mac, permission loss, and offline/reconnect behavior.
              </>,
            ],
          ]}
        />
      </Section>

      <Section id="phases" title="Delivery phases">
        <Table
          head={[<>Phase</>, <>Scope</>, <>Exit criteria</>]}
          rows={[
            [
              <>0 · Foundation</>,
              <>
                Capability contract, message reference migration, asset policy, shared composer
                state machine, and test fixtures.
              </>,
              <>
                No UI exposes a false capability; migration is backward-compatible and roll-back
                safe.
              </>,
            ],
            [
              <>1 · Replies</>,
              <>
                Quote persistence/reconciliation, Matrix relation send, mobile long press, desktop
                hover/context menu, quote rendering, jump-to-source.
              </>,
              <>
                A reply round-trips through each enabled connector without losing source identity or
                leaking quoted content to telemetry.
              </>,
            ],
            [
              <>2 · Attachments</>,
              <>
                Photo/video/document picker, review, private upload, progress/retry, server
                validation, Matrix-first delivery, desktop drag-drop.
              </>,
              <>
                A 0-byte, over-limit, mismatched MIME, expired upload, failed bridge send, and retry
                are all explained and safe.
              </>,
            ],
            [
              <>3 · Voice notes</>,
              <>
                Host recording seam, native permissions, review, voice upload/delivery, player
                improvements, desktop microphone path.
              </>,
              <>
                Cancelled recordings never upload; completed recordings play and send reliably on
                every enabled host.
              </>,
            ],
            [
              <>4 · Actions and find</>,
              <>
                Reactions/edit/delete where supported, copy/forward/share, in-chat search,
                shared-items index, pins/bookmarks.
              </>,
              <>Every action has a capability check, audit-safe outcome, and truthful fallback.</>,
            ],
            [
              <>5 · Presence and refinement</>,
              <>
                Typing/receipts/presence, link previews, performance, localization, keyboard
                shortcuts, and accessibility audit.
              </>,
              <>Signals are marked best-effort and never block messaging or cause false alerts.</>,
            ],
          ]}
        />
      </Section>

      <Section id="privacy" title="Privacy, retention, and operations">
        <ul>
          <li>
            Attachment bytes, thumbnails, filenames, captions, waveforms, message bodies, contact
            details, tokens, and raw bridge payloads are redacted from logs, traces, crash reports,
            metrics, alerts, and Operations Console views.
          </li>
          <li>
            Operations telemetry records only metadata: capability name, platform, bridge stage,
            byte-size bucket, duration bucket, outcome, retry count, and rotating pseudonymous
            account reference.
          </li>
          <li>
            All media staging objects are private, user-scoped, checksum-addressed, time-limited,
            and deleted after successful bridge handling or expiry. Retention/deletion jobs cover
            original media, derived thumbnail/waveform, AI-derived data, and backups.
          </li>
          <li>
            Voice recording starts local. Claire makes the transfer point explicit in review; cancel
            and discard remove the local temporary file.
          </li>
          <li>
            AI has no automatic claim on every attachment. OCR, transcription, summarization, and
            attachment-aware suggestions require a separate user-facing setting, provider
            disclosure, retention policy, and authorization path.
          </li>
        </ul>
      </Section>

      <Section id="verification" title="Verification and release checklist">
        <ol>
          <li>
            Unit-test capability resolution, composer transitions, reply serialization, MIME/size
            validation, asset expiry, and every failure copy.
          </li>
          <li>
            Run mobile tests for safe-area layout, TalkBack/VoiceOver labels, long press,
            cancellation, recording permission states, foreground/background playback, offline
            retry, and keyboard avoidance.
          </li>
          <li>
            Run desktop web/Electron tests for hover/context menus, keyboard shortcuts, drag/drop,
            file picker cancel, microphone permissions, and window-focus playback behavior.
          </li>
          <li>
            Run connector contract tests per enabled platform for inbound/outbound replies, media
            type, status, retry, restart, reconnect, malformed provider payload, and idempotent
            duplicate webhook.
          </li>
          <li>
            Inspect database rows to prove reply links resolve correctly after out-of-order sync and
            media rows never expose private storage URLs to another user.
          </li>
          <li>
            Prove structured-log redaction with intentionally distinctive message text, media
            filename, phone number, token-shaped string, and raw provider error fixture.
          </li>
          <li>
            Canary one internal account per connector; compare source-platform behavior, Claire
            timeline, notifications, and Operations metadata before widening a capability flag.
          </li>
        </ol>
      </Section>

      <Section id="non-goals" title="Explicit non-goals for this plan">
        <P>
          This plan does not introduce group-thread topology, send a message through a platform that
          Claire cannot prove is supported, make upstream disappearing-message promises, implement a
          global cross-network reaction model, or claim end-to-end encryption. Those require
          separate product and security decisions.
        </P>
      </Section>
    </Doc>
  );
}
