import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronLeft, Search, Sparkles } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, mobileType, space } from '@claire/design-system';
import { supabase, type DbRow } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';
import { MobileAvatar, MobileChip, MobileIconButton, MobileSearchField, MobileState } from '../../components/mobile/claire-mobile';

interface Contact {
  id: string;
  name: string | null;
  phone_number: string | null;
  avatar_url?: string | null;
  inferred_name?: string | null;
  inferred_relationship?: string | null;
  is_group: boolean;
  platform?: string | null;
  chat?: { id: string; name: string | null; platform: string | null; is_group: boolean; last_message_at: string | null };
}

type PeopleFilter = 'all' | 'needs_context' | 'groups';

export default function ContactsScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState(params.q || '');
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [loading, setLoading] = useState(true);
  const user = useAuthStore(state => state.user);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from('contacts').select('id,name,phone_number,avatar_url,inferred_name,inferred_relationship,is_group,platform').eq('user_id', user.id).order('name'),
      supabase.from('chats').select('id,contact_id,name,platform,is_group,last_message_at').eq('user_id', user.id).order('last_message_at', { ascending: false }),
    ]).then(([contactResult, chatResult]) => {
      if (contactResult.error) throw contactResult.error;
      if (chatResult.error) throw chatResult.error;
      const chatsByContact = new Map<string, Contact['chat']>();
      for (const chat of chatResult.data || []) if (chat.contact_id && !chatsByContact.has(chat.contact_id)) chatsByContact.set(chat.contact_id, chat);
      setContacts((contactResult.data || []).map((contact: DbRow) => ({ ...contact, chat: chatsByContact.get(contact.id) })) as Contact[]);
    }).catch(error => console.error('[People] Failed to load contacts', error)).finally(() => setLoading(false));
  }, [user?.id]);

  const filteredContacts = useMemo(() => contacts.filter(contact => {
    if (filter === 'needs_context' && contact.inferred_relationship) return false;
    if (filter === 'groups' && !contact.is_group) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [contact.name, contact.inferred_name, contact.phone_number, contact.inferred_relationship].some(value => value?.toLowerCase().includes(query));
  }), [contacts, filter, searchQuery]);

  const openContact = (contact: Contact) => {
    if (!contact.chat) return;
    router.push({ pathname: '/chat/[chatId]', params: { chatId: contact.chat.id, contact_name: contact.name || contact.inferred_name || contact.phone_number || '', chat_name: contact.chat.name || '', platform: contact.chat.platform || contact.platform || '', is_group: contact.chat.is_group ? '1' : '0' } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }} testID="contacts-screen">
      <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
        <MobileIconButton label="Back to Inbox" onPress={() => router.back()}><ChevronLeft size={21} color={colors.ink} /></MobileIconButton>
        <View style={{ flex: 1 }}><Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>People</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>The people behind your conversations</Text></View>
      </View>
      <View style={{ padding: space[4], gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
        <MobileSearchField icon={<Search size={18} color={colors.neutral[600]} />} placeholder="Search people" value={searchQuery} onChangeText={setSearchQuery} testID="contacts-search-input" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          <MobileChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <MobileChip label="Needs context" count={contacts.filter(contact => !contact.inferred_relationship).length} active={filter === 'needs_context'} onPress={() => setFilter('needs_context')} />
          <MobileChip label="Groups" active={filter === 'groups'} onPress={() => setFilter('groups')} />
        </ScrollView>
      </View>
      {loading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View> : (
        <FlatList
          data={filteredContacts}
          keyExtractor={item => item.id}
          testID="contacts-list"
          contentContainerStyle={{ paddingHorizontal: space[4], paddingVertical: space[3], paddingBottom: 104 }}
          renderItem={({ item }) => {
            const name = item.name || item.inferred_name || item.phone_number || 'Unknown person';
            return <Pressable accessibilityRole="button" disabled={!item.chat} onPress={() => openContact(item)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 74, paddingVertical: space[2], opacity: pressed ? 0.7 : item.chat ? 1 : 0.6, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] })}>
              <MobileAvatar name={name} uri={item.avatar_url} size={48} isGroup={item.is_group} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}><Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{name}</Text><Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{item.inferred_relationship || (item.is_group ? 'Group conversation' : 'Add context for better replies')}</Text><Text style={{ ...mobileType.label, color: colors.neutral[400], textTransform: 'capitalize' }}>{item.chat?.platform || item.platform || 'Conversation'}</Text></View>
              {!item.inferred_relationship ? <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' }}><Sparkles size={16} color={colors.ink} /></View> : null}
            </Pressable>;
          }}
          ListEmptyComponent={<MobileState title={searchQuery ? 'No people found' : 'No people yet'} message={searchQuery ? 'Try another name or number.' : 'Contacts appear here as conversations sync.'} />}
        />
      )}
    </View>
  );
}
