import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { useAuthStore } from '../stores/authStore';
import { saveHandoff } from '../services/handoffs';

/** Persists compact route context across installations without treating it as
 * a second navigation state. Draft-specific callers use saveHandoff directly. */
export function useWorkspaceHandoff(): void {
  const pathname = usePathname();
  const token = useAuthStore((state) => state.token);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ token: string; route: string } | null>(null);

  useEffect(() => {
    if (!token || !pathname) return;
    const context = { token, route: pathname };
    latest.current = context;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void saveHandoff(context.token, 'workspace', { route: context.route }).catch(() => undefined); }, 650);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [pathname, token]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && latest.current) void saveHandoff(latest.current.token, 'workspace', { route: latest.current.route }).catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);
}
