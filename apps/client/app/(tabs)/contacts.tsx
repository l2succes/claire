import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, ChevronLeft, ListFilter, Search, Sparkles } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { colors, mobileType, radius, space, useIsDesktopLayout } from '@claire/design-system';
import { useAuthStore } from '../../stores/authStore';
import { MobileAvatar, MobileChip, MobileHeader, MobileIconButton, MobileSearchField, MobileState } from '../../components/mobile/claire-mobile';
import { PlatformIcon, PlatformName } from '../../components/PlatformIcon';
import { Platform, platformLabel } from '../../types/platform';
import { PeopleSkeleton } from '../../components/claire/skeleton';
import { contactsApi, type PeopleFilter, type PersonContact } from '../../services/contacts';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { displayPersonDetails, displayPersonName } from '../../services/contact-display';

type PlatformFilter = 'all' | Platform;

const PLATFORM_ORDER: Platform[] = [Platform.WHATSAPP, Platform.INSTAGRAM, Platform.IMESSAGE, Platform.TELEGRAM];

function contactPlatform(contact: PersonContact) {
  return contact.chat?.platform || contact.platform || null;
}

function personName(contact: PersonContact): string {
  return displayPersonName({ ...contact, platform: contactPlatform(contact) }, 'Unknown person');
}

function personDetails(contact: PersonContact): string | null {
  return displayPersonDetails(contact);
}

