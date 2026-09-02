import { supabase } from './supabase';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export interface WorkspaceProfile {
  id: string;
  name: string;
  color: string;
  is_personal: boolean;
  sort_order: number;
  created_at: string;
  unreadCount: number;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => ({})) as { data?: T; error?: string };
  if (!response.ok) throw new Error(body.error || 'Profile request failed');
  return body.data as T;
}

export const profilesApi = {
  list: () => request<WorkspaceProfile[]>('/profiles'),
  create: (name: string, color: string) => request<WorkspaceProfile>('/profiles', { method: 'POST', body: JSON.stringify({ name, color }) }),
  update: (profileId: string, values: Partial<Pick<WorkspaceProfile, 'name' | 'color'>> & { sortOrder?: number }) => request<WorkspaceProfile>(`/profiles/${profileId}`, { method: 'PATCH', body: JSON.stringify(values) }),
  remove: (profileId: string) => request<void>(`/profiles/${profileId}`, { method: 'DELETE' }),
  moveSession: (profileId: string, sessionId: string) => request<void>(`/profiles/${profileId}/move-session`, { method: 'POST', body: JSON.stringify({ sessionId }) }),
};
