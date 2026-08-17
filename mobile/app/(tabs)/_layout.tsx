import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { colors } from '@claire/design-system';
import { ClaireTabBar } from '../../components/claire/tab-bar';
import { MoreSheet } from '../../features/more/more-sheet';
import { useMoreSheet } from '../../hooks/useMoreSheet';
import { LiquidGlassTabs } from '../../components/claire/liquid-glass-tabs';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../services/supabase';

// 'custom' = floating Claire bar. 'liquid-glass' = system NativeTabs on iOS.
export const TAB_BAR_STYLE: 'custom' | 'liquid-glass' = 'custom';

function useOpenPromiseCount() {
  const user = useAuthStore((state) => state.user);
  const [count, setCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const fetch = async () => {
      const { count: nextCount } = await supabase
        .from('promises')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['pending', 'open']);
      if (!cancelled) setCount(nextCount ?? 0);
    };

    void fetch();
    const subscription = supabase
      .channel(`promises-badge-${user.id}-${Math.random().toString(36).slice(2, 10)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promises', filter: `user_id=eq.${user.id}` }, () => void fetch())
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
  const openPromiseCount = useOpenPromiseCount();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  if (TAB_BAR_STYLE === 'liquid-glass' && Platform.OS === 'ios') {
    return <LiquidGlassTabs promiseCount={openPromiseCount} />;
  }

  return (
    <>
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
        name="promises"
        options={{
          title: 'Loops',
          tabBarBadge: openPromiseCount && openPromiseCount > 0 ? (openPromiseCount > 99 ? '99+' : openPromiseCount) : undefined,
        }}
      />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen
        name="more"
        options={{ title: 'More' }}
        listeners={{
          // More is an action, not a destination: swallow the navigation and
          // raise the sheet over whichever tab is showing. Removing this
          // listener restores the previous full-screen More route.
          tabPress: (event) => {
            event.preventDefault();
            useMoreSheet.getState().open();
          },
        }}
      />
    </Tabs>
    {/* Mounted beside the navigator, not inside a screen, so it can open over
        whichever tab is currently showing. */}
    <MoreSheet />
    </>
  );
}
