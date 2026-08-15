import { Tabs, Redirect } from 'expo-router';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import {
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  EllipsisHorizontalIcon,
  HomeIcon,
  SparklesIcon,
} from 'react-native-heroicons/outline';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabase';
import { colors } from '@claire/design-system';

function useOpenPromiseCount() {
  const user = useAuthStore((s) => s.user);
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const fetch = async () => {
      const { count: nextCount } = await supabase.from('promises').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['pending', 'open']);
      if (!cancelled) setCount(nextCount ?? 0);
    };
    void fetch();
    const subscription = supabase.channel(`promises-badge-${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'promises', filter: `user_id=eq.${user.id}` }, fetch).subscribe();
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [user?.id]);
  return count;
}

function AskClaireTabButton({ accessibilityState, onLongPress, onPress, testID }: BottomTabBarButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Ask Claire" accessibilityHint="Ask a question across your connected conversations" accessibilityState={accessibilityState} hitSlop={8} testID={testID} onLongPress={(event) => onLongPress?.(event)} onPress={(event) => onPress?.(event)} style={({ pressed }) => ({ flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.78 : 1 })}><View pointerEvents="none" style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.lime, boxShadow: '0 5px 14px rgba(223,255,100,0.38)' }}><SparklesIcon size={23} color={colors.ink} strokeWidth={2} /></View></Pressable>;
}

export default function WebTabLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { bottom } = useSafeAreaInsets();
  const openPromiseCount = useOpenPromiseCount();
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;
  return <Tabs screenOptions={{ tabBarActiveTintColor: colors.ink, tabBarInactiveTintColor: colors.neutral[400], tabBarStyle: { position: 'absolute', left: 18, right: 18, bottom: Math.max(bottom, 8), backgroundColor: colors.paper, borderTopColor: colors.neutral[200], borderColor: colors.neutral[200], borderTopWidth: 1, borderWidth: 1, borderRadius: 22, paddingBottom: 0, paddingTop: 0, height: 64, boxShadow: '0 8px 25px rgba(16,18,15,0.10)' }, tabBarShowLabel: false, tabBarItemStyle: { flex: 1, height: 64, padding: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, tabBarIconStyle: { margin: 0 }, headerShown: false, sceneStyle: { backgroundColor: colors.cream } }}>
    <Tabs.Screen name="dashboard" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <HomeIcon size={Math.max(size, 24)} color={color} strokeWidth={1.7} /> }} />
    <Tabs.Screen name="messages" options={{ title: 'Inbox', tabBarIcon: ({ color, size }) => <ChatBubbleLeftRightIcon size={Math.max(size, 24)} color={color} strokeWidth={1.7} /> }} />
    <Tabs.Screen name="contacts" options={{ href: null }} />
    <Tabs.Screen name="ask-claire" options={{ title: 'Ask Claire', tabBarButton: (props) => <AskClaireTabButton {...props} /> }} />
    <Tabs.Screen name="promises" options={{ title: 'Promises', tabBarIcon: ({ color, size }) => <CheckBadgeIcon size={Math.max(size, 24)} color={color} strokeWidth={1.7} />, tabBarBadge: openPromiseCount && openPromiseCount > 0 ? openPromiseCount : undefined, tabBarBadgeStyle: { fontSize: 10 } }} />
    <Tabs.Screen name="search" options={{ href: null }} />
    <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <EllipsisHorizontalIcon size={Math.max(size, 25)} color={color} strokeWidth={1.8} /> }} />
    <Tabs.Screen name="settings" options={{ href: null }} />
  </Tabs>;
}
