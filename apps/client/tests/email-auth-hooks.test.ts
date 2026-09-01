import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import { supabase } from '../services/supabase';
import { platformsApi } from '../services/platforms';
import { useEmailSignIn } from '../features/auth/use-email-sign-in';
import { useEmailVerification } from '../features/auth/use-email-verification';

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
    },
  },
}));

jest.mock('../services/platforms', () => ({
  platformsApi: {
    getAllSessions: jest.fn(),
  },
}));

const auth = supabase.auth as unknown as {
  signInWithOtp: jest.Mock;
  verifyOtp: jest.Mock;
};
const getAllSessions = platformsApi.getAllSessions as jest.Mock;

describe('email authentication hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.signInWithOtp.mockResolvedValue({ error: null });
    auth.verifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
    getAllSessions.mockResolvedValue([]);
  });

  it('keeps an invalid email in place and shows an inline validation error', async () => {
    const { result } = renderHook(() => useEmailSignIn());

    act(() => result.current.setEmail('luc@'));
    await act(async () => result.current.sendCode());

    expect(result.current.email).toBe('luc@');
    expect(result.current.error).toBe('Enter a valid email address.');
    expect(result.current.emailInvalid).toBe(true);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('keeps a valid email field neutral when sending fails for network reasons', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: new Error('Network request failed') });
    const { result } = renderHook(() => useEmailSignIn());

    act(() => result.current.setEmail('luc@example.com'));
    await act(async () => result.current.sendCode());

    expect(result.current.emailInvalid).toBe(false);
    expect(result.current.error).toContain('connection');
  });

  it('normalizes a valid email before requesting a code', async () => {
    const { result } = renderHook(() => useEmailSignIn());

    act(() => result.current.setEmail('  Luc@Example.COM '));
    await act(async () => result.current.sendCode());

    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'luc@example.com',
      options: { shouldCreateUser: true },
    });
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(auth)/verify',
      params: { email: 'luc@example.com' },
    });
  });

  it('preserves a rejected code and marks all OTP boxes as invalid', async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: new Error('Token is invalid') });
    const { result } = renderHook(() => useEmailVerification('luc@example.com'));

    act(() => result.current.setCode('12a3456'));
    await act(async () => result.current.verify());

    expect(result.current.code).toBe('123456');
    expect(result.current.verificationStatus).toBe('error');
    expect(result.current.error).toContain('incorrect');
  });

  it('does not blame the code for a network failure', async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: new Error('Network request failed'),
    });
    const { result } = renderHook(() => useEmailVerification('luc@example.com'));

    act(() => result.current.setCode('123456'));
    await act(async () => result.current.verify());

    expect(result.current.code).toBe('123456');
    expect(result.current.verificationStatus).toBe('idle');
    expect(result.current.error).toContain('connection');
  });

  it('shows the successful OTP state before routing onward', async () => {
    const { result } = renderHook(() => useEmailVerification('luc@example.com'));

    act(() => result.current.setCode('123456'));
    await act(async () => result.current.verify());

    expect(result.current.verificationStatus).toBe('success');
    expect(router.replace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('clears a stale code and confirms when resend succeeds', async () => {
    const { result } = renderHook(() => useEmailVerification('luc@example.com'));

    act(() => result.current.setCode('123456'));
    await act(async () => result.current.resendCode());

    expect(result.current.code).toBe('');
    expect(result.current.message).toBe('A new code is on its way.');
    expect(result.current.focusRequest).toBe(1);
  });
});
