// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Conversation detail screen plan",
  description: "Implementation record for opening a conversation from the unified inbox.",
  section: 'plans',
  status: 'archived',
  lastReviewed: '2026-08-17',
  related: ['/docs/build-claire/mobile', '/docs/build-claire/design-system'],
};

export default function Page() {
  return (
    <Doc>
      <Section id="context" title="Context">
      <P>Tapping a message card on the dashboard currently does nothing (only logs to console). Two things are missing:</P>
      <ol>
              <li><b>No chat detail screen exists</b>{" — there's no "}<C>app/chat/[chatId].tsx</C> file</li>
              <li><b>Navigation is not wired up</b> — <C>handleMessagePress</C> in <C>dashboard.tsx</C> is a stub</li>
            </ol>
      <P>{"We'll use "}<b>`react-native-gifted-chat`</b> (v3.3.2, 95k weekly downloads, actively maintained) for the chat UI instead of building bubbles from scratch. It handles keyboard avoidance, scroll-to-bottom, timestamps, and message rendering out of the box.</P>
      </Section>
      <Section id="dependencies-to-install" title="Dependencies to Install">
      <Code lang="bash">{"cd mobile\nbun add react-native-gifted-chat react-native-reanimated react-native-keyboard-controller"}</Code>
      <P><C>react-native-gesture-handler</C> and <C>react-native-safe-area-context</C> are already installed (see <C>package.json</C> lines 48-49). Only <C>react-native-reanimated</C> and <C>react-native-keyboard-controller</C> are new.</P>
      </Section>
      <Section id="changes" title="Changes">
      <Section id="create-mobile-app-chat-chatid-tsx-new-file" title="Create mobile/app/chat/[chatId].tsx (NEW FILE)" level={3}>
      <P>Expo Router auto-discovers this — no layout changes needed.</P>
      <P><b>Logic:</b></P>
      <ul>
              <li><C>useLocalSearchParams()</C> to get <C>chatId</C>, <C>contact_name</C>, <C>chat_name</C>, <C>platform</C>, <C>is_group</C></li>
              <li>On mount: fetch messages from Supabase where <C>chat_id = chatId AND user_id = user.id</C>, ordered <C>timestamp DESC</C>{" (newest first — GiftedChat's expected order)"}</li>
              <li>Subscribe to Supabase realtime channel filtered to this <C>chat_id</C> for live updates</li>
              <li>Map Supabase rows → GiftedChat <C>IMessage</C> shape: ``<C>{"typescript { _id: msg.id, text: msg.content, createdAt: new Date(msg.timestamp), user: { _id: msg.from_me ? user.id : (msg.contact_phone || 'them'), name: msg.from_me ? 'Me' : (msg.contact_name || msg.contact_phone || 'Unknown'), } } "}</C>``</li>
              <li><C>{"<GiftedChat messages={messages} user={{ _id: user.id }} onSend={handleSend} />"}</C></li>
              <li><b>Send flow</b>: query <C>chats</C> table for <C>platform_chat_id</C> and <C>platform</C>, find session via <C>platformStore.connectedSessions</C>, call <C>platformsApi.sendMessage(platform, sessionId, platform_chat_id, content)</C>, optimistically append to message list</li>
              <li>Custom header with back button (<C>router.back()</C>) and contact/group name + <C>PlatformBadge</C></li>
            </ul>
      <P><b>Key imports reused:</b></P>
      <ul>
              <li><C>supabase</C> from <C>../../services/supabase</C></li>
              <li><C>useAuthStore</C> from <C>../../stores/authStore</C></li>
              <li><C>usePlatformStore</C> from <C>../../stores/platformStore</C></li>
              <li><C>platformsApi</C> from <C>../../services/platforms</C></li>
              <li><C>PlatformBadge</C> from <C>../../components/PlatformIcon</C></li>
            </ul>
      </Section>
      <Section id="edit-mobile-app-tabs-dashboard-tsx-lines-207-210-only" title="Edit mobile/app/(tabs)/dashboard.tsx — lines 207–210 only" level={3}>
      <P>Replace stub with:</P>
      <Code lang="typescript">{"const handleMessagePress = (message: Message) => {\n  router.push({\n    pathname: '/chat/[chatId]',\n    params: {\n      chatId: message.chat_id,\n      contact_name: message.contact_name || '',\n      chat_name: message.chat_name || '',\n      platform: message.platform || '',\n      is_group: message.is_group ? '1' : '0',\n    },\n  });\n};"}</Code>
      </Section>
      </Section>
      <Section id="files-changed" title="Files Changed">
      <ul>
              <li><b>CREATE</b> <C>mobile/app/chat/[chatId].tsx</C></li>
              <li><b>EDIT</b> <C>mobile/app/(tabs)/dashboard.tsx</C> (4 lines)</li>
              <li><b>EDIT</b> <C>mobile/package.json</C> (2 new deps via <C>bun add</C>)</li>
            </ul>
      </Section>
      <Section id="files-not-changing" title="Files NOT changing">
      <ul>
              <li><C>app/_layout.tsx</C> — Expo Router auto-discovers <C>chat/[chatId]</C></li>
              <li>Server routes — detail screen queries Supabase directly, same pattern as dashboard</li>
            </ul>
      </Section>
      <Section id="verification" title="Verification">
      <ol>
              <li><C>{"cd mobile && bun add react-native-gifted-chat react-native-reanimated react-native-keyboard-controller"}</C></li>
              <li><C>bunx expo run:ios</C> (native rebuild needed for new native modules)</li>
              <li>Tap any conversation on the Messages tab → chat screen opens</li>
              <li>Messages render as bubbles (green = sent, gray = received)</li>
              <li>Type a message and tap Send → message appears and is delivered via the platform</li>
              <li>Back button returns to Messages list</li>
            </ol>
      </Section>
    </Doc>
  );
}
