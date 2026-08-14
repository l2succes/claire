import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { router } from 'expo-router';
import { CheckCircle, Clock, AlertCircle, MessageCircle, User, Users } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PromiseStatus = 'pending' | 'completed' | 'cancelled' | 'overdue';

interface DbPromise {
  id: string;
  content: string;
  type: 'commitment' | 'deadline' | 'appointment' | 'task';
  deadline?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: PromiseStatus;
  from_me: boolean;
  chat_id?: string | null;
  message_id?: string | null;
  created_at: string;
  // Extra fields from mock e2e fixtures (optional)
  promise_text?: string;
  due_date?: string;
  contact_name?: string;
  platform?: string;
  contact?: {
    name?: string | null;
    inferred_name?: string | null;
    avatar_url?: string | null;
  } | null;
  chat?: {
    name?: string | null;
    is_group?: boolean | null;
    platform?: string | null;
    contact?: {
      name?: string | null;
      inferred_name?: string | null;
      avatar_url?: string | null;
    } | null;
  } | null;
}

type SourceMessage = Pick<DbPromise, 'chat_id' | 'contact_name' | 'platform' | 'contact' | 'chat'> & {
  id: string;
};

type TabKey = 'open' | 'done' | 'overdue';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOverdue(p: DbPromise): boolean {
  const deadline = p.deadline ?? p.due_date;
  if (!deadline) return false;
  return new Date(deadline) < new Date() && p.status !== 'completed' && p.status !== 'cancelled';
}

function statusTab(p: DbPromise): TabKey {
  if (p.status === 'completed') return 'done';
  if (p.status === 'overdue' || isOverdue(p)) return 'overdue';
  return 'open';
}