export default function ContactsScreen() {
  const isDesktop = useIsDesktopLayout();
  const params = useLocalSearchParams<{ q?: string; query?: string }>();
  const [searchQuery, setSearchQuery] = useState(params.q || params.query || '');
  const [filter, setFilter] = useState<PeopleFilter>('all');
  const [platform, setPlatform] = useState<PlatformFilter>('all');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showPlatformFilter, setShowPlatformFilter] = useState(false);
  const user = useAuthStore(state => state.user);
  const debouncedSearchQuery = useDebouncedValue(searchQuery);

  useEffect(() => {
    setSearchQuery(params.q || params.query || '');
  }, [params.q, params.query]);

  const peopleQuery = useInfiniteQuery({
    queryKey: ['people', user?.id, debouncedSearchQuery, platform, filter],
    enabled: !!user?.id,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => contactsApi.list({
      offset: pageParam,
      query: debouncedSearchQuery,
      platform,
      filter,
    }),
    getNextPageParam: (page) => page.nextOffset,
  });
  const contacts = useMemo(
    () => peopleQuery.data?.pages.flatMap((page) => page.contacts) || [],
    [peopleQuery.data],
  );
  // Keep every supported platform visible. A zero-result Instagram filter is
  // useful feedback that the account has no synced Instagram conversations;
  // hiding it made that distinction impossible to see.
  const platformOptions = PLATFORM_ORDER;

  const openContact = (contact: PersonContact) => {
    if (!contact.chat) return;
    router.push({ pathname: '/chat/[chatId]', params: { chatId: contact.chat.id, contact_name: personName(contact), chat_name: contact.chat.name || '', platform: contact.chat.platform || contact.platform || '', is_group: contact.chat.is_group ? '1' : '0' } });
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

  if (isDesktop) {
    const selected = contacts.find((contact) => contact.id === selectedContactId) || contacts[0];
    return <DesktopPeopleWorkspace
      contacts={contacts}
      selected={selected}
      searchQuery={searchQuery}
      loading={peopleQuery.isLoading}
      onSearch={setSearchQuery}
      onSelect={setSelectedContactId}
      onOpen={openContact}
      platform={platform}
      onPlatformChange={setPlatform}
    />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }} testID="contacts-screen">
      <MobileHeader
        title="People"
        subtitle="The people behind your conversations"
        safeArea
        leading={isDesktop ? undefined : <MobileIconButton label="Back" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>}
        actions={!isDesktop ? (
          <MobileIconButton
            label="Filter by platform"
            selected={platform !== 'all'}
            onPress={() => setShowPlatformFilter(true)}
            testID="people-platform-filter"
          >
            <ListFilter size={18} color={colors.ink} />
          </MobileIconButton>
        ) : undefined}
      />
      <View style={{ paddingHorizontal: space[4], paddingBottom: space[3], gap: space[3] }}>
        <MobileSearchField icon={<Search size={18} color={colors.neutral[600]} />} placeholder="Search people" value={searchQuery} onChangeText={setSearchQuery} testID="contacts-search-input" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          <MobileChip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
          <MobileChip label="Needs context" active={filter === 'needs_context'} onPress={() => setFilter('needs_context')} />
          <MobileChip label="Groups" active={filter === 'groups'} onPress={() => setFilter('groups')} />
          <MobileChip
            label={platform === 'all' ? 'All platforms' : platformLabel(platform)}
            active={platform !== 'all'}
            icon={platform === 'all' ? <ListFilter size={14} color={filter === 'all' ? colors.neutral[600] : colors.ink} /> : <PlatformIcon platform={platform} size={14} />}
            onPress={() => setShowPlatformFilter(true)}
            testID="people-platform-filter-chip"
          />
        </ScrollView>
      </View>
        {peopleQuery.isLoading ? <View style={{ paddingHorizontal: space[4] }}><PeopleSkeleton /></View> : (
        <FlatList
          data={contacts}
          keyExtractor={item => item.id}
          testID="contacts-list"
          style={{ backgroundColor: colors.paper }}
          contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 104 }}
          onEndReached={() => {
            if (peopleQuery.hasNextPage && !peopleQuery.isFetchingNextPage) void peopleQuery.fetchNextPage();
          }}
          onEndReachedThreshold={0.6}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.neutral[200] }} />}
          renderItem={({ item }) => {
            const name = personName(item);
            const identityDetail = personDetails(item);
            const needsContext = !item.inferred_relationship && !item.is_group;
            return (
              <Pressable
                accessibilityRole="button"
                disabled={!item.chat}
                onPress={() => openContact(item)}
                style={{
                  backgroundColor: colors.paper,
                  opacity: item.chat ? 1 : 0.6,
                }}
              >
                <View style={{ minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
                  <MobileAvatar name={name} uri={item.avatar_url} size={48} isGroup={item.is_group} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{name}</Text>
                    <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{identityDetail || item.inferred_relationship || (item.is_group ? 'Group conversation' : 'Add context for better replies')}</Text>
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
          ListEmptyComponent={<MobileState error={!!peopleQuery.error} title={peopleQuery.error ? 'People are unavailable' : emptyTitle} message={peopleQuery.error ? 'Try again in a moment.' : emptyMessage} />}
          ListFooterComponent={peopleQuery.isFetchingNextPage ? <View style={{ paddingVertical: space[4] }}><PeopleSkeleton /></View> : null}
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
                  <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Every synced person</Text>
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
                      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Show {platformLabel(value)} people</Text>
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

function DesktopPeopleWorkspace({ contacts, selected, searchQuery, loading, onSearch, onSelect, onOpen, platform, onPlatformChange }: {
  contacts: PersonContact[];
  selected?: PersonContact;
  searchQuery: string;
  loading: boolean;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onOpen: (contact: PersonContact) => void;
  platform: PlatformFilter;
  onPlatformChange: (value: PlatformFilter) => void;
}) {
  const name = selected ? personName(selected) : 'Choose a person';
  const relationship = selected?.inferred_relationship || (selected?.is_group ? 'Group' : 'Uncategorized');
  const selectedPlatformLabel = selected ? platformLabel(contactPlatform(selected)) : 'No conversation selected';
  return <View style={{ flex: 1, flexDirection: 'row', minHeight: 0, backgroundColor: colors.cream }} testID="desktop-people-screen">
    <View style={{ width: 274, flexShrink: 0, backgroundColor: colors.paper, borderRightWidth: 1, borderColor: colors.neutral[200], padding: space[3] }}>
      <Text style={{ ...mobileType.screenTitle, color: colors.ink, marginBottom: space[3] }}>People</Text>
      <MobileSearchField icon={<Search size={17} color={colors.neutral[600]} />} placeholder="Search people" value={searchQuery} onChangeText={onSearch} testID="contacts-search-input" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingTop: space[3] }}>
        <MobileChip label="All" active={platform === 'all'} onPress={() => onPlatformChange('all')} testID="people-platform-all" />
        {PLATFORM_ORDER.map((value) => <MobileChip key={value} label={platformLabel(value)} active={platform === value} onPress={() => onPlatformChange(value)} testID={`people-platform-${value}`} />)}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: space[3], paddingBottom: space[2] }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>RECENT</Text><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>A–Z</Text></View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space[3] }}>
        {loading ? <PeopleSkeleton /> : contacts.map((contact) => {
          const contactName = personName(contact);
          const detail = personDetails(contact);
          const active = selected?.id === contact.id;
          return <Pressable key={contact.id} onPress={() => onSelect(contact.id)} accessibilityRole="button" style={{ opacity: 1 }}><View style={{ minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: space[2], padding: 8, borderRadius: 12, backgroundColor: active ? colors.lime : 'transparent' }}><MobileAvatar name={contactName} uri={contact.avatar_url} size={38} isGroup={contact.is_group} /><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>{contactName}</Text><Text numberOfLines={1} style={{ ...mobileType.label, color: colors.neutral[600] }}>{detail || contact.inferred_relationship || `${platformLabel(contactPlatform(contact))}`}</Text></View></View></Pressable>;
        })}
        {!loading && !contacts.length ? <MobileState title="No people yet" message="Contacts appear here as conversations sync." /> : null}
      </ScrollView>
    </View>
    <ScrollView style={{ flex: 1, minWidth: 0 }} contentContainerStyle={{ padding: 30, paddingBottom: 54 }}>
      {selected ? <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingBottom: 26, borderBottomWidth: 1, borderColor: colors.neutral[200] }}><MobileAvatar name={name} uri={selected.avatar_url} size={52} isGroup={selected.is_group} /><View style={{ flex: 1 }}><Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>{name}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{selectedPlatformLabel}{selected.phone_number ? ` · ${selected.phone_number}` : ''}</Text></View>{selected.chat ? <Pressable onPress={() => onOpen(selected)}><View style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.ink }}><Text style={{ ...mobileType.label, color: colors.paper }}>Open chat</Text></View></Pressable> : null}</View>
        <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], marginTop: 26, marginBottom: 10 }}>RELATIONSHIP TYPE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{['Business', 'Client', 'Colleague', 'Mentor', 'Friend', 'Family', 'Other'].map((item) => <View key={item} style={{ borderWidth: 1, borderColor: item === relationship ? colors.ink : colors.neutral[200], borderRadius: 99, backgroundColor: item === relationship ? colors.lime : colors.paper, paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ ...mobileType.label, color: colors.ink }}>{item}</Text></View>)}</View>
        <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], marginTop: 25, marginBottom: 10 }}>WHAT SHOULD CLAIRE REMEMBER?</Text>
        <View style={{ minHeight: 128, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 14, padding: space[3], backgroundColor: colors.paper }}><Text style={{ ...mobileType.bodySmall, color: colors.ink }}>{selected.inferred_relationship ? `${name} is ${selected.inferred_relationship.toLowerCase()}. Keep replies personal, clear, and grounded in the context of this relationship.` : `Add a little context about ${name} to make Claire’s suggestions more personal.`}</Text></View>
        <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], marginTop: 25, marginBottom: 10 }}>DEFAULT SUGGESTION TONE</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{[['Warm + direct', 'Clear, human, confident'], ['Professional', 'Polished and concise'], ['Casual', 'Relaxed and natural'], ['Playful', 'Light and expressive']].map(([title, detail], index) => <View key={title} style={{ width: '47%', minHeight: 76, borderWidth: 1, borderColor: index === 0 ? colors.ink : colors.neutral[200], borderRadius: 13, backgroundColor: index === 0 ? colors.lavender : colors.paper, padding: 11 }}><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>{title}</Text><Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{detail}</Text></View>)}</View>
        <Pressable style={{ alignSelf: 'flex-start', marginTop: 22 }}><View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 11, backgroundColor: colors.ink }}><Text style={{ ...mobileType.label, color: colors.paper }}>Save relationship memory</Text></View></Pressable>
      </> : <MobileState title="Choose a person" message="Select someone to work with relationship memory." />}
    </ScrollView>
    <View style={{ width: 270, flexShrink: 0, borderLeftWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, padding: space[4] }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>LIVE PREVIEW</Text><Text style={{ ...mobileType.sectionTitle, color: colors.ink, marginTop: 9 }}>See how Claire{`\n`}will help with {selected ? name.split(' ')[0] : 'them'}.</Text><View style={{ marginTop: 18, padding: space[3], borderRadius: 14, backgroundColor: colors.lavender }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>REPLY SUGGESTION</Text><Text style={{ ...mobileType.bodySmall, color: colors.ink, marginTop: 8 }}>“I’ve got it. I’ll keep this concise and make sure the next step is clear.”</Text><View style={{ alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: colors.ink, borderRadius: 99 }}><Text style={{ ...mobileType.label, color: colors.ink }}>Looks right</Text></View></View><View style={{ marginTop: 22, paddingTop: 18, borderTopWidth: 1, borderColor: colors.neutral[200] }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>CLAIRE WILL PRIORITIZE</Text><Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink, marginTop: 8 }}>Relationship context</Text><Text style={{ ...mobileType.label, color: colors.neutral[600] }}>Tone, history, and commitments that matter here.</Text></View></View>
  </View>;
}
