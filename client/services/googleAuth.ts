import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { Platform } from 'react-native';

// Ensure web browser sessions complete properly
WebBrowser.maybeCompleteAuthSession();

// Hardcode the redirect URI to ensure it's always correct on native
const redirectUri = 'claire://auth/callback';

export const googleAuth = {
  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle() {
    try {
      // Create session from Supabase
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUri,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      // Open the OAuth URL in the browser
      const res = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectUri,
        {
          showInRecents: true,
        }
      );

      if (res.type === 'success') {
        const { url } = res;

        // Implicit flow: GoTrue returns tokens in the hash fragment
        const parsedUrl = new URL(url);
        const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (!accessToken) throw new Error('No access token in response');

        const { data: session, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken!,
        });

        if (sessionError) throw sessionError;

        return { session, error: null };
      } else if (res.type === 'cancel') {
        return { session: null, error: new Error('User cancelled login') };
      } else {
        return { session: null, error: new Error('Authentication failed') };
      }
    } catch (error: any) {
      console.error('Google sign in error:', error);
      return { session: null, error };
    }
  },

  /**
   * Get the configured redirect URI (useful for debugging)
   */
  getRedirectUri() {
    return redirectUri;
  },
};