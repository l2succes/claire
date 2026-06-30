import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { router } from 'expo-router';
import { CheckCircle, Clock, AlertCircle, BellOff, MessageCircle } from 'lucide-react-native';
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
}

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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PromisesScreen() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('open');
  const [refreshing, setRefreshing] = useState(false);

  const { data: promises = [], isLoading, refetch } = useQuery<DbPromise[]>({
    queryKey: ['promises', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('promises')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const completeMutation = useMutation({
    mutationFn: async (promiseId: string) => {
      const { error } = await supabase
        .from('promises')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', promiseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promises', user?.id] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async (promiseId: string) => {
      const snoozedUntil = new Date(Date.now() + 86_400_000).toISOString();
      const { error } = await supabase
        .from('promises')
        .update({ deadline: snoozedUntil })
        .eq('id', promiseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promises', user?.id] });
    },
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

    return (
      <View
        testID={`promise-item-${item.id}`}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          marginHorizontal: 16,
          marginBottom: 10,
          padding: 14,
          borderLeftWidth: 3,
          borderLeftColor: isDone ? '#d1d5db' : isItemOverdue ? '#ef4444' : priorityColor,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
          elevation: 1,
          opacity: isDone ? 0.6 : 1,
        }}
      >
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
          {item.contact_name ? (
            <Text style={{ fontSize: 12, color: '#9ca3af' }}>· {item.contact_name}</Text>
          ) : null}
          {item.platform ? (
            <Text style={{ fontSize: 11, color: '#c4b5fd', textTransform: 'capitalize' }}>
              {item.platform}
            </Text>
          ) : null}
        </View>

        {!isDone && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              testID={`promise-complete-${item.id}`}
              onPress={() => completeMutation.mutate(item.id)}
              disabled={completeMutation.isPending}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
                paddingVertical: 7,
                borderRadius: 8,
                backgroundColor: '#10b981',
              }}
            >
              <CheckCircle size={14} color="#ffffff" />
              <Text style={{ color: '#ffffff', fontSize: 13, fontWeight: '600' }}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID={`promise-snooze-${item.id}`}
              onPress={() => snoozeMutation.mutate(item.id)}
              disabled={snoozeMutation.isPending}
              style={{
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: '#f3f4f6',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <BellOff size={14} color="#6b7280" />
              <Text style={{ color: '#6b7280', fontSize: 13 }}>Snooze</Text>
            </TouchableOpacity>

            {item.chat_id ? (
              <TouchableOpacity
                testID={`promise-source-${item.id}`}
                onPress={() =>
                  router.push({
                    pathname: '/chat/[chatId]',
                    params: { chatId: item.chat_id!, platform: item.platform ?? '' },
                  })
                }
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: '#f3f4f6',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MessageCircle size={14} color="#6b7280" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
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
