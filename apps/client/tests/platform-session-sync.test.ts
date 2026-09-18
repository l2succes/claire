import { platformsApi } from '../services/platforms';
import { usePlatformStore } from '../stores/platformStore';
import { Platform, PlatformStatus, type PlatformSession } from '../types/platform';

const connectedSession = {
  id: 'wa-connected',
  platform: Platform.WHATSAPP,
  status: PlatformStatus.CONNECTED,
} as PlatformSession;

describe('platform session reconciliation', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    usePlatformStore.setState({
      connectedSessions: [connectedSession],
      sessionSyncStatus: 'idle',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not turn a transient fetch failure into a false disconnect', async () => {
    jest.spyOn(platformsApi, 'getAllSessions').mockRejectedValueOnce(new Error('network unavailable'));

    const sessions = await usePlatformStore.getState().fetchConnectedSessions();

    expect(sessions).toEqual([connectedSession]);
    expect(usePlatformStore.getState().connectedSessions).toEqual([connectedSession]);
    expect(usePlatformStore.getState().sessionSyncStatus).toBe('unavailable');
  });

  it('accepts a successful empty response as authoritative', async () => {
    jest.spyOn(platformsApi, 'getAllSessions').mockResolvedValueOnce([]);

    await usePlatformStore.getState().fetchConnectedSessions();

    expect(usePlatformStore.getState().connectedSessions).toEqual([]);
    expect(usePlatformStore.getState().sessionSyncStatus).toBe('ready');
  });
});
