import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { AlertCircle, Check, Clock3, MessageCircle, Plus, UserRound, UsersRound, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileChip, MobileHeader, MobileIconButton, MobileState } from '../../components/mobile/claire-mobile';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';

type PromiseFilter = 'open' | 'completed' | 'waiting';
interface PromiseItem {
  id: string;
  content: string;
  deadline?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed' | 'cancelled' | 'overdue';
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

function isOverdue(item: PromiseItem) {
  return item.status === 'overdue' || (!!item.deadline && new Date(item.deadline) < new Date() && item.status !== 'completed');
}

function conversationName(item: PromiseItem) {
  return item.chat?.name || item.contact?.name || item.contact?.inferred_name || item.chat?.contact?.name || item.chat?.contact?.inferred_name || item.contact_name || 'Personal reminder';
}

export function PromisesScreen() {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<PromiseFilter>('open');
  const [showCreate, setShowCreate] = useState(false);
  const [newPromise, setNewPromise] = useState('');
  const query = useQuery({ queryKey: ['mobile-promises', user?.id], enabled: !!user?.id, queryFn: () => request<PromiseItem[]>('/promises?limit=200'), staleTime: 60_000 });
  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PromiseItem['status'] }) => request<PromiseItem>(`/promises/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mobile-promises', user?.id] }),
  });
  const create = useMutation({
    mutationFn: (content: string) => request<PromiseItem>('/promises', { method: 'POST', body: JSON.stringify({ content, priority: 'medium' }) }),
    onSuccess: () => { setNewPromise(''); setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['mobile-promises', user?.id] }); },
  });

  const items = query.data ?? [];
  const open = items.filter(item => ['pending', 'overdue'].includes(item.status));
  const completed = items.filter(item => item.status === 'completed');
  const waiting = open.filter(item => !item.from_me);
  const today = open.filter(item => item.deadline && new Date(item.deadline).toDateString() === new Date().toDateString()).length;
  const visible = filter === 'completed' ? completed : filter === 'waiting' ? waiting : open;

  const renderItem = ({ item }: { item: PromiseItem }) => {
    const name = conversationName(item);
    const avatar = item.contact?.avatar_url || item.chat?.contact?.avatar_url;
    const group = !!item.chat?.is_group;
    const overdue = isOverdue(item);
    return (
      <Pressable
        testID={`promise-item-${item.id}`}
        onPress={() => item.chat_id ? router.push({ pathname: '/chat/[chatId]', params: { chatId: item.chat_id, contact_name: group ? '' : name, chat_name: name, platform: item.platform || item.chat?.platform || '', is_group: group ? '1' : '0' } }) : undefined}
        accessibilityRole={item.chat_id ? 'button' : undefined}
        style={({ pressed }) => ({ flexDirection: 'row', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200], opacity: pressed ? 0.65 : 1 })}
      >
        <Pressable
          testID={`promise-toggle-${item.id}`}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.status === 'completed' }}
          accessibilityLabel={`${item.status === 'completed' ? 'Reopen' : 'Complete'} ${item.content}`}
          onPress={() => patch.mutate({ id: item.id, status: item.status === 'completed' ? 'pending' : 'completed' })}
          style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: overdue ? colors.danger : colors.ink, backgroundColor: item.status === 'completed' ? colors.lime : overdue ? colors.blush : colors.paper, alignItems: 'center', justifyContent: 'center' }}
        >{item.status === 'completed' ? <Check size={18} color={colors.ink} /> : overdue ? <AlertCircle size={17} color={colors.danger} /> : null}</Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text selectable style={{ ...mobileType.body, fontWeight: '700', color: colors.ink, textDecorationLine: item.status === 'completed' ? 'line-through' : 'none' }}>{item.content}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <View style={{ width: 25, height: 25, borderRadius: 13, backgroundColor: group ? colors.sky : colors.blush, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>{avatar ? <Image source={{ uri: avatar }} style={{ width: 25, height: 25 }} /> : group ? <UsersRound size={13} color={colors.neutral[600]} /> : <UserRound size={13} color={colors.neutral[600]} />}</View>
            <Text selectable numberOfLines={1} style={{ ...mobileType.bodySmall, flex: 1, color: colors.neutral[600] }}>{name}</Text>
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
    <View testID="promises-screen" style={{ flex: 1, backgroundColor: colors.cream }}>
      <MobileHeader title="Promises" subtitle="Follow through without losing the conversation." safeArea actions={<MobileIconButton label="Add promise" testID="promises-add" onPress={() => setShowCreate(true)}><Plus size={21} color={colors.ink} /></MobileIconButton>} />
      <View style={{ paddingHorizontal: space[4], gap: space[3], paddingBottom: space[3] }}>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View style={{ flex: 1, padding: space[4], borderRadius: radius.card, backgroundColor: colors.lime }}><Text style={{ ...mobileType.screenTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>{open.length}</Text><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>OPEN PROMISES</Text></View>
          <View style={{ flex: 1, padding: space[4], borderRadius: radius.card, backgroundColor: colors.sky }}><Text style={{ ...mobileType.screenTitle, color: colors.ink, fontVariant: ['tabular-nums'] }}>{today}</Text><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>DUE TODAY</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <MobileChip label="Open" active={filter === 'open'} count={open.length} onPress={() => setFilter('open')} testID="promises-tab-open" />
          <MobileChip label="Completed" active={filter === 'completed'} onPress={() => setFilter('completed')} testID="promises-tab-done" />
          <MobileChip label="I'm waiting" active={filter === 'waiting'} count={waiting.length} onPress={() => setFilter('waiting')} testID="promises-tab-overdue" />
        </View>
      </View>
      {query.isLoading ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.ink} /></View> : (
        <FlatList testID="promises-list" data={visible} renderItem={renderItem} keyExtractor={item => item.id} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 112 }} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.ink} />} ListEmptyComponent={<MobileState title={filter === 'completed' ? 'Nothing completed yet' : filter === 'waiting' ? "You're not waiting on anyone" : 'No open promises'} message="Claire will surface commitments from your conversations here." />} />
      )}

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(16,18,15,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space[5], paddingBottom: 36, gap: space[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ ...mobileType.sectionTitle, flex: 1, color: colors.ink }}>Add a promise</Text><MobileIconButton label="Close" onPress={() => setShowCreate(false)}><X size={19} color={colors.ink} /></MobileIconButton></View>
            <TextInput autoFocus multiline value={newPromise} onChangeText={setNewPromise} placeholder="What do you want to remember?" placeholderTextColor={colors.neutral[400]} style={{ minHeight: 110, textAlignVertical: 'top', padding: space[4], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.cream, ...mobileType.body, color: colors.ink }} />
            {create.error ? <Text selectable style={{ ...mobileType.bodySmall, color: colors.danger }}>{create.error.message}</Text> : null}
            <Pressable disabled={!newPromise.trim() || create.isPending} onPress={() => create.mutate(newPromise.trim())} style={({ pressed }) => ({ minHeight: 50, borderRadius: radius.control, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: !newPromise.trim() || create.isPending ? 0.42 : pressed ? 0.78 : 1 })}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.paper }}>{create.isPending ? 'Adding…' : 'Add promise'}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
