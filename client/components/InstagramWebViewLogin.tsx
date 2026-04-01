import React, { useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import CookieManager from '@react-native-cookies/cookies';
import { X } from 'lucide-react-native';

const INSTAGRAM_LOGIN_URL = 'https://www.instagram.com/accounts/login/';

// Cookies mautrix-meta needs (per docs: authentication.md)
const REQUIRED_COOKIES = ['sessionid', 'csrftoken', 'mid', 'ig_did', 'ds_user_id'];

// Mobile Safari UA so Instagram loads the mobile login page
const USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

interface InstagramWebViewLoginProps {
  onSuccess: (cookieJson: string) => void;
  onCancel: () => void;
}

export function InstagramWebViewLogin({ onSuccess, onCancel }: InstagramWebViewLoginProps) {
  const [pageLoading, setPageLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const extractedRef = useRef(false);

  const extractCookies = async () => {
    if (extractedRef.current) return;
    extractedRef.current = true;
    setExtracting(true);

    try {
      // CookieManager.get reads from the native WKWebView cookie store,
      // including HttpOnly cookies that document.cookie can't access.
      const cookies = await CookieManager.get('https://www.instagram.com', true);

      const result: Record<string, string> = {};
      for (const name of REQUIRED_COOKIES) {
        const cookie = cookies[name];
        if (cookie?.value) {
          result[name] = cookie.value;
        }
      }

      if (!result.sessionid) {
        // Not logged in yet — reset and keep the WebView open
        extractedRef.current = false;
        setExtracting(false);
        return;
      }

      onSuccess(JSON.stringify(result));
    } catch {
      extractedRef.current = false;
      setExtracting(false);
    }
  };

  const handleNavigationStateChange = (navState: { url: string; loading: boolean }) => {
    if (navState.loading) return;
    const { url } = navState;
    if (!url) return;

    // User has successfully logged in when they land on the instagram.com feed
    // (not on /accounts/login, /accounts/signup, or challenge pages)
    const isLoginPage =
      url.includes('/accounts/login') ||
      url.includes('/accounts/signup') ||
      url.includes('/challenge') ||
      url.includes('/two_factor');

    if (!isLoginPage && url.startsWith('https://www.instagram.com/')) {
      extractCookies();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
          <X size={20} color="#6b7280" />
        </TouchableOpacity>
        <Text style={styles.title}>Log in to Instagram</Text>
        <View style={styles.placeholder} />
      </View>

      {extracting ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#E1306C" />
          <Text style={styles.extractingText}>Connecting to Instagram...</Text>
        </View>
      ) : (
        <WebView
          source={{ uri: INSTAGRAM_LOGIN_URL }}
          userAgent={USER_AGENT}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => setPageLoading(false)}
          onNavigationStateChange={handleNavigationStateChange}
          style={styles.webview}
        />
      )}

      {pageLoading && !extracting && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#E1306C" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  closeBtn: {
    padding: 8,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 16,
    color: '#111827',
  },
  placeholder: {
    width: 36,
  },
  webview: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extractingText: {
    marginTop: 16,
    color: '#6b7280',
    fontSize: 15,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
