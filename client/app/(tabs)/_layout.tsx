import { Tabs, Redirect } from 'expo-router';
import {
  MessageCircle,
  CheckSquare,
  Settings,
  Users,
} from 'lucide-react-native';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabase';

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
  const colorScheme = useColorScheme();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isDark = colorScheme === 'dark';
  const { bottom } = useSafeAreaInsets();
  const openPromiseCount = useOpenPromiseCount();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  const activeColor = isDark ? '#818cf8' : '#6366f1';
  const inactiveColor = isDark ? '#6b7280' : '#9ca3af';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        tabBarStyle: {
          backgroundColor: isDark ? '#111827' : '#ffffff',
          borderTopColor: isDark ? '#1f2937' : '#e5e7eb',
          borderTopWidth: 1,
          paddingBottom: bottom + 5,
          paddingTop: 5,
          height: 60 + bottom,
        },
        headerStyle: {
          backgroundColor: isDark ? '#111827' : '#ffffff',
        },
        headerTintColor: isDark ? '#f3f4f6' : '#111827',
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <MessageCircle size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="contacts"
        options={{
          title: 'Contacts',
          tabBarIcon: ({ color, size }) => (
            <Users size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="promises"
        options={{
          title: 'Promises',
          tabBarIcon: ({ color, size }) => (
            <CheckSquare size={size} color={color} />
          ),
          tabBarBadge: openPromiseCount && openPromiseCount > 0 ? openPromiseCount : undefined,
          tabBarBadgeStyle: { fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Settings size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}