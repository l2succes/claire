import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View, useMedia } from '@tamagui/core';
import { Circle, PenLine, Search, Sparkles } from 'lucide-react-native';
import { colors, type } from '@claire/design-system';
import { host } from '@claire/host';
import { ResizablePane } from '@claire/shell';
import { useAuthStore } from '../../stores/authStore';
import { MobileSearchField } from '../../components/mobile/claire-mobile';
import { useInboxMessages, type InboxMessage } from '../../hooks/useInboxMessages';
import { InboxConversationRow } from '../inbox/inbox-screen';
import { Platform } from '../../types/platform';
import { PlatformBadge } from '../../components/PlatformIcon';

/**
 * Desktop owns arrangement, while the existing message and chat routes retain
 * their mobile implementation. Selecting an item deliberately keeps its
 * canonical /chat/:id URL so deep links, history and compact windows all use
 * the same conversation identity.
 */
export function DesktopInboxWorkspace({ selectedChatId, conversation }: { selectedChatId?: string; conversation?: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const params = useLocalSearchParams<{ filter?: string }>();
  const inbox = useInboxMessages(user?.id, { filter: params.filter === 'needs_reply' ? 'needs_reply' : 'all' });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'needs_reply'>(params.filter === 'needs_reply' ? 'needs_reply' : 'all');
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const media = useMedia();
  const messages = useMemo(() => inbox.messages.filter((message) => {
    const haystack = `${message.chat_name || ''} ${message.contact_name || ''} ${message.content || ''}`.toLowerCase();
    if (query && !haystack.includes(query.trim().toLowerCase())) return false;
    if (filter === 'unread' && !message.unread_count) return false;
    if (filter === 'needs_reply' && message.from_me) return false;
    if (platform !== 'all' && message.platform !== platform) return false;
    return true;
  }), [filter, inbox.messages, platform, query]);
  const selected = useMemo(() => messages.find((item) => item.chat_id === selectedChatId) || inbox.messages.find((item) => item.chat_id === selectedChatId) || messages[0], [inbox.messages, messages, selectedChatId]);

  const chatRoute = (message: InboxMessage) => ({ pathname: '/chat/[chatId]' as const, params: { chatId: message.chat_id, contact_name: message.contact_name || '', chat_name: message.chat_name || '', platform: message.platform || '', is_group: message.is_group ? '1' : '0' } });
  const open = (message: InboxMessage) => router.push(chatRoute(message));

  useEffect(() => {
    host.reportActiveConversation(selectedChatId || null);
    return () => host.reportActiveConversation(null);
  }, [selectedChatId]);

  // The desktop workspace is a master/detail view, not an interstitial. Its
  // first available row therefore opens directly into the conversation route.
  useEffect(() => {
    if (!selectedChatId && selected && !inbox.loading) router.replace(chatRoute(selected));
  }, [inbox.loading, selected, selectedChatId]);

  return (
    <View flex={1} flexDirection="row" backgroundColor="$cream" minHeight={0} testID="desktop-inbox-workspace">
      <ResizablePane kind="conversation" edge={1} accessibilityLabel="Resize conversations" testID="desktop-conversation-pane">
        <View flex={1} minHeight={0} backgroundColor="$paper" borderRightWidth={1} borderColor="$neutral200">
          <View paddingHorizontal="$3" paddingTop="$3" paddingBottom="$2" rowGap="$2">
            <View flexDirection="row" alignItems="center" justifyContent="space-between"><Text style={{ ...type.sectionTitle, fontSize: 24 }}>Inbox</Text><Pressable accessibilityRole="button" accessibilityLabel="New message" onPress={() => router.push('/compose')}><View width={32} height={32} borderRadius={9} backgroundColor="$ink" alignItems="center" justifyContent="center"><PenLine size={17} color={colors.paper} /></View></Pressable></View>
            <MobileSearchField
              icon={<Search size={17} color={colors.neutral[600]} />}
              placeholder="Search conversations"
              value={query}
              onChangeText={setQuery}
              testID="messages-search-input"
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ columnGap: 5, alignItems: 'center', paddingRight: 8 }}><>{([{ value: 'all', label: 'All' }, { value: 'unread', label: `Unread ${inbox.messages.filter((item) => !!item.unread_count).length}` }, { value: 'needs_reply', label: 'Needs reply' }] as const).map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: filter === item.value }} onPress={() => setFilter(item.value)}><View paddingHorizontal="$2" paddingVertical={6} borderRadius={99} backgroundColor={filter === item.value ? '$ink' : 'transparent'}><Text style={{ ...type.label, fontSize: 10, color: filter === item.value ? colors.paper : colors.ink }}>{item.label}</Text></View></Pressable>)}{([{ value: Platform.WHATSAPP, label: 'WhatsApp' }, { value: Platform.INSTAGRAM, label: 'Instagram' }] as const).map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityState={{ selected: platform === item.value }} onPress={() => setPlatform((current) => current === item.value ? 'all' : item.value)}><View flexDirection="row" alignItems="center" columnGap={4} paddingHorizontal="$2" paddingVertical={6} borderRadius={99} borderWidth={platform === item.value ? 1 : 0} borderColor="$ink" backgroundColor={platform === item.value ? '$sky' : 'transparent'}><PlatformBadge platform={item.value} size={13} /><Text style={{ ...type.label, fontSize: 10, color: colors.ink }}>{item.label}</Text></View></Pressable>)}</></ScrollView>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 3, paddingBottom: 24 }}>
            <View flexDirection="row" justifyContent="space-between" paddingHorizontal="$3" paddingVertical="$1"><Text style={{ ...type.monoLabel, fontSize: 9, color: colors.neutral[600] }}>RECENT</Text><Text style={{ ...type.monoLabel, fontSize: 9, color: colors.neutral[600] }}>{messages.length}</Text></View>
            {messages.map((message) => <InboxConversationRow key={message.chat_id} message={message} layout="desktop" active={message.chat_id === selected?.chat_id} onPress={() => open(message)} />)}
            {!inbox.loading && inbox.messages.length === 0 ? <Text padding="$4" color="$neutral600">No conversations yet.</Text> : null}
          </ScrollView>
        </View>
      </ResizablePane>
      {/* The route mounted here owns an inverted FlatList.  minHeight: 0 is
          essential on web: without it flex items use their content height,
          so the page grows with the transcript instead of giving that list a
          scrollable viewport. */}
      <View flex={1} minWidth={0} minHeight={0} backgroundColor="$cream">
        {conversation || <WorkspaceEmpty />}
      </View>
      {media.gtFull ? <ResizablePane kind="inspector" edge={-1} accessibilityLabel="Resize conversation details" testID="desktop-inspector-pane"><ConversationInspector message={selected} /></ResizablePane> : null}
    </View>
  );
}

