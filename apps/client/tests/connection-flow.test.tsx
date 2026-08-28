import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, Linking, type AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { platformsApi, pollAuthStatus } from '../services/platforms';
import { usePlatformStore } from '../stores/platformStore';
import { AuthMethod, Platform, PlatformStatus, type PlatformSession } from '../types/platform';
import { useConnectionFlow } from '../features/connections/use-connection-flow';
import { formatPairingCodeForDisplay } from '../features/connections/connection-formatters';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('../services/platforms', () => ({
  platformsApi: {
    getPlatformStatus: jest.fn(),
    getAuthData: jest.fn(),
    getAllSessions: jest.fn(),
    getAvailablePlatforms: jest.fn(),
    connectPlatform: jest.fn(),
    submitVerificationCode: jest.fn(),
    disconnectPlatform: jest.fn(),
    reconnectPlatform: jest.fn(),
  },
  pollAuthStatus: jest.fn(() => ({ stop: jest.fn() })),
}));

const pendingWhatsApp: PlatformSession = {
  id: 'wa-pending',
  platform: Platform.WHATSAPP,
  userId: 'user-1',
  status: PlatformStatus.AWAITING_AUTH,
  authMethod: AuthMethod.PAIRING_CODE,
  createdAt: '2026-08-27T12:00:00.000Z',
  authData: {
    method: AuthMethod.PAIRING_CODE,
    sessionId: 'wa-pending',
    pairingCode: 'ABCD-EFGH',
  },
};

const connectedWhatsApp: PlatformSession = {
  ...pendingWhatsApp,
  status: PlatformStatus.CONNECTED,
  platformUserId: '+15550001234',
};

const mockedApi = platformsApi as jest.Mocked<typeof platformsApi>;

describe('connection flow state', () => {
  beforeEach(() => {
    usePlatformStore.getState().reset();
    jest.clearAllMocks();
    mockedApi.getPlatformStatus.mockResolvedValue([pendingWhatsApp]);
    mockedApi.getAllSessions.mockResolvedValue([]);
    mockedApi.disconnectPlatform.mockResolvedValue({ success: true, message: 'Disconnected' });
  });

  it('resumes a pending server session and restarts polling', async () => {
    await expect(usePlatformStore.getState().resumeAuthFlow(Platform.WHATSAPP)).resolves.toBe(true);

    expect(usePlatformStore.getState().activeAuthFlow).toMatchObject({
      platform: Platform.WHATSAPP,
      sessionId: 'wa-pending',
      step: 'awaiting_input',
      authData: { pairingCode: 'ABCD-EFGH' },
    });
    expect(pollAuthStatus).toHaveBeenCalledWith(
      Platform.WHATSAPP,
      'wa-pending',
      expect.any(Function),
      2000,
      240000,
    );
  });

  it('refreshes the active flow into a persistent success state', async () => {
    await usePlatformStore.getState().resumeAuthFlow(Platform.WHATSAPP);
    mockedApi.getPlatformStatus.mockResolvedValue([connectedWhatsApp]);

    await usePlatformStore.getState().refreshAuthFlow();

    expect(usePlatformStore.getState().activeAuthFlow?.step).toBe('success');
    expect(usePlatformStore.getState().connectedSessions).toContainEqual(connectedWhatsApp);
  });

  it('copies the exact server code before falling back from an unavailable WhatsApp app', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('Unavailable'));
    const { result } = renderHook(() => useConnectionFlow(Platform.WHATSAPP, 'onboarding'));

    await waitFor(() => expect(result.current.resuming).toBe(false));
    await act(async () => {
      await result.current.copyPairingCode(true);
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('ABCD-EFGH');
    expect(result.current.handoffMessage).toBe('Code copied. Open WhatsApp manually to finish linking.');
  });

  it('groups a pairing code visually without changing the server value', () => {
    expect(formatPairingCodeForDisplay('ABCD-EFGH')).toBe('ABCD EFGH');
  });

  it('returns an onboarding flow to the account chooser explicitly', async () => {
    const { result } = renderHook(() => useConnectionFlow(Platform.WHATSAPP, 'onboarding'));
    await waitFor(() => expect(result.current.resuming).toBe(false));

    act(() => result.current.goBack());

    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('checks the pending session when Claire returns to the foreground', async () => {
    let appStateHandler: ((state: AppStateStatus) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    });
    const { result } = renderHook(() => useConnectionFlow(Platform.WHATSAPP, 'settings'));
    await waitFor(() => expect(result.current.resuming).toBe(false));
    mockedApi.getPlatformStatus.mockClear();

    act(() => appStateHandler?.('active'));

    await waitFor(() => expect(mockedApi.getPlatformStatus).toHaveBeenCalledWith(Platform.WHATSAPP));
  });
});
