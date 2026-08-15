import { Tabs, Redirect } from 'expo-router';
import {
  Home,
  MessageCircle,
  CheckCircle2,
  Search,
} from 'lucide-react-native';
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
      const { count: c } = await supabase
        .from('promises')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['pending', 'open']);
      if (!cancelled) setCount(c ?? 0);
    };

    fetch();

    const sub = supabase
      .channel(`promises-badge-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promises', filter: `user_id=eq.${user.id}` }, () => fetch())
      .subscribe();

    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [user?.id]);

  return count;
}

export default function TabLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { bottom } = useSafeAreaInsets();
  const openPromiseCount = useOpenPromiseCount();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.neutral[400],
        tabBarStyle: {
          position: 'absolute',
          left: 10,
          right: 10,
          bottom: Math.max(bottom, 8),
          backgroundColor: colors.paper,
          borderTopColor: colors.neutral[200],
          borderColor: colors.neutral[200],
          borderTopWidth: 1,
          borderWidth: 1,
          borderRadius: 22,
          paddingBottom: 4,
          paddingTop: 6,
          height: 64,
          boxShadow: '0 8px 25px rgba(16,18,15,0.10)',
        },
        tabBarItemStyle: { borderRadius: 16 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        headerShown: false,
        sceneStyle: { backgroundColor: colors.cream },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Home size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="promises"
        options={{
          title: 'Promises',
          tabBarIcon: ({ color, size }) => (
            <CheckCircle2 size={size} color={color} />
          ),
          tabBarBadge: openPromiseCount && openPromiseCount > 0 ? openPromiseCount : undefined,
          tabBarBadgeStyle: { fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Search size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
