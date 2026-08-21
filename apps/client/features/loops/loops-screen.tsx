import { useState } from 'react';
import { FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { AlertCircle, Check, Clock3, MessageCircle, Plus, UserRound, UsersRound, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileChip, MobileHeader, MobileIconButton, MobileState } from '../../components/mobile/claire-mobile';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';
import { LoopsSkeleton } from '../../components/claire/skeleton';

type LoopFilter = 'open' | 'done' | 'waiting';
interface LoopItem {
  id: string;
  content: string;
  deadline?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'waiting' | 'snoozed' | 'done' | 'dropped' | 'superseded';
  owner?: 'me' | 'them' | 'shared' | 'unknown';
  snoozed_until?: string | null;
  from_me: boolean;
  chat_id?: string | null;
  platform?: string | null;
  contact_name?: string | null;
  chat?: { name?: string | null; is_group?: boolean | null; platform?: string | null; contact?: { name?: string | null; inferred_name?: string | null; avatar_url?: string | null } | null } | null;
  contact?: { name?: string | null; inferred_name?: string | null; avatar_url?: string | null } | null;
}

async function request<T>(path: string, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...init.headers } });
  const body = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body.data as T;
}

const LIVE_STATUSES: LoopItem['status'][] = ['open', 'waiting', 'snoozed'];

// Overdue is derived, never stored: a loop is overdue when the date it next
// needs attention has passed. Snoozing moves that date without touching the
// deadline the user actually committed to.
function isOverdue(item: LoopItem) {
  const due = item.snoozed_until || item.deadline;
  return !!due && new Date(due) < new Date() && LIVE_STATUSES.includes(item.status);
}

function conversationName(item: LoopItem) {
  return item.chat?.name || item.contact?.name || item.contact?.inferred_name || item.chat?.contact?.name || item.chat?.contact?.inferred_name || item.contact_name || 'Personal reminder';
}

