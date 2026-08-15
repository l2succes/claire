import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Brain, CheckCircle2, Clock3, FileText, MessageCircle, Search, Sparkles, UserRound, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileAvatar, MobileChip, MobileHeader, MobileSearchField, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';
import { useAuthStore } from '../../stores/authStore';
import { searchApi, type SearchScope } from '../../services/search';

const scopes: Array<{ value: SearchScope; label: string }> = [
  { value: 'everything', label: 'Everything' }, { value: 'messages', label: 'Messages' }, { value: 'people', label: 'People' }, { value: 'files', label: 'Files' }, { value: 'promises', label: 'Promises' },
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
      ...exact.data.messages.map(item => ({ kind: 'message' as const, id: item.id, title: item.chat?.name || item.contact?.name || item.contact?.inferred_name || item.contact_name || 'Conversation', subtitle: item.content, meta: `${item.platform || 'message'} · ${new Date(item.timestamp).toLocaleDateString()}`, onPress: () => router.push({ pathname: '/chat/[chatId]', params: { chatId: item.chat_id, chat_name: item.chat?.name || '', contact_name: item.contact_name || '', platform: item.platform || '', is_group: item.chat?.is_group ? '1' : '0', highlightMessageId: item.id } }) })),
      ...exact.data.people.map(item => ({ kind: 'person' as const, id: item.id, title: item.name || item.inferred_name || item.phone_number || 'Contact', subtitle: item.phone_number || 'Known contact', meta: item.platform || 'person', onPress: () => router.push({ pathname: '/(tabs)/contacts', params: { query: item.name || item.inferred_name || item.phone_number || '' } }) })),
      ...exact.data.promises.map(item => ({ kind: 'promise' as const, id: item.id, title: item.content, subtitle: item.chat?.name || 'Personal reminder', meta: item.deadline ? new Date(item.deadline).toLocaleDateString() : item.status, onPress: () => item.chat_id ? router.push({ pathname: '/chat/[chatId]', params: { chatId: item.chat_id, chat_name: item.chat?.name || '', platform: item.chat?.platform || '', is_group: item.chat?.is_group ? '1' : '0' } }) : router.push('/(tabs)/promises') })),
      ...exact.data.files.map(item => ({ kind: 'file' as const, id: item.id, title: item.content || item.content_type || 'Attachment', subtitle: item.chat?.name || item.contact_name || 'Conversation', meta: item.media_mime_type || item.platform || 'file', onPress: () => router.push({ pathname: '/chat/[chatId]', params: { chatId: item.chat_id, chat_name: item.chat?.name || '', contact_name: item.contact_name || '', platform: item.platform || '', is_group: item.chat?.is_group ? '1' : '0', highlightMessageId: item.id } }) })),
    ];
  }, [exact.data]);

  if (submitted) {
    return (
      <View testID="search-results-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
        <MobileHeader title="Search" subtitle={`${resultCount} result${resultCount === 1 ? '' : 's'} for “${submitted}”`} actions={<Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setSubmitted(''); setQuery(''); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={21} color={colors.ink} /></Pressable>} />
        <FlatList
          data={rows}
          keyExtractor={item => `${item.kind}-${item.id}`}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 112, gap: space[2] }}
          ListHeaderComponent={<View style={{ gap: space[4], paddingBottom: space[3] }}>
            {semantic.isLoading ? <View style={{ minHeight: 100, borderRadius: radius.card, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View> : semantic.data ? (
              <View style={{ padding: space[4], gap: space[2], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.lavender }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Sparkles size={17} color={colors.ink} /><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>CLAIRE'S ANSWER</Text></View>
                <Text selectable style={{ ...mobileType.body, color: colors.ink }}>{semantic.data.answer}</Text>
                <Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{semantic.data.citations.length} source message{semantic.data.citations.length === 1 ? '' : 's'}</Text>
                <View style={{ gap: space[2] }}>{semantic.data.citations.slice(0, 3).map(citation => <Pressable key={citation.messageId} onPress={() => router.push({ pathname: '/chat/[chatId]', params: { chatId: citation.chatId, chat_name: citation.chatName || '', platform: citation.platform, is_group: citation.isGroup ? '1' : '0', highlightMessageId: citation.messageId } })} style={({ pressed }) => ({ padding: space[3], borderRadius: radius.control, backgroundColor: colors.paper, opacity: pressed ? 0.68 : 1 })}><Text style={{ ...mobileType.label, color: colors.ink }}>{citation.chatName || citation.senderName} · {citation.platform}</Text><Text numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{citation.excerpt}</Text></Pressable>)}</View>
                <Pressable onPress={() => router.push('/assistant')} style={{ minHeight: 42, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space[2] }}><Brain size={16} color={colors.ink} /><Text style={{ ...mobileType.label, color: colors.ink }}>Continue with Ask Claire</Text></Pressable>
              </View>
            ) : null}
            <SectionLabel title="Best matches" detail={`${resultCount}`} />
          </View>}
          renderItem={({ item }) => <Pressable testID={`search-result-${item.kind}-${item.id}`} onPress={item.onPress} style={({ pressed }) => ({ minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200], opacity: pressed ? 0.65 : 1 })}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: item.kind === 'message' ? colors.sky : item.kind === 'person' ? colors.blush : item.kind === 'promise' ? colors.lime : colors.lavender, alignItems: 'center', justifyContent: 'center' }}>{item.kind === 'message' ? <MessageCircle size={18} color={colors.ink} /> : item.kind === 'person' ? <UserRound size={18} color={colors.ink} /> : item.kind === 'promise' ? <CheckCircle2 size={18} color={colors.ink} /> : <FileText size={18} color={colors.ink} />}</View>
            <View style={{ flex: 1, minWidth: 0 }}><Text selectable numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{item.title}</Text><Text selectable numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{item.subtitle}</Text></View>
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400], maxWidth: 76 }} numberOfLines={2}>{item.meta}</Text>
          </Pressable>}
          ListEmptyComponent={exact.isLoading ? <ActivityIndicator color={colors.ink} /> : <MobileState error={!!exact.error} title={exact.error ? 'Search is unavailable' : 'No matches'} message={exact.error ? exact.error.message : 'Try a different phrase or search Everything for a semantic answer.'} />}
        />
      </View>
    );
  }

  return (
    <ScrollView testID="search-screen" style={{ flex: 1, backgroundColor: colors.cream }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 112 }} keyboardShouldPersistTaps="handled">
      <MobileHeader title="Search everything" />
      <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
        <MobileSearchField icon={<Search size={20} color={colors.ink} />} value={query} onChangeText={setQuery} onSubmitEditing={runSearch} placeholder="Messages, people, promises…" returnKeyType="search" style={{ minHeight: 52, backgroundColor: colors.paper, borderWidth: 2, borderColor: colors.ink }} testID="global-search-input" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>{scopes.map(item => <MobileChip key={item.value} label={item.label} active={scope === item.value} onPress={() => setScope(item.value)} />)}</ScrollView>
        {recent.length ? <><SectionLabel title="Recent searches" detail="Clear" />{recent.map(item => <Pressable key={item} onPress={() => { setQuery(item); setSubmitted(item); }} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200], opacity: pressed ? 0.64 : 1 })}><Clock3 size={17} color={colors.neutral[600]} /><Text numberOfLines={1} style={{ ...mobileType.body, flex: 1, color: colors.ink }}>{item}</Text><Pressable accessibilityLabel={`Remove ${item}`} onPress={() => { const next = recent.filter(value => value !== item); setRecent(next); void AsyncStorage.setItem(storageKey, JSON.stringify(next)); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={colors.neutral[400]} /></Pressable></Pressable>)}</> : null}
        <View style={{ padding: space[4], gap: space[2], borderRadius: radius.card, backgroundColor: colors.lavender }}><Sparkles size={21} color={colors.ink} /><Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>Ask naturally.</Text><Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Try “Who recommended the Oaxaca hotel?” or “What did Maya say about launch timing?”</Text></View>
      </View>
    </ScrollView>
  );
}
