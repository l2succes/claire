import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const openPromiseCount = useOpenPromiseCount();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <NativeTabs tintColor="#10120F" minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="dashboard" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label hidden>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf={{ default: 'message', selected: 'message.fill' }} md="chat" />
        <NativeTabs.Trigger.Label hidden>Inbox</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ask-claire" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkles', selected: 'sparkles' }} md="auto_awesome" />
        <NativeTabs.Trigger.Label hidden>Ask Claire</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="promises" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.seal', selected: 'checkmark.seal.fill' }} md="verified" />
        <NativeTabs.Trigger.Label hidden>Promises</NativeTabs.Trigger.Label>
        {openPromiseCount && openPromiseCount > 0 ? <NativeTabs.Trigger.Badge>{openPromiseCount > 99 ? '99+' : String(openPromiseCount)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more" role="more" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf="ellipsis" md="more_horiz" />
        <NativeTabs.Trigger.Label hidden>More</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
