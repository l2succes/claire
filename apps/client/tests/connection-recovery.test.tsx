import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useConnectionRecovery } from '../hooks/useConnectionRecovery';
import { useAuthStore } from '../stores/authStore';
import { usePlatformStore } from '../stores/platformStore';
import { platformsApi } from '../services/platforms';
import { requestConnectionRecovery } from '../services/connection-recovery-signal';
import { getChatOutbox } from '../services/chat-outbox';
import { Platform, PlatformStatus } from '../types/platform';

jest.mock('../services/platforms', () => ({ platformsApi: {
  getAllSessions: jest.fn(), recoverPlatform: jest.fn(),
} }));
jest.mock('../stores/authStore', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  return { useAuthStore: create(() => ({ user: { id: 'test-user' }, token: 'test-token' })) };
});
jest.mock('../services/chat-outbox', () => {
  const { create } = jest.requireActual<typeof import('zustand')>('zustand');
  const queue = { entries: [], hydrate: jest.fn(async () => undefined), flush: jest.fn(async () => undefined) };
  return { getChatOutbox: () => queue, showOutboxEvent: jest.fn(), resetChatOutbox: jest.fn(),
    useChatOutbox: create(() => ({ entries: [], attentionPlatforms: [] })) };
});

const api = platformsApi as jest.Mocked<typeof platformsApi>;
const tick = async (ms = 0) => { await act(async () => { await jest.advanceTimersByTimeAsync(ms); }); };

describe('background connection recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    useAuthStore.setState({ user: { id: 'test-user' } as any, token: 'test-token' });
    usePlatformStore.setState({ connectedSessions: [], sessionSyncStatus: 'idle' });
    api.getAllSessions.mockResolvedValue([]);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('wakes immediately when a request or realtime socket detects failure', async () => {
    const { unmount } = renderHook(useConnectionRecovery);
    await tick();
    expect(api.getAllSessions).toHaveBeenCalledTimes(1);
    act(() => requestConnectionRecovery());
    await tick();
    expect(api.getAllSessions).toHaveBeenCalledTimes(2);
    expect(getChatOutbox('test-user').flush).toHaveBeenCalledTimes(2);
    unmount();
  });
  it('retries once immediately then backs off, without overlapping requests', async () => {
    api.getAllSessions.mockRejectedValue(new Error('offline'));
    const { unmount } = renderHook(useConnectionRecovery);
    await tick(1);
    expect(api.getAllSessions).toHaveBeenCalledTimes(2);
    await tick(999);
    expect(api.getAllSessions).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(api.getAllSessions).toHaveBeenCalledTimes(3);
    unmount();
    await tick(30_000);
    expect(api.getAllSessions).toHaveBeenCalledTimes(3);
  });
  it('recovers an existing linked session but never starts pairing', async () => {
    const session = { id: 'linked', platform: Platform.WHATSAPP, status: PlatformStatus.RECONNECTING,
      lastConnectedAt: '2026-09-15T12:00:00Z' } as any;
    api.getAllSessions.mockResolvedValue([session]);
    api.recoverPlatform.mockResolvedValue({ session: { ...session, status: PlatformStatus.CONNECTED } });
    const { unmount } = renderHook(useConnectionRecovery);
    await tick();
    expect(api.recoverPlatform).toHaveBeenCalledWith(Platform.WHATSAPP, 'linked');
    expect(usePlatformStore.getState().connectedSessions[0].status).toBe('connected');
    unmount();
  });
  it('does not reconnect a deliberately disconnected or unpaired account', async () => {
    api.getAllSessions.mockResolvedValue([{ id: 'manual', platform: Platform.WHATSAPP, status: PlatformStatus.DISCONNECTED } as any]);
    const { unmount } = renderHook(useConnectionRecovery);
    await tick();
    expect(api.recoverPlatform).not.toHaveBeenCalled();
    unmount();
  });
});
