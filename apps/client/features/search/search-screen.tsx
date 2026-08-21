import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Brain, CheckCircle2, Clock3, FileText, MessageCircle, Search, Sparkles, UserRound, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileChip, MobileHeader, MobileSearchField, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';
import { PlatformBadge } from '../../components/PlatformIcon';
import { SearchResultsSkeleton } from '../../components/claire/skeleton';
import { useAuthStore } from '../../stores/authStore';
import { searchApi, type SearchScope } from '../../services/search';
import type { AssistantCitation } from '../../services/conversationAssistant';
import { resolvePlatform } from '../../types/platform';

const KIND_TINT: Record<string, string> = { message: colors.sky, person: colors.blush, loop: colors.lime, file: colors.lavender };

function ResultIcon({ kind, platform }: { kind: 'message' | 'person' | 'loop' | 'file'; platform?: string | null }) {
  const resolved = resolvePlatform(platform);
  return (
    <View style={{ width: 40, height: 40 }}>
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: KIND_TINT[kind], alignItems: 'center', justifyContent: 'center' }}>
        {kind === 'message' ? <MessageCircle size={18} color={colors.ink} /> : kind === 'person' ? <UserRound size={18} color={colors.ink} /> : kind === 'loop' ? <CheckCircle2 size={18} color={colors.ink} /> : <FileText size={18} color={colors.ink} />}
      </View>
      {resolved ? (
        <View style={{ position: 'absolute', right: -3, bottom: -3, padding: 1, borderRadius: 11, borderWidth: 2, borderColor: colors.cream, backgroundColor: colors.paper }}>
          <PlatformBadge platform={resolved} size={16} />
        </View>
      ) : null}
    </View>
  );
}

function CitationCard({ citation, onPress }: { citation: AssistantCitation; onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  const resolved = resolvePlatform(citation.platform);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ padding: space[3], borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, opacity: pressed ? 0.68 : 1 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        {resolved ? <PlatformBadge platform={resolved} size={14} /> : null}
        <Text numberOfLines={1} style={{ ...mobileType.label, color: colors.ink, flexShrink: 1 }}>{citation.chatName || citation.senderName}</Text>
      </View>
      <Text numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 4 }}>{citation.excerpt}</Text>
    </Pressable>
  );
}

type SearchResultItem = {
  kind: 'message' | 'person' | 'loop' | 'file';
  id: string;
  title: string;
  subtitle?: string;
  platform?: string | null;
  meta?: string;
  onPress: () => void;
};

function RecentSearchRow({ term, onPress, onRemove }: { term: string; onPress: () => void; onRemove: () => void }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200], opacity: pressed ? 0.64 : 1 }}
    >
      <Clock3 size={17} color={colors.neutral[600]} />
      <Text numberOfLines={1} style={{ ...mobileType.body, flex: 1, color: colors.ink }}>{term}</Text>
      <Pressable accessibilityLabel={`Remove ${term}`} onPress={onRemove} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={colors.neutral[400]} /></Pressable>
    </Pressable>
  );
}

function SearchResultRow({ item }: { item: SearchResultItem }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      testID={`search-result-${item.kind}-${item.id}`}
      onPress={item.onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[4], opacity: pressed ? 0.65 : 1 }}
    >
      <ResultIcon kind={item.kind} platform={item.platform} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text selectable numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{item.title}</Text>
        {item.subtitle ? <Text selectable numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 2 }}>{item.subtitle}</Text> : null}
      </View>
      {item.meta ? <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400], maxWidth: 76 }} numberOfLines={2}>{item.meta}</Text> : null}
    </Pressable>
  );
}

const scopes: Array<{ value: SearchScope; label: string }> = [
  { value: 'everything', label: 'Everything' }, { value: 'messages', label: 'Messages' }, { value: 'people', label: 'People' }, { value: 'files', label: 'Files' }, { value: 'loops', label: 'Loops' },
];

