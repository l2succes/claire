import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { ChevronRight, X } from 'lucide-react-native';
import { Stack, router } from 'expo-router';
import { colors, mobileType, space } from '@claire/design-system';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';
import { MobileAvatar, MobileIconButton, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';
import { PeopleSkeleton } from '../../components/claire/skeleton';
import { platformLabel } from '../../types/platform';
import { formatInboxTimestamp } from '../../utils/messageTimestamp';

interface ComposeRecipient {
  id: string;
  name: string;
  avatarUrl?: string | null;
  platform?: string | null;
  isGroup: boolean;
  lastMessageAt?: string | null;
}

function matchesQuery(recipient: ComposeRecipient, query: string) {
  if (!query) return true;
  return [recipient.name, recipient.platform, platformLabel(recipient.platform)].some(value => value?.toLowerCase().includes(query));
}

function RecipientRow({ recipient, onPress }: { recipient: ComposeRecipient; onPress: () => void }) {
  const detail = [platformLabel(recipient.platform), recipient.isGroup ? 'Group' : recipient.lastMessageAt ? formatInboxTimestamp(recipient.lastMessageAt) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      testID={`compose-recipient-${recipient.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${recipient.name}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.64 : 1 })}
    >
      <View style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
        <MobileAvatar name={recipient.name} uri={recipient.avatarUrl} size={46} isGroup={recipient.isGroup} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{recipient.name}</Text>
          <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{detail}</Text>
        </View>
        <ChevronRight size={18} color={colors.neutral[400]} />
      </View>
    </Pressable>
  );
}

function ComposeCloseButton() {
  return (
    <MobileIconButton label="Close" testID="compose-close" onPress={() => router.back()}>
      <X size={18} color={colors.ink} />
    </MobileIconButton>
  );
}

export function ComposeScreen() {
  const user = useAuthStore(state => state.user);
  const [query, setQuery] = useState('');
  const [recipients, setRecipients] = useState<ComposeRecipient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    Promise.all([
      supabase.from('contacts').select('id,name,phone_number,avatar_url,inferred_name').eq('user_id', user.id),
      supabase.from('chats').select('id,contact_id,name,platform,is_group,last_message_at').eq('user_id', user.id).order('last_message_at', { ascending: false }),
    ]).then(([contactResult, chatResult]) => {
      if (contactResult.error) throw contactResult.error;
      if (chatResult.error) throw chatResult.error;
      const contacts = Array.isArray(contactResult.data) ? contactResult.data : [];
      const chats = Array.isArray(chatResult.data) ? chatResult.data : chatResult.data ? [chatResult.data] : [];
      const contactsById = new Map(contacts.map(contact => [contact.id as string, contact]));
      setRecipients(chats.map(chat => {
        const contact = chat.contact_id ? contactsById.get(chat.contact_id) : undefined;
        const name = chat.name || contact?.name || contact?.inferred_name || contact?.phone_number || 'Unknown conversation';
        return {
          id: chat.id,
          name,
          avatarUrl: contact?.avatar_url,
          platform: chat.platform,
          isGroup: !!chat.is_group,
          lastMessageAt: chat.last_message_at,
        } satisfies ComposeRecipient;
      }));
    }).catch(error => console.error('[Compose] Failed to load recipients', error)).finally(() => setLoading(false));
  }, [user?.id]);

  const normalizedQuery = query.trim().toLowerCase();
  const visible = useMemo(() => recipients.filter(recipient => matchesQuery(recipient, normalizedQuery)), [normalizedQuery, recipients]);
  const people = useMemo(() => visible.filter(recipient => !recipient.isGroup), [visible]);
  const groups = useMemo(() => visible.filter(recipient => recipient.isGroup), [visible]);
  const sections = useMemo(() => [
    ...(people.length ? [{ key: 'suggested', title: 'Suggested', data: people }] : []),
    ...(groups.length ? [{ key: 'groups', title: 'Groups', data: groups }] : []),
  ], [groups, people]);
  const rows = useMemo(() => sections.flatMap(section => [
    { kind: 'label' as const, key: `label-${section.key}`, title: section.title },
    ...section.data.map(recipient => ({ kind: 'recipient' as const, key: recipient.id, recipient })),
  ]), [sections]);

  const openRecipient = (recipient: ComposeRecipient) => {
    router.push({
      pathname: '/chat/[chatId]',
      params: {
        chatId: recipient.id,
        contact_name: recipient.isGroup ? '' : recipient.name,
        chat_name: recipient.name,
        platform: recipient.platform || '',
        is_group: recipient.isGroup ? '1' : '0',
      },
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'New message',
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerBackVisible: false,
          headerStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: mobileType.sectionTitle.fontFamily, fontSize: 17, fontWeight: '700', color: colors.ink },
          headerLeft: () => <ComposeCloseButton />,
          headerRight: () => <View style={{ width: 40 }} />,
        }}
      />
      <View testID="compose-screen" style={{ flex: 1, backgroundColor: colors.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], marginHorizontal: space[4], paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
          <Text maxFontSizeMultiplier={1} style={{ ...mobileType.body, color: colors.neutral[600] }}>To:</Text>
          <TextInput
            testID="compose-to-input"
            accessibilityLabel="Message recipient"
            value={query}
            onChangeText={setQuery}
            placeholder="Name or handle"
            placeholderTextColor={colors.neutral[400]}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            maxFontSizeMultiplier={1}
            style={{ flex: 1, minHeight: 22, padding: 0, ...mobileType.body, color: colors.ink }}
          />
        </View>

        {loading ? <View style={{ paddingHorizontal: space[4] }}><PeopleSkeleton /></View> : (
          <FlatList
            data={rows}
            keyExtractor={item => item.key}
            testID="compose-recipient-list"
            contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => item.kind === 'label'
              ? <View style={{ paddingTop: space[4], paddingBottom: space[1] }}><SectionLabel title={item.title} /></View>
              : <RecipientRow recipient={item.recipient} onPress={() => openRecipient(item.recipient)} />}
            ListEmptyComponent={<MobileState title={normalizedQuery ? 'No matching people' : 'No conversations yet'} message={normalizedQuery ? 'Try another name or handle.' : 'Contacts appear here as conversations sync.'} />}
          />
        )}
      </View>
    </>
  );
}
