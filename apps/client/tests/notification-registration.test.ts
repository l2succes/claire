import * as Notifications from 'expo-notifications';
import { waitFor } from '@testing-library/react-native';
import {
  addPushTokenRotationListener,
  deregisterNotificationDevice,
  registerNotificationDevice,
} from '../services/notifications';

const expoNotifications = Notifications as jest.Mocked<typeof Notifications>;

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { easConfig: { projectId: 'project-id' }, expoConfig: { version: '1.0.0' } },
}));

describe('notification device registration', () => {
  const devicePushToken = { type: 'apns', data: 'native-token' } as Notifications.DevicePushToken;
  let pushTokenListener: ((token: Notifications.DevicePushToken) => void) | undefined;

  beforeEach(async () => {
    expoNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    expoNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test]', type: 'expo' });
    expoNotifications.addPushTokenListener.mockImplementation((listener) => {
      pushTokenListener = listener;
      return { remove: jest.fn() };
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as jest.Mock;
    await deregisterNotificationDevice('access-token');
    jest.mocked(global.fetch).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the native token supplied by the rotation event without requesting it again', async () => {
    addPushTokenRotationListener('access-token');
    pushTokenListener?.(devicePushToken);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    expect(expoNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'project-id',
      devicePushToken,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('deduplicates repeated registration after the token is registered', async () => {
    await registerNotificationDevice('access-token');
    await registerNotificationDevice('access-token');

    expect(expoNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