export function LoopsScreen() {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<LoopFilter>('open');
  const [showCreate, setShowCreate] = useState(false);
  const [newLoop, setNewLoop] = useState('');
  // Pressable's ({ pressed }) => style callback is dropped by NativeWind's
  // react-native-css-interop wrapper, so the button renders with no style at
  // all. Track pressed state manually instead. See CLAUDE.md "Mobile gotchas".
  const [addLoopPressed, setAddLoopPressed] = useState(false);
  const query = useQuery({ queryKey: ['mobile-loops', user?.id], enabled: !!user?.id, queryFn: () => request<LoopItem[]>('/loops?limit=200'), staleTime: 60_000 });
  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: LoopItem['status'] }) => request<LoopItem>(`/loops/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-loops', user?.id] }),
  });
  const create = useMutation({
    mutationFn: (content: string) => request<LoopItem>('/loops', { method: 'POST', body: JSON.stringify({ content, priority: 'medium' }) }),
    onSuccess: () => { setNewLoop(''); setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['mobile-loops', user?.id] }); },
  });

  const items = query.data ?? [];
  const open = items.filter(item => LIVE_STATUSES.includes(item.status));
  const completed = items.filter(item => item.status === 'done');
  // "I'm waiting" means someone else owes the next move — not merely that the
  // loop was detected from an inbound message.
  const waiting = open.filter(item => (item.owner ? item.owner === 'them' : !item.from_me));
  const today = open.filter(item => item.deadline && new Date(item.deadline).toDateString() === new Date().toDateString()).length;
  const visible = filter === 'done' ? completed : filter === 'waiting' ? waiting : open;

  const renderItem = ({ item }: { item: LoopItem }) => {
    const name = conversationName(item);
    const avatar = item.contact?.avatar_url || item.chat?.contact?.avatar_url;
    const group = !!item.chat?.is_group;
    const overdue = isOverdue(item);
    return (
      <Pressable
        testID={`loop-item-${item.id}`}
        // Opens the loop, not the chat. Jumping straight into the conversation
        // meant snooze, notes, history, and delete had nowhere to live.
        // "Open conversation" is now a secondary action inside the detail page.
        onPress={() => router.push({ pathname: '/loops/[id]', params: { id: item.id } })}
        accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200], opacity: pressed ? 0.65 : 1 })}
      >
        <Pressable
          testID={`loop-toggle-${item.id}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.status === 'done' }}
          accessibilityLabel={`${item.status === 'done' ? 'Reopen' : 'Complete'} ${item.content}`}
          onPress={() => patch.mutate({ id: item.id, status: item.status === 'done' ? 'open' : 'done' })}
          style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: overdue ? colors.danger : colors.ink, backgroundColor: item.status === 'done' ? colors.lime : overdue ? colors.blush : colors.paper, alignItems: 'center', justifyContent: 'center' }}
        >{item.status === 'done' ? <Check size={18} color={colors.ink} /> : overdue ? <AlertCircle size={17} color={colors.danger} /> : null}</Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text selectable style={{ ...mobileType.body, fontWeight: '700', color: colors.ink, textDecorationLine: item.status === 'done' ? 'line-through' : 'none' }}>{item.content}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <View testID={`loop-contact-avatar-${item.id}`} style={{ width: 25, height: 25, borderRadius: 13, backgroundColor: group ? colors.sky : colors.blush, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>{avatar ? <Image source={{ uri: avatar }} style={{ width: 25, height: 25 }} /> : group ? <UsersRound size={13} color={colors.neutral[600]} /> : <UserRound size={13} color={colors.neutral[600]} />}</View>
            <Text testID={`loop-contact-name-${item.id}`} selectable numberOfLines={1} style={{ ...mobileType.bodySmall, flex: 1, color: colors.neutral[600] }}>{name}</Text>
            {item.chat_id ? <MessageCircle size={14} color={colors.neutral[400]} /> : null}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {item.deadline ? <><Clock3 size={14} color={overdue ? colors.danger : colors.neutral[400]} /><Text style={{ ...mobileType.monoLabel, color: overdue ? colors.danger : colors.neutral[600] }}>{new Date(item.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View testID="loops-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
      <MobileHeader title="Loops" subtitle="Follow through without losing the conversation." safeArea actions={<MobileIconButton label="Add a loop" testID="loops-add" onPress={() => setShowCreate(true)}><Plus size={21} color={colors.ink} /></MobileIconButton>} />
      <View style={{ paddingHorizontal: space[4], gap: space[3], paddingBottom: space[3] }}>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View style={{ flex: 1, padding: space[4], borderRadius: radius.card, backgroundColor: colors.lime }}><Text style={{ ...mobileType.screenTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>{open.length}</Text><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>OPEN LOOPS</Text></View>
          <View style={{ flex: 1, padding: space[4], borderRadius: radius.card, backgroundColor: colors.sky }}><Text style={{ ...mobileType.screenTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>{today}</Text><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>DUE TODAY</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <MobileChip label="Open" active={filter === 'open'} count={open.length} onPress={() => setFilter('open')} testID="loops-tab-open" />
          <MobileChip label="Completed" active={filter === 'done'} onPress={() => setFilter('done')} testID="loops-tab-done" />
          <MobileChip label="I'm waiting" active={filter === 'waiting'} count={waiting.length} onPress={() => setFilter('waiting')} testID="loops-tab-waiting" />
        </View>
      </View>
      {query.isLoading ? <LoopsSkeleton /> : (
        <FlatList testID="loops-list" data={visible} renderItem={renderItem} keyExtractor={item => item.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 112 }} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.ink} />} ListEmptyComponent={<MobileState title={filter === 'done' ? 'Nothing completed yet' : filter === 'waiting' ? "You're not waiting on anyone" : 'No open loops'} message="Claire will surface commitments from your conversations here." />} />
      )}

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(16,18,15,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space[5], paddingBottom: 36, gap: space[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ ...mobileType.sectionTitle, flex: 1, color: colors.ink }}>Add a loop</Text><MobileIconButton label="Close" onPress={() => setShowCreate(false)}><X size={19} color={colors.ink} /></MobileIconButton></View>
            <TextInput autoFocus multiline value={newLoop} onChangeText={setNewLoop} placeholder="What do you want to remember?" placeholderTextColor={colors.neutral[400]} style={{ minHeight: 110, textAlignVertical: 'top', padding: space[4], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.cream, ...mobileType.body, color: colors.ink }} />
            {create.error ? <Text selectable style={{ ...mobileType.bodySmall, color: colors.danger }}>{create.error.message}</Text> : null}
            <Pressable
              disabled={!newLoop.trim() || create.isPending}
              onPress={() => create.mutate(newLoop.trim())}
              onPressIn={() => setAddLoopPressed(true)}
              onPressOut={() => setAddLoopPressed(false)}
              style={{
                minHeight: 50,
                borderRadius: radius.control,
                backgroundColor: colors.ink,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: !newLoop.trim() || create.isPending ? 0.42 : addLoopPressed ? 0.78 : 1,
              }}
            >
              <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.paper }}>{create.isPending ? 'Adding…' : 'Add loop'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
