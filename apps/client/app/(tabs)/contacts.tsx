import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ChevronLeft, ListFilter, Search, Sparkles } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { supabase, type DbRow } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';
import { MobileAvatar, MobileChip, MobileHeader, MobileIconButton, MobileSearchField, MobileState } from '../../components/mobile/claire-mobile';
import { PlatformName } from '../../components/PlatformIcon';
import { Platform, platformLabel } from '../../types/platform';
import { PeopleSkeleton } from '../../components/claire/skeleton';

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
type PlatformFilter = 'all' | string;

const PLATFORM_ORDER: Platform[] = [Platform.WHATSAPP, Platform.INSTAGRAM, Platform.IMESSAGE, Platform.TELEGRAM];

function contactPlatform(contact: Contact) {
  return contact.chat?.platform || contact.platform || null;
}

export default function ContactsScreen() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState(params.q || '');
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [showPlatformFilter, setShowPlatformFilter] = useState(false);
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

  const platformCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of contacts) {
      const value = contactPlatform(contact);
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
  }, [contacts]);

  const platformOptions = useMemo(() => {
    const known = PLATFORM_ORDER.filter(value => platformCounts.has(value));
    const extras = [...platformCounts.keys()].filter(value => !PLATFORM_ORDER.includes(value as Platform)).sort();
    return [...known, ...extras];
  }, [platformCounts]);

  const needsContextCount = useMemo(
    () => contacts.filter(contact => (platform === 'all' || contactPlatform(contact) === platform) && !contact.inferred_relationship && !contact.is_group).length,
    [contacts, platform],
  );

  const filteredContacts = useMemo(() => contacts.filter(contact => {
    if (platform !== 'all' && contactPlatform(contact) !== platform) return false;
    if (filter === 'needs_context' && (contact.inferred_relationship || contact.is_group)) return false;
    if (filter === 'groups' && !contact.is_group) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [contact.name, contact.inferred_name, contact.phone_number, contact.inferred_relationship].some(value => value?.toLowerCase().includes(query));
  }), [contacts, filter, platform, searchQuery]);

  const openContact = (contact: Contact) => {
    if (!contact.chat) return;
    router.push({ pathname: '/chat/[chatId]', params: { chatId: contact.chat.id, contact_name: contact.name || contact.inferred_name || contact.phone_number || '', chat_name: contact.chat.name || '', platform: contact.chat.platform || contact.platform || '', is_group: contact.chat.is_group ? '1' : '0' } });
  };

  const selectPlatform = (value: PlatformFilter) => {
    setPlatform(value);
    setShowPlatformFilter(false);
  };

  const emptyTitle = searchQuery ? 'No people found' : platform !== 'all' ? `No people on ${platformLabel(platform)}` : 'No people yet';
  const emptyMessage = searchQuery
    ? 'Try another name or number.'
    : platform !== 'all'
      ? 'Contacts from this account appear here as conversations sync.'
      : 'Contacts appear here as conversations sync.';

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }} testID="contacts-screen">
      <MobileHeader
        title="People"
        subtitle="The people behind your conversations"
        safeArea
        leading={<MobileIconButton label="Back" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>}
        actions={
          <MobileIconButton
            label="Filter by platform"
            selected={platform !== 'all'}
            onPress={() => setShowPlatformFilter(true)}
            testID="people-platform-filter"
          >
            <ListFilter size={18} color={colors.ink} />
          </MobileIconButton>
        }
      />
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3], gap: space[3] }}>
        <MobileSearchField icon={<Search size={18} color={colors.neutral[600]} />} placeholder="Search people" value={searchQuery} onChangeText={setSearchQuery} testID="contacts-search-input" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          <MobileChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <MobileChip label="Needs context" count={needsContextCount} active={filter === 'needs_context'} onPress={() => setFilter('needs_context')} />
          <MobileChip label="Groups" active={filter === 'groups'} onPress={() => setFilter('groups')} />
        </ScrollView>
      </View>
        {loading ? <View style={{ paddingHorizontal: space[4] }}><PeopleSkeleton /></View> : (
        <FlatList
          data={filteredContacts}
          keyExtractor={item => item.id}
          testID="contacts-list"
          style={{ backgroundColor: colors.paper }}
          contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 104 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.neutral[200] }} />}
          renderItem={({ item }) => {
            const name = item.name || item.inferred_name || item.phone_number || 'Unknown person';
            const needsContext = !item.inferred_relationship && !item.is_group;
            return (
              <Pressable
                accessibilityRole="button"
                disabled={!item.chat}
                onPress={() => openContact(item)}
                style={({ pressed }) => ({
                  backgroundColor: colors.paper,
                  opacity: pressed ? 0.7 : item.chat ? 1 : 0.6,
                })}
              >
                <View style={{ minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
                  <MobileAvatar name={name} uri={item.avatar_url} size={48} isGroup={item.is_group} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{name}</Text>
                    <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{item.inferred_relationship || (item.is_group ? 'Group conversation' : 'Add context for better replies')}</Text>
                    <PlatformName platform={contactPlatform(item)} size={12} />
                  </View>
                  {needsContext ? (
                    <View style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 12, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={16} color={colors.ink} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={<MobileState title={emptyTitle} message={emptyMessage} />}
        />
      )}

      <Modal visible={showPlatformFilter} transparent animationType="slide" onRequestClose={() => setShowPlatformFilter(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(16,18,15,0.35)', justifyContent: 'flex-end' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close platform filter" style={{ flex: 1 }} onPress={() => setShowPlatformFilter(false)} />
          <View style={{ backgroundColor: colors.paper, borderTopLeftRadius: radius.panel, borderTopRightRadius: radius.panel, paddingHorizontal: space[5], paddingTop: space[4], paddingBottom: 36 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.neutral[300], alignSelf: 'center', marginBottom: space[4] }} />
            <Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>Filter by platform</Text>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 4, marginBottom: space[3] }}>People includes everyone Claire has synced, including Instagram.</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: platform === 'all' }} onPress={() => selectPlatform('all')} testID="people-platform-all">
              <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>All platforms</Text>
                  <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{contacts.length} people</Text>
                </View>
                {platform === 'all' ? <Check size={18} color={colors.ink} /> : null}
              </View>
            </Pressable>
            {platformOptions.map(value => (
              <View key={value}>
                <View style={{ height: 1, backgroundColor: colors.neutral[200] }} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: platform === value }}
                  onPress={() => selectPlatform(value)}
                  testID={`people-platform-${value}`}
                >
                  <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <PlatformName platform={value} size={14} />
                      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{platformCounts.get(value) || 0} people</Text>
                    </View>
                    {platform === value ? <Check size={18} color={colors.ink} /> : null}
                  </View>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}
