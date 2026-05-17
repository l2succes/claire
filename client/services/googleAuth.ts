import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'claire',
  path: 'confirm',
});

function extractSessionFromUrl(url: string) {
  const parsedUrl = new URL(url);
  const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));
  const searchParams = parsedUrl.searchParams;

  const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');

  return { accessToken, refreshToken };
}

export const googleAuth = {
  async signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri, {
        showInRecents: true,
      });

      if (result.type === 'success') {
        const { accessToken, refreshToken } = extractSessionFromUrl(result.url);

        if (!accessToken || !refreshToken) {
          throw new Error('No auth tokens in OAuth response');
        }

        const { data: session, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
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
    return redirectUri;
  },
};
