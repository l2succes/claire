import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/**
 * The redirect has to be derived by the host that initiated sign-in.
 *
 * On iOS and Android this is the generated app scheme plus `://confirm`; on
 * web and Electron it is the current HTTPS/custom-scheme origin plus
 * `/confirm`. Keeping this in one place prevents email confirmation and Google
 * OAuth from disagreeing about their destination, and lets the staging app use
 * its own `claire-staging://confirm` callback.
 */
export function getAuthRedirectUri() {
  const scheme = Constants.expoConfig?.scheme;

  return AuthSession.makeRedirectUri({
    scheme: typeof scheme === 'string' ? scheme : 'claire',
    path: 'confirm',
  });
}

function extractAuthResponse(url: string) {
  const parsedUrl = new URL(url);
  const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));
  const searchParams = parsedUrl.searchParams;

  const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

  return {
    accessToken,
    refreshToken,
    code: searchParams.get('code'),
    error: searchParams.get('error') || hashParams.get('error'),
    errorDescription:
      searchParams.get('error_description') || hashParams.get('error_description'),
  };
}

export const googleAuth = {
  async signInWithGoogle() {
    try {
      const redirectUri = getAuthRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data.url) throw new Error('Google sign-in did not return an authorization URL');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri, {
        showInRecents: true,
      });

      if (result.type === 'success') {
        const response = extractAuthResponse(result.url);

        if (response.error) {
          throw new Error(response.errorDescription || response.error);
        }

        if (response.code) {
          const { data: session, error: sessionError } =
            await supabase.auth.exchangeCodeForSession(response.code);

          if (sessionError) throw sessionError;
          return { session, error: null };
        }

        if (!response.accessToken || !response.refreshToken) {
          throw new Error('No authorization code or auth tokens in OAuth response');
        }

        const { data: session, error: sessionError } = await supabase.auth.setSession({
          access_token: response.accessToken,
          refresh_token: response.refreshToken,
        });

        if (sessionError) throw sessionError;

        return { session, error: null };
      }

      if (result.type === 'cancel') {
        return { session: null, error: new Error('User cancelled login') };
      }

      return { session: null, error: new Error('Authentication failed') };
    } catch (error: any) {
      console.error('Google sign in error:', error);
      return { session: null, error };
    }
  },

  getRedirectUri() {
    return getAuthRedirectUri();
  },
};