export function SearchScreen() {
  const user = useAuthStore(state => state.user);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [scope, setScope] = useState<SearchScope>('everything');
  const [recent, setRecent] = useState<string[]>([]);
  const storageKey = `claire:recent-searches:${user?.id || 'anonymous'}`;

  useEffect(() => { void AsyncStorage.getItem(storageKey).then(value => setRecent(value ? JSON.parse(value) as string[] : [])).catch(() => undefined); }, [storageKey]);
  const runSearch = () => {
    const value = query.trim();
    if (!value) return;
    setSubmitted(value);
    const next = [value, ...recent.filter(item => item !== value)].slice(0, 6);
    setRecent(next);
    void AsyncStorage.setItem(storageKey, JSON.stringify(next));
  };

  const exact = useQuery({ queryKey: ['mobile-search', user?.id, submitted, scope], enabled: !!submitted, queryFn: () => searchApi.exact(submitted, scope), staleTime: 60_000 });
  const semantic = useQuery({ queryKey: ['mobile-search-answer', user?.id, submitted], enabled: !!submitted && scope === 'everything', queryFn: () => searchApi.answer(submitted), staleTime: 5 * 60_000, retry: 1 });
  const resultCount = exact.data ? Object.values(exact.data.counts).reduce((sum, count) => sum + count, 0) : 0;
  const rows = useMemo(() => {
    if (!exact.data) return [];
    return [
      ...exact.data.messages.map(item => ({ kind: 'message' as const, id: item.id, title: item.chat?.name || item.contact?.name || item.contact?.inferred_name || item.contact_name || 'Conversation', subtitle: item.content, platform: item.platform, meta: new Date(item.timestamp).toLocaleDateString(), onPress: () => router.push({ pathname: '/chat/[chatId]', params: { chatId: item.chat_id, chat_name: item.chat?.name || '', contact_name: item.contact_name || '', platform: item.platform || '', is_group: item.chat?.is_group ? '1' : '0', highlightMessageId: item.id } }) })),
      ...exact.data.people.map(item => ({ kind: 'person' as const, id: item.id, title: item.name || item.inferred_name || item.phone_number || 'Contact', subtitle: item.phone_number || 'Known contact', platform: item.platform, meta: undefined as string | undefined, onPress: () => router.push({ pathname: '/(tabs)/contacts', params: { query: item.name || item.inferred_name || item.phone_number || '' } }) })),
      ...exact.data.loops.map(item => ({ kind: 'loop' as const, id: item.id, title: item.content, subtitle: item.chat?.name || 'Personal reminder', platform: item.chat?.platform, meta: item.deadline ? new Date(item.deadline).toLocaleDateString() : item.status, onPress: () => item.chat_id ? router.push({ pathname: '/chat/[chatId]', params: { chatId: item.chat_id, chat_name: item.chat?.name || '', platform: item.chat?.platform || '', is_group: item.chat?.is_group ? '1' : '0' } }) : router.push('/(tabs)/loops') })),
      ...exact.data.files.map(item => ({ kind: 'file' as const, id: item.id, title: item.content || item.content_type || 'Attachment', subtitle: item.chat?.name || item.contact_name || 'Conversation', platform: item.platform, meta: item.media_mime_type || undefined, onPress: () => router.push({ pathname: '/chat/[chatId]', params: { chatId: item.chat_id, chat_name: item.chat?.name || '', contact_name: item.contact_name || '', platform: item.platform || '', is_group: item.chat?.is_group ? '1' : '0', highlightMessageId: item.id } }) })),
    ];
  }, [exact.data]);

  if (submitted) {
    return (
      <View testID="search-results-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
        <MobileHeader title="Search" subtitle={`${resultCount} result${resultCount === 1 ? '' : 's'} for “${submitted}”`} actions={<Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setSubmitted(''); setQuery(''); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={21} color={colors.ink} /></Pressable>} />
        {exact.isLoading ? <SearchResultsSkeleton /> : (
        <FlatList
          data={rows}
          keyExtractor={item => `${item.kind}-${item.id}`}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 112 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.neutral[200] }} />}
          ListHeaderComponent={<View style={{ gap: space[4], paddingBottom: space[4] }}>
            {semantic.isLoading ? <View style={{ minHeight: 100, borderRadius: radius.card, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View> : semantic.data ? (
              <View style={{ padding: space[4], gap: space[3], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.lavender }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Sparkles size={17} color={colors.ink} /><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>CLAIRE'S ANSWER</Text></View>
                <Text selectable style={{ ...mobileType.body, color: colors.ink }}>{semantic.data.answer}</Text>
                <Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{semantic.data.citations.length} source message{semantic.data.citations.length === 1 ? '' : 's'}</Text>
                <View style={{ gap: space[3] }}>{semantic.data.citations.slice(0, 3).map(citation => <CitationCard key={citation.messageId} citation={citation} onPress={() => router.push({ pathname: '/chat/[chatId]', params: { chatId: citation.chatId, chat_name: citation.chatName || '', platform: citation.platform, is_group: citation.isGroup ? '1' : '0', highlightMessageId: citation.messageId } })} />)}</View>
                <Pressable onPress={() => router.push('/assistant')} style={{ minHeight: 42, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Brain size={16} color={colors.ink} /><Text style={{ ...mobileType.label, color: colors.ink }}>Continue with Ask Claire</Text></Pressable>
              </View>
            ) : null}
            <SectionLabel title="Best matches" detail={`${resultCount}`} />
          </View>}
          renderItem={({ item }) => <SearchResultRow item={item} />}
          ListEmptyComponent={<MobileState error={!!exact.error} title={exact.error ? 'Search is unavailable' : 'No matches'} message={exact.error ? exact.error.message : 'Try a different phrase or search Everything for a semantic answer.'} />}
        />
        )}
      </View>
    );
  }

  return (
    <ScrollView testID="search-screen" style={{ flex: 1, backgroundColor: colors.cream }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 112 }} keyboardShouldPersistTaps="handled">
      <MobileHeader title="Search everything" />
      <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
        <MobileSearchField icon={<Search size={20} color={colors.ink} />} value={query} onChangeText={setQuery} onSubmitEditing={runSearch} placeholder="Messages, people, loops…" returnKeyType="search" style={{ minHeight: 52, backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink }} testID="global-search-input" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>{scopes.map(item => <MobileChip key={item.value} label={item.label} active={scope === item.value} onPress={() => setScope(item.value)} />)}</ScrollView>
        {recent.length ? <><SectionLabel title="Recent searches" detail="Clear" />{recent.map(item => <RecentSearchRow key={item} term={item} onPress={() => { setQuery(item); setSubmitted(item); }} onRemove={() => { const next = recent.filter(value => value !== item); setRecent(next); void AsyncStorage.setItem(storageKey, JSON.stringify(next)); }} />)}</> : null}
        <View style={{ padding: space[4], gap: space[2], borderRadius: radius.card, backgroundColor: colors.lavender }}><Sparkles size={21} color={colors.ink} /><Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>Ask naturally.</Text><Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Try “Who recommended the Oaxaca hotel?” or “What did Maya say about launch timing?”</Text></View>
      </View>
    </ScrollView>
  );
}
