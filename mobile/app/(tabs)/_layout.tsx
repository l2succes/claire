import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { colors } from '@claire/design-system';
import { ClaireTabBar } from '../../components/claire/tab-bar';
import { LiquidGlassTabs } from '../../components/claire/liquid-glass-tabs';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabase';

// 'custom' = floating Claire bar. 'liquid-glass' = system NativeTabs on iOS.
export const TAB_BAR_STYLE: 'custom' | 'liquid-glass' = 'custom';

function useOpenLoopCount() {
  const user = useAuthStore((state) => state.user);
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const fetch = async () => {
      const { count: nextCount } = await supabase
        .from('loops')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['pending', 'open']);
      if (!cancelled) setCount(nextCount ?? 0);
    };

    void fetch();
    const subscription = supabase
      .channel(`loops-badge-${user.id}-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loops', filter: `user_id=eq.${user.id}` }, () => void fetch())
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(subscription);
    };
  }, [user?.id]);

  return count;
}

export default function TabLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const openLoopCount = useOpenLoopCount();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  if (TAB_BAR_STYLE === 'liquid-glass' && Platform.OS === 'ios') {
    return <LiquidGlassTabs loopCount={openLoopCount} />;
  }

  return (
    <Tabs
      tabBar={(props) => <ClaireTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        sceneStyle: { backgroundColor: colors.cream },
        tabBarStyle: { position: 'absolute', backgroundColor: 'transparent', borderTopWidth: 0, elevation: 0 },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Home' }} />
      <Tabs.Screen name="messages" options={{ title: 'Inbox', sceneStyle: { backgroundColor: colors.paper } }} />
      <Tabs.Screen name="contacts" options={{ href: null }} />
      <Tabs.Screen name="ask-claire" options={{ title: 'Ask Claire' }} />
      <Tabs.Screen
        name="loops"
        options={{
          title: 'Loops',
          tabBarBadge: openLoopCount && openLoopCount > 0 ? (openLoopCount > 99 ? '99+' : openLoopCount) : undefined,
        }}
      />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
