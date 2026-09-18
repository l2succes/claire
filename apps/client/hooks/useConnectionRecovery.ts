import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { usePlatformStore } from '../stores/platformStore';
import { PlatformRequestError } from '../services/api-errors';
import { platformsApi } from '../services/platforms';
import { getChatOutbox, showOutboxEvent, useChatOutbox, resetChatOutbox } from '../services/chat-outbox';
import { onConnectionRecovery } from '../services/connection-recovery-signal';

/** One worker for the signed-in app, independent of chat navigation. */
export function useConnectionRecovery() {
  const userId = useAuthStore((state) => state.user?.id);
  const token = useAuthStore((state) => state.token);
  useEffect(() => {
    if (!userId || !token) { resetChatOutbox(); return; }
    useChatOutbox.setState({ entries: [], attentionPlatforms: [] });
    let stopped = false;
    let running = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const queue = getChatOutbox(userId);
    const schedule = (delay: number) => {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(() => void run(), delay);
    };
    const run = async () => {
      if (running || stopped || AppState.currentState === 'background') return;
      running = true;
      try {
        await queue.hydrate();
        if (stopped) return;
        await usePlatformStore.getState().fetchConnectedSessions();
        if (stopped) return;
        const store = usePlatformStore.getState();
        if (store.sessionSyncStatus === 'ready') {
          useChatOutbox.setState((state) => ({ attentionPlatforms: state.attentionPlatforms.filter((platform) =>
            !store.connectedSessions.some((session) => session.platform === platform && session.status === 'connected')) }));
          for (const session of store.connectedSessions) {
            // Never resume a login attempt or an explicitly disconnected account.
            if (!session.lastConnectedAt || !['reconnecting', 'failed', 'disconnected'].includes(session.status)) continue;
            try {
              const response = await platformsApi.recoverPlatform(session.platform, session.id);
              if (stopped) return;
              usePlatformStore.setState((state) => ({ connectedSessions: state.connectedSessions.map((item) =>
                item.id === session.id ? response.session : item) }));
            } catch (error) {
              if (!stopped && error instanceof PlatformRequestError && error.status === 409) {
                useChatOutbox.setState((state) => ({ attentionPlatforms: [...new Set([...state.attentionPlatforms, session.platform])] }));
              }
            }
          }
          await queue.flush();
        }
        const pending = queue.entries.some((entry) => !entry.error);
        const unhealthy = usePlatformStore.getState().sessionSyncStatus !== 'ready'
          || usePlatformStore.getState().connectedSessions.some((session) => session.lastConnectedAt && session.status !== 'connected');
        failures = pending || unhealthy ? failures + 1 : 0;
      } catch { failures += 1; }
      finally {
        running = false;
        // Retry immediately on the first failure, then back off to 30 seconds.
        schedule(failures === 0 ? 15_000 : failures === 1 ? 0 : Math.min(30_000, 1000 * 2 ** Math.min(failures - 2, 5)));
      }
    };
    const wake = () => { if (!running) { failures = 0; schedule(0); } };
    const unsubscribe = onConnectionRecovery(wake);
    const unsubscribeOnline = onlineManager.subscribe((online) => { if (online) wake(); });
    const unsubscribeStore = usePlatformStore.subscribe((state, previous) => {
      if (state.connectedSessions !== previous.connectedSessions && !running) wake();
    });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') wake(); });
    void queue.hydrate().then(() => {
      if (!stopped) {
        useChatOutbox.setState({ entries: [...queue.entries] });
        queue.entries.forEach(showOutboxEvent);
      }
    }).catch(() => undefined);
    wake();
    return () => {
      stopped = true;
      clearTimeout(timer);
      unsubscribe(); unsubscribeOnline(); unsubscribeStore(); appState.remove();
    };
  }, [userId, token]);
}