function formatDeadline(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  if (diffDays > 0 && diffDays < 7) return `in ${diffDays}d`;
  if (diffDays < 0) return `${Math.abs(diffDays)}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const PRIORITY_COLOR: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#10b981',
};

const TAB_LABELS: Record<TabKey, string> = {
  open: 'Open',
  done: 'Done',
  overdue: 'Overdue',
};

function displayConversation(promise: DbPromise) {
  const contact = promise.contact ?? promise.chat?.contact;
  return promise.chat?.name
    || contact?.name
    || contact?.inferred_name
    || promise.contact_name
    || 'Conversation';
}

function conversationAvatar(promise: DbPromise) {
  return promise.contact?.avatar_url ?? promise.chat?.contact?.avatar_url ?? null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PromisesScreen() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const [refreshing, setRefreshing] = useState(false);

  const { data: promises = [], isLoading, refetch } = useQuery<DbPromise[]>({
    queryKey: ['promises', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('promises')
        .select(`
          *,
          contact:contacts!promises_contact_id_fkey(name, inferred_name, avatar_url),
          chat:chats!promises_chat_id_fkey(
            name, is_group, platform,
            contact:contacts!chats_contact_id_fkey(name, inferred_name, avatar_url)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const promiseRows = (data ?? []) as DbPromise[];
      const messageIds = [...new Set(
        promiseRows
          .map((promise) => promise.message_id)
          .filter((messageId): messageId is string => Boolean(messageId))
      )];
      if (messageIds.length === 0) return promiseRows;

      // Legacy promise rows predate the source-conversation linkage. Resolve
      // their source message on read so the UI has a useful person/chat name
      // immediately, even before the server-side backfill has run.
      const { data: sourceRows, error: sourceError } = await supabase
        .from('messages')
        .select(`
          id, chat_id, contact_name, platform,
          contact:contacts!messages_contact_id_fkey(name, inferred_name, avatar_url),
          chat:chats!messages_chat_id_fkey(
            name, is_group, platform,
            contact:contacts!chats_contact_id_fkey(name, inferred_name, avatar_url)
          )
        `)
        .eq('user_id', user.id)
        .in('id', messageIds);
      if (sourceError) throw sourceError;

      const sourcesByMessageId = new Map(
        ((sourceRows ?? []) as SourceMessage[]).map((source) => [source.id, source])
      );
      return promiseRows.map((promise) => {
        const source = promise.message_id ? sourcesByMessageId.get(promise.message_id) : undefined;
        if (!source) return promise;
        return {
          ...promise,
          chat_id: promise.chat_id ?? source.chat_id,
          contact_name: promise.contact_name ?? source.contact_name,
          platform: source.platform ?? promise.platform,
          // The source is more reliable for legacy rows whose relationships
          // are missing or point at an old contact record.
          contact: source.contact ?? source.chat?.contact ?? promise.contact ?? promise.chat?.contact ?? null,
          chat: source.chat ?? promise.chat ?? null,
        };
      });
    },
    enabled: !!user?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const tabItems = promises.filter((p) => statusTab(p) === activeTab);
  const openCount = promises.filter((p) => statusTab(p) === 'open').length;
  const overdueCount = promises.filter((p) => statusTab(p) === 'overdue').length;

  const renderItem = ({ item }: { item: DbPromise }) => {
    const text = item.promise_text ?? item.content;
    const deadline = item.due_date ?? item.deadline;
    const deadlineLabel = formatDeadline(deadline);
    const isDone = item.status === 'completed';
    const isItemOverdue = statusTab(item) === 'overdue';
    const priorityColor = PRIORITY_COLOR[item.priority] ?? '#6b7280';
    const conversationName = displayConversation(item);
    const avatarUrl = conversationAvatar(item);
    const isGroup = item.chat?.is_group ?? false;

    const openConversation = () => {
      if (!item.chat_id) return;
      router.push({
        pathname: '/chat/[chatId]',
        params: {
          chatId: item.chat_id,
          contact_name: isGroup ? '' : conversationName,
          chat_name: conversationName,
          platform: item.platform ?? item.chat?.platform ?? '',
          is_group: isGroup ? '1' : '0',
        },
      });
    };

    return (
      <TouchableOpacity
        testID={`promise-item-${item.id}`}
        onPress={openConversation}
        disabled={!item.chat_id}
        activeOpacity={item.chat_id ? 0.72 : 1}
        accessibilityRole={item.chat_id ? 'button' : undefined}
        accessibilityLabel={item.chat_id ? `Reply to ${conversationName} about ${text}` : undefined}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 14,
          borderLeftWidth: 3,
          borderLeftColor: isDone ? '#d1d5db' : isItemOverdue ? '#ef4444' : priorityColor,
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          opacity: isDone ? 0.6 : 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {avatarUrl ? (
            <Image
              testID={`promise-contact-avatar-${item.id}`}
              source={{ uri: avatarUrl }}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#e5e7eb' }}
              accessibilityLabel={`${conversationName} profile photo`}
            />
          ) : (
            <View
              testID={`promise-contact-avatar-${item.id}`}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' }}
              accessibilityLabel={`${conversationName} profile placeholder`}
            >
              {isGroup ? <Users size={18} color="#6366f1" /> : <User size={18} color="#6366f1" />}
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text selectable style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} numberOfLines={1} testID={`promise-contact-name-${item.id}`}>
              {conversationName}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {item.platform ? (
                <Text selectable style={{ fontSize: 11, color: '#8b5cf6', textTransform: 'capitalize' }}>
                  {item.platform}
                </Text>
              ) : null}
              {item.chat_id ? <MessageCircle size={12} color="#9ca3af" /> : null}
            </View>
          </View>
          {item.chat_id ? <Text style={{ fontSize: 12, fontWeight: '600', color: '#4f46e5' }}>Reply</Text> : null}
        </View>

        <Text
          style={{
            fontSize: 15,
            color: isDone ? '#6b7280' : '#111827',
            fontWeight: '500',
            lineHeight: 21,
            textDecorationLine: isDone ? 'line-through' : 'none',
            marginBottom: 6,
          }}
          numberOfLines={3}
        >
          {text}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {deadlineLabel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Clock size={12} color={isItemOverdue ? '#ef4444' : '#9ca3af'} />
              <Text style={{ fontSize: 12, color: isItemOverdue ? '#ef4444' : '#9ca3af' }}>
                {deadlineLabel}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#f9fafb' }} testID="promises-screen">
      <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: '#111827' }}>Promises</Text>
        {overdueCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <AlertCircle size={14} color="#ef4444" />
            <Text style={{ fontSize: 13, color: '#ef4444' }}>
              {overdueCount} overdue
            </Text>
          </View>
        )}
      </View>

      <View style={{
        flexDirection: 'row',
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: '#f3f4f6',
        borderRadius: 10,
        padding: 3,
      }}>
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => {
          const count = tab === 'open' ? openCount : tab === 'overdue' ? overdueCount : undefined;
          return (
            <TouchableOpacity
              key={tab}
              testID={`promises-tab-${tab}`}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 7,
                borderRadius: 8,
                backgroundColor: activeTab === tab ? '#ffffff' : 'transparent',
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: activeTab === tab ? '600' : '400',
                color: activeTab === tab ? '#111827' : '#6b7280',
              }}>
                {TAB_LABELS[tab]}{count !== undefined && count > 0 ? ` (${count})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#10b981" />
        </View>
      ) : (
        <FlatList
          testID="promises-list"
          data={tabItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
          }
          ListEmptyComponent={
            <View testID="promises-empty" style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 }}>
              <CheckCircle size={48} color="#d1d5db" />
              <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '600', color: '#6b7280' }}>
                {activeTab === 'done' ? 'No completed promises yet' :
                 activeTab === 'overdue' ? 'Nothing overdue' :
                 'No open promises'}
              </Text>
              {activeTab === 'open' ? (
                <Text style={{ marginTop: 8, fontSize: 14, color: '#9ca3af', textAlign: 'center' }}>
                  Promises detected in your conversations will appear here.
                </Text>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}
