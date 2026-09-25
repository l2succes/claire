import { API_BASE_URL } from './platforms';

/** Notify the API about a newly created Supabase account. The server verifies it. */
export function reportNewSignup(userId: string): void {
  void fetch(`${API_BASE_URL}/auth/notify-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  }).catch(() => undefined);
}
