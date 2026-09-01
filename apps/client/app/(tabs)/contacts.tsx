import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, SectionList, Text, View } from 'react-native';
import { Check, ListFilter, Search } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, mobileType, space, useIsDesktopLayout } from '@claire/design-system';
import { useAuthStore } from '../../stores/authStore';
import { MobileAvatar, MobileChip, MobileHeader, MobileIconButton, MobileSearchField, MobileState } from '../../components/mobile/claire-mobile';
import { BottomSheet } from '../../components/mobile/bottom-sheet';
import { PlatformIcon, PlatformName } from '../../components/PlatformIcon';
import { Platform, platformLabel } from '../../types/platform';
import { PeopleSkeleton } from '../../components/claire/skeleton';
import { cachedContacts, replaceCachedContacts, usesNativeMobileCache } from '../../services/mobile-cache';
import { contactsApi, type PeopleFilter, type PersonContact } from '../../services/contacts';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { displayPersonDetails, displayPersonName } from '../../services/contact-display';
import { isPhoneNumberFallback } from '../../services/phone-numbers';

type PlatformFilter = 'all' | Platform;

const CURRENT_FILTERS: Array<{ value: PeopleFilter; label: string; detail: string }> = [
  { value: 'all', label: 'All people', detail: 'Everyone Claire has synced' },
  { value: 'contacted', label: 'Contacted', detail: 'People you have messaged' },
  { value: 'needs_context', label: 'Needs context', detail: 'People without relationship context' },
  { value: 'groups', label: 'Groups', detail: 'Group conversations' },
];

const COMING_SOON_FILTERS = [
  ['Open loops', 'Unresolved promises, questions, and plans'],
  ['Needs reply', 'Conversations waiting on you'],
  ['Follow-ups due', 'Commitments and reminders with a next step'],
  ['Reconnecting', 'People you have not talked to recently'],
  ['Context gaps', 'Important people Claire knows little about'],
  ['Important moments', 'Relevant dates and shared context'],
] as const;

const PLATFORM_ORDER: Platform[] = [Platform.WHATSAPP, Platform.INSTAGRAM, Platform.IMESSAGE, Platform.TELEGRAM];

function contactPlatform(contact: PersonContact) {
  return contact.chat?.platform || contact.platform || null;
}

/**
 * A contact is the durable platform profile; a chat is the latest
 * conversation envelope. Older WhatsApp imports occasionally have identity
 * metadata only on that envelope, so use it as a display-only fallback. This
 * keeps a person identifiable without ever surfacing the bridge LID.
 */
function displayIdentity(contact: PersonContact) {
  const chatName = contact.chat?.name?.trim() || null;
  return {
    ...contact,
    platform: contactPlatform(contact),
    name: contact.name || contact.inferred_name || chatName,
    phone_number: contact.phone_number || (chatName && isPhoneNumberFallback(chatName) ? chatName : null),
  };
}

function personName(contact: PersonContact): string {
  return displayPersonName(displayIdentity(contact), 'Unknown person');
}

function personDetails(contact: PersonContact): string | null {
  return displayPersonDetails(displayIdentity(contact));
}

type PeopleSection = { title: string; data: PersonContact[] };

function alphabetLetter(contact: PersonContact): string {
  const initial = personName(contact)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(initial) ? initial : '#';
}

