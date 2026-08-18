import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { host } from '@claire/host';
import { API_BASE_URL } from './platforms';

const INSTALLATION_KEY = 'claire.handoff.installation-id';
export type HandoffKind = 'chat_draft' | 'assistant_thread' | 'search' | 'workspace';
export type HandoffPayload = { route?: string; chatId?: string; draft?: string; assistantThreadId?: string; query?: string };
export type WorkspaceHandoff = { id: string; installation_id: string; source_platform: string; kind: HandoffKind; payload: HandoffPayload; updated_at: string; expires_at: string };

export async function installationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const next = `${host.name}-${Crypto.randomUUID()}`;
  await AsyncStorage.setItem(INSTALLATION_KEY, next);
  return next;
}

function sourcePlatform(): 'ios' | 'android' | 'web' | 'electron' {
  if (host.name === 'electron') return 'electron';
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

async function request(path: string, accessToken: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, ...init?.headers } });
}

export async function saveHandoff(accessToken: string, kind: HandoffKind, payload: HandoffPayload): Promise<void> {
  const response = await request('/handoffs/self', accessToken, { method: 'PUT', body: JSON.stringify({ installationId: await installationId(), sourcePlatform: sourcePlatform(), kind, payload }) });
  if (!response.ok) throw new Error('Could not save your handoff.');
}

export async function listHandoffs(accessToken: string): Promise<WorkspaceHandoff[]> {
  const response = await request('/handoffs', accessToken);
  if (!response.ok) throw new Error('Could not load your handoffs.');
  const body = await response.json() as { handoffs?: WorkspaceHandoff[] };
  return body.handoffs || [];
}

export async function removeHandoff(accessToken: string, id: string): Promise<void> {
  const response = await request(`/handoffs/${encodeURIComponent(id)}`, accessToken, { method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw new Error('Could not remove your handoff.');
}
