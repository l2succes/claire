import { platformsApi } from '../services/platforms';
import { Platform, PlatformStatus, type PlatformSession } from '../types/platform';

describe('platformsApi.getAllSessions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects when a platform status cannot be verified', async () => {
    jest.spyOn(platformsApi, 'getPlatformStatus').mockImplementation(async (platform) => {
      if (platform === Platform.TELEGRAM) throw new Error('unauthorized');
      return [];
    });

    await expect(platformsApi.getAllSessions()).rejects.toThrow('unauthorized');
  });

  it('deduplicates sessions after every status request succeeds', async () => {
    const session = {
      id: 'shared-session',
      platform: Platform.WHATSAPP,
      status: PlatformStatus.CONNECTED,
    } as PlatformSession;
    jest.spyOn(platformsApi, 'getPlatformStatus').mockResolvedValue([session]);

    await expect(platformsApi.getAllSessions()).resolves.toEqual([session]);
  });
});