function WorkspaceEmpty() { return <View flex={1} alignItems="center" justifyContent="center" rowGap="$2"><Sparkles size={28} color={colors.ink} /><Text style={type.sectionTitle}>Choose a conversation</Text><Text color="$neutral600">Your inbox stays visible while you work.</Text></View>; }

function ConversationInspector({ message }: { message?: InboxMessage }) {
  if (!message) return <View flex={1} padding="$4" backgroundColor="$paper" borderLeftWidth={1} borderColor="$neutral200" justifyContent="center"><Text color="$neutral600">Select a conversation to see context.</Text></View>;

  const name = message.chat_name || message.contact_name || 'Conversation';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C';
  const relationship = message.is_group ? 'Group conversation' : 'Business · Product lead';
  const promiseTitle = message.has_open_promise ? 'Follow up on this conversation' : 'No open promises right now';
  const sharedSummary = message.media_url ? 'Shared media available' : 'Conversation links and media';

  return <View flex={1} minHeight={0} backgroundColor="$paper" borderLeftWidth={1} borderColor="$neutral200">
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 42 }}>
      <View alignItems="center" paddingTop="$2" paddingBottom="$4" borderBottomWidth={1} borderColor="$neutral200">
        <View width={80} height={80} borderRadius={40} backgroundColor="$blush" alignItems="center" justifyContent="center"><Text style={{ ...type.sectionTitle, color: colors.ink }}>{initials}</Text></View>
        <Text textAlign="center" style={{ ...type.sectionTitle, fontSize: 23, marginTop: 12 }}>{name}</Text>
        <Text textAlign="center" style={{ ...type.bodySmall, color: colors.neutral[600], marginTop: 3 }}>{relationship}</Text>
        <View flexDirection="row" columnGap="$2" marginTop="$3">
          {['Profile', 'Media', 'Mute'].map((label) => <Pressable key={label} accessibilityRole="button" accessibilityLabel={`${label} ${name}`}><View minHeight={35} paddingHorizontal="$2" borderRadius={10} borderWidth={1} borderColor="$neutral200" backgroundColor="$paper" alignItems="center" justifyContent="center"><Text style={{ ...type.label, color: colors.ink }}>{label}</Text></View></Pressable>)}
        </View>
      </View>

      <InspectorSection label="RELATIONSHIP MEMORY">
        <View padding="$3" borderRadius={14} backgroundColor="$lavender"><Text style={{ ...type.body, fontWeight: '700', color: colors.ink }}>Warm + direct</Text><Text style={{ ...type.bodySmall, color: colors.neutral[600], marginTop: 7 }}>Keep replies concise. Surface open decisions and avoid over-explaining.</Text></View>
      </InspectorSection>

      <InspectorSection label="OPEN PROMISES">
        <View flexDirection="row" alignItems="center" columnGap="$2"><View width={34} height={34} borderRadius={17} borderWidth={1} borderColor="$ink" alignItems="center" justifyContent="center"><Circle size={6} color={colors.ink} /></View><View flex={1} minWidth={0}><Text numberOfLines={1} style={{ ...type.bodySmall, fontWeight: '700', color: colors.ink }}>{promiseTitle}</Text><Text style={{ ...type.label, color: colors.neutral[600], marginTop: 2 }}>{message.has_open_promise ? 'Open loop · needs attention' : 'Claire will surface one when it appears'}</Text></View></View>
      </InspectorSection>

      <InspectorSection label="SHARED">
        <Text style={{ ...type.body, fontWeight: '700', color: colors.ink }}>{sharedSummary}</Text>
        <Text style={{ ...type.bodySmall, color: colors.neutral[600], marginTop: 5 }}>{message.media_url ? 'Open media from the conversation.' : 'Files and links from this conversation appear here.'}</Text>
      </InspectorSection>

      <InspectorSection label="DESCRIPTION" last>
        <Text style={{ ...type.bodySmall, color: colors.neutral[600] }}>{message.content || 'No description has been added to this conversation.'}</Text>
      </InspectorSection>
    </ScrollView>
  </View>;
}

function InspectorSection({ label, children, last = false }: { label: string; children: ReactNode; last?: boolean }) {
  return <View paddingVertical="$4" borderBottomWidth={last ? 0 : 1} borderColor="$neutral200"><Text style={{ ...type.monoLabel, color: colors.ink, letterSpacing: 1 }}>{label}</Text><View marginTop="$3">{children}</View></View>;
}