function alphabetizedSections(contacts: PersonContact[]): PeopleSection[] {
  const grouped = new Map<string, PersonContact[]>();
  for (const contact of contacts) {
    const letter = alphabetLetter(contact);
    const section = grouped.get(letter) || [];
    section.push(contact);
    grouped.set(letter, section);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => {
      if (left === '#') return 1;
      if (right === '#') return -1;
      return left.localeCompare(right);
    })
    .map(([title, data]) => ({ title, data }));
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
  const requestedIdentitySyncFor = useRef<string | null>(null);
  const peopleListRef = useRef<SectionList<PersonContact>>(null);
  // The letter a pending scroll is aiming at, so a failed attempt can be
  // retried once the rows around it have been measured.
  const pendingJumpRef = useRef<number | null>(null);
  const debouncedSearchQuery = useDebouncedValue(searchQuery);

  useEffect(() => {
    setSearchQuery(params.q || params.query || '');
  }, [params.q, params.query]);

  const queryClient = useQueryClient();
  const peopleQueryKey = useMemo(
    () => ['people', user?.id, debouncedSearchQuery, platform, filter] as const,
    [user?.id, debouncedSearchQuery, platform, filter],
  );

  // People still needs the whole directory in memory — the A–Z index jumps to a
  // letter, so a partially loaded list would send "J" somewhere arbitrary. What
  // changes is where it comes from. The directory barely moves between visits,
  // so read it from the local cache and let the network refresh happen behind
  // the already-rendered list rather than in front of an empty one.
  const peopleQuery = useQuery({
    queryKey: peopleQueryKey,
    enabled: !!user?.id,
    // The cache makes a revisit free; this only decides how long before a
    // background refresh is worth the round trip.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      const contacts = await contactsApi.listAll(
        { query: debouncedSearchQuery, platform, filter },
        // Publish each page as it arrives. Writing to the cache mid-flight
        // flips the query to success while isFetching stays true, so the list
        // renders and keeps filling instead of holding a skeleton for the whole
        // walk. Stale on purpose: this is a partial answer, not the result.
        (soFar) => {
          queryClient.setQueryData(
            peopleQueryKey,
            { contacts: [...soFar], nextOffset: null },
            { updatedAt: 0 },
          );
        },
      );
      // Only the unfiltered directory is worth persisting: a search or filter
      // result is a slice, and caching it would let a later cold open render
      // that slice as though it were everyone.
      if (user?.id && !debouncedSearchQuery && platform === 'all' && filter === 'all') {
        void replaceCachedContacts(user.id, contacts as never).catch(() => undefined);
      }
      return { contacts, nextOffset: null };
    },
  });

  // Seed from disk so the list paints on the first frame. Guarded on the query
  // having no data yet, so a completed network refresh is never overwritten by
  // a slower cache read.
  useEffect(() => {
    if (!user?.id || !usesNativeMobileCache()) return;
    if (debouncedSearchQuery || platform !== 'all' || filter !== 'all') return;
    let active = true;
    void cachedContacts(user.id)
      .then((rows) => {
        if (!active || !rows.length) return;
        if (queryClient.getQueryData(peopleQueryKey)) return;
        queryClient.setQueryData(
          peopleQueryKey,
          { contacts: rows as unknown as PersonContact[], nextOffset: null },
          // Stale on purpose: this is a starting picture, not a fresh fetch.
          { updatedAt: 0 },
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [queryClient, peopleQueryKey, user?.id, debouncedSearchQuery, platform, filter]);

  useEffect(() => {
    if (!user?.id || requestedIdentitySyncFor.current === user.id) return;
    requestedIdentitySyncFor.current = user.id;
    // This only starts a per-user, metadata-only bridge sync. It is safe to
    // ignore a missing/disconnected WhatsApp account; People still renders
    // the identities already stored for other platforms.
    // The task is asynchronous. Refresh a few times while a linked account's
    // bounded directory import runs, instead of repeatedly downloading a
    // possible 10k-person directory for the entire life of the screen.
    const refreshTimers = [3_000, 15_000, 45_000].map((delay) => setTimeout(() => {
      void peopleQuery.refetch();
    }, delay));
    void contactsApi.startIdentitySync().catch(() => undefined);
    return () => refreshTimers.forEach(clearTimeout);
  }, [user?.id, peopleQuery.refetch]);
  const contacts = useMemo(
    () => (peopleQuery.data?.contacts || [])
      .slice()
      .sort((left, right) => {
        const leftName = personName(left);
        const rightName = personName(right);
        const leftUnknown = leftName === 'WhatsApp contact' || leftName === 'Unknown person';
        const rightUnknown = rightName === 'WhatsApp contact' || rightName === 'Unknown person';
        if (leftUnknown !== rightUnknown) return leftUnknown ? 1 : -1;
        return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
      }),
    [peopleQuery.data],
  );
  const sections = useMemo(() => alphabetizedSections(contacts), [contacts]);

  const jumpToSection = useCallback((sectionIndex: number) => {
    pendingJumpRef.current = sectionIndex;
    peopleListRef.current?.scrollToLocation({ sectionIndex, itemIndex: 0, animated: true, viewOffset: 8 });
  }, []);

  /**
   * A SectionList can only scroll to a row it has already measured, and this
   * list is long enough that most letters are far offscreen. Without this
   * handler React Native throws an invariant instead of scrolling — which it
   * did on every tap of the A–Z index, and went unnoticed only because the
   * screen used to fail to load at all, so the index was never tappable.
   *
   * Jump to an estimated offset, which forces the rows around it to render, and
   * retry the real scroll once. Bounded to a single retry: the estimate is
   * close enough that a second failure means the target genuinely is not there.
   */
  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      const pending = pendingJumpRef.current;
      pendingJumpRef.current = null;
      peopleListRef.current?.getScrollResponder()?.scrollTo({
        y: Math.max(0, info.averageItemLength * info.index),
        animated: false,
      });
      if (pending === null) return;
      requestAnimationFrame(() => {
        peopleListRef.current?.scrollToLocation({
          sectionIndex: pending,
          itemIndex: 0,
          animated: true,
          viewOffset: 8,
        });
      });
    },
    [],
  );

  // Keep every supported platform visible. A zero-result Instagram filter is
  // useful feedback that the account has no synced Instagram conversations;
  // hiding it made that distinction impossible to see.
  const platformOptions = PLATFORM_ORDER;

  /**
   * Every row opens the person, not the conversation.
   *
   * This used to require an existing chat and do nothing otherwise, which on a
   * bridged directory means almost every row: 151 of 21,366 on the account this
   * was measured against. The rest were dimmed and inert with nowhere to go.
   * The detail view is that somewhere, and it owns the decision about whether a
   * conversation can be opened or has to be started.
   */
  const openContact = (contact: PersonContact) => {
    router.push({ pathname: '/people/[contactId]', params: { contactId: contact.id } });
  };

  const selectPlatform = (value: PlatformFilter) => {
    setPlatform(value);
    setShowPlatformFilter(false);
  };

  const emptyTitle = searchQuery
    ? 'No people found'
    : filter === 'contacted'
      ? 'No people contacted yet'
      : platform !== 'all'
        ? `No people on ${platformLabel(platform)}`
        : 'No people yet';
  const emptyMessage = searchQuery
    ? 'Try another name or number.'
    : platform !== 'all'
      ? 'Contacts from this connected account appear here after it syncs.'
      : 'Contacts from your connected accounts appear here after they sync.';

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
          <MobileChip label="Contacted" active={filter === 'contacted'} onPress={() => setFilter('contacted')} />
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
        <View style={{ flex: 1, minHeight: 0 }}>
        <SectionList
          ref={peopleListRef}
          sections={sections}
          keyExtractor={item => item.id}
          testID="contacts-list"
          style={{ backgroundColor: colors.paper }}
          contentContainerStyle={{ paddingLeft: space[4], paddingRight: 30, paddingBottom: 104 }}
          stickySectionHeadersEnabled={false}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.neutral[200] }} />}
          renderSectionHeader={({ section }) => (
            <View style={{ paddingTop: space[3], paddingBottom: space[1] }}>
              <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const name = personName(item);
            const identityDetail = personDetails(item);
            const secondaryDetail = identityDetail || item.inferred_relationship || (item.is_group ? 'Group conversation' : null);
            return (
              <Pressable
                accessibilityRole="button"
                onPress={() => openContact(item)}
                style={{ backgroundColor: colors.paper }}
              >
                <View style={{ minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
                  <MobileAvatar name={name} uri={item.avatar_url} size={48} isGroup={item.is_group} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{name}</Text>
                    {secondaryDetail ? <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{secondaryDetail}</Text> : null}
                    <PlatformName platform={contactPlatform(item)} size={12} />
                  </View>
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={<MobileState error={!!peopleQuery.error} title={peopleQuery.error ? 'People are unavailable' : emptyTitle} message={peopleQuery.error ? 'Try again in a moment.' : emptyMessage} />}
        />
        {sections.length ? <View pointerEvents="box-none" style={{ position: 'absolute', right: 2, top: space[2], bottom: 96, justifyContent: 'center' }} testID="people-alphabet-index">
          {sections.map((section, sectionIndex) => (
            <Pressable
              key={section.title}
              accessibilityRole="button"
              accessibilityLabel={`Jump to ${section.title}`}
              hitSlop={4}
              onPress={() => jumpToSection(sectionIndex)}
              style={{ minHeight: 15, minWidth: 20, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 10, lineHeight: 12, fontWeight: '800', color: colors.neutral[600] }}>{section.title}</Text>
            </Pressable>
          ))}
        </View> : null}
        </View>
      )}

      <BottomSheet visible={showPlatformFilter} title="Filter people" onClose={() => setShowPlatformFilter(false)} testID="people-platform-sheet" snapPoints={['88%']} scrollable>
        <View style={{ paddingHorizontal: space[4], paddingBottom: space[2] }}>
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], marginBottom: space[2] }}>SHOW</Text>
            {CURRENT_FILTERS.map((option, index) => (
              <View key={option.value}>
                {index ? <View style={{ height: 1, backgroundColor: colors.neutral[200] }} /> : null}
                <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === option.value }} onPress={() => { setFilter(option.value); setShowPlatformFilter(false); }} testID={`people-filter-${option.value}`}>
                  <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{option.label}</Text>
                      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{option.detail}</Text>
                    </View>
                    {filter === option.value ? <Check size={18} color={colors.ink} /> : null}
                  </View>
                </Pressable>
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: colors.neutral[200], marginVertical: space[2] }} />
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], marginBottom: space[2] }}>PLATFORM</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: platform === 'all' }} onPress={() => selectPlatform('all')} testID="people-platform-all">
              <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
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
                  <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <PlatformName platform={value} size={14} />
                      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Show {platformLabel(value)} people</Text>
                    </View>
                    {platform === value ? <Check size={18} color={colors.ink} /> : null}
                  </View>
                </Pressable>
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: colors.neutral[200], marginVertical: space[2] }} />
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], marginBottom: space[1] }}>CLAIRE INTELLIGENCE</Text>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginBottom: space[2] }}>Coming soon — these require reliable, explainable signals.</Text>
            {COMING_SOON_FILTERS.map(([label, detail], index) => (
              <View key={label}>
                {index ? <View style={{ height: 1, backgroundColor: colors.neutral[200] }} /> : null}
                <View accessibilityRole="text" style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], opacity: 0.58 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>{label}</Text>
                    <Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{detail}</Text>
                  </View>
                  <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>SOON</Text>
                </View>
              </View>
            ))}
        </View>
      </BottomSheet>
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
