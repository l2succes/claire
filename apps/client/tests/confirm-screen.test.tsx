import { render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

let mockParams: Record<string, string> = {};
const mockSetSession = jest.fn();
const mockExchangeCode = jest.fn(async (_code: string) => ({ data: { session: { access_token: 'session' } }, error: null }));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../services/supabase', () => ({
  supabase: { auth: { setSession: (...args: unknown[]) => mockSetSession(...args), exchangeCodeForSession: (code: string) => mockExchangeCode(code) } },
}));
jest.mock('../services/platforms', () => ({ platformsApi: { getAllSessions: jest.fn(async () => []) } }));

import ConfirmScreen from '../app/(auth)/confirm';

describe('auth confirm screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignores session tokens carried by a link', async () => {
    mockParams = { access_token: 'a'.repeat(40), refresh_token: 'r'.repeat(20) };
    render(<ConfirmScreen />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/signin'));
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockExchangeCode).not.toHaveBeenCalled();
  });

  it('still completes a PKCE code exchange', async () => {
    mockParams = { code: 'pkce-code' };
    render(<ConfirmScreen />);
    await waitFor(() => expect(mockExchangeCode).toHaveBeenCalledWith('pkce-code'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(auth)/login'));
    expect(mockSetSession).not.toHaveBeenCalled();
  });
});
