import { useCallback, useRef, useState } from 'react';
import { startInstagramMobileLogin } from '../../modules/instagram-login';
import { API_BASE_URL } from '../../services/platforms';
import { supabase } from '../../services/supabase';
import { usePlatformStore } from '../../stores/platformStore';

export function useInstagramMobileLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const running = useRef(false);
  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setError('Sign in to Claire again to connect Instagram.'); return; }
      const result = await startInstagramMobileLogin(API_BASE_URL, data.session.access_token);
      if (result.success) {
        setAuthenticated(true);
        await usePlatformStore.getState().fetchConnectedSessions();
      }
      else if (!result.cancelled) setError(result.error || 'Instagram could not connect. Try again.');
    } catch {
      setError('Instagram sign-in could not open. Try again.');
    } finally {
      running.current = false; setBusy(false);
    }
  }, []);
  return { start, busy, error, authenticated };
}
