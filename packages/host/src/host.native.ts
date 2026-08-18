import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import type { ClaireHost, ClaireNotification } from './types';

/**
 * iOS and Android.
 *
 * Notifications on native are owned by the existing expo-notifications
 * pipeline in `services/notifications.ts`, which handles registration,
 * presence, and push delivery. This host deliberately does not raise local
 * notifications: doing so would double-notify for anything the server already
 * pushes. It reports the capability as false so callers route through the
 * notification service instead.
 */

const PREFERENCE_PREFIX = 'claire.pref.';

export const host: ClaireHost = {
  name: 'native',

  capabilities: {
    badge: false,
    notifications: false,
    imessage: false,
    nativeWindow: false,
    secureStorage: false,
    encryptedCache: false,
  },

  setBadgeCount() {
    // Handled by the push pipeline's badge payload.
  },

  notify(_notification: ClaireNotification) {
    // See the note above: expo-notifications owns this on native.
  },

  openExternal(url: string) {
    void Linking.openURL(url).catch(() => undefined);
  },

  onNavigate() {
    // No application menu on a phone.
    return () => undefined;
  },

  onFocusComposer() {
    return () => undefined;
  },

  openConversationWindow() {
    // A phone has one window.
  },

  reportActiveConversation() {
    // Nothing on native acts on this yet.
  },

  // expo-secure-store is the native keystore, but nothing routes credentials
  // through this seam on native yet — the Supabase session is owned by
  // services/supabase.ts. Report the capability as false rather than pretend.
  async secureGet() {
    return null;
  },

  async secureSet() {
    return false;
  },

  async secureDelete() {
    // No-op.
  },

  async getCompanionStatus() {
    return { hostPlatform: 'native', imessage: 'unavailable', encryptedCache: { available: false, byteLength: 0, updatedAt: null }, pushHelper: 'unsupported' };
  },
  async readEncryptedCache() { return null; },
  async writeEncryptedCache() { return false; },
  async clearEncryptedCache() {},
  async getEncryptedCacheInfo() { return { available: false, byteLength: 0, updatedAt: null }; },
  async startInstagramLogin() { return { success: false, error: 'Instagram setup requires Claire Desktop.' }; },
  async sendIMessage() { return { success: false, error: 'iMessage sending requires Claire Desktop on a Mac.' }; },
  async openSystemSettings() {},
  async configurePushNotifications() {},
  async configureCompanion() { return { success: false, error: 'iMessage setup requires Claire Desktop on a Mac.' }; },

  async getPreference(key: string) {
    try {
      return await AsyncStorage.getItem(PREFERENCE_PREFIX + key);
    } catch {
      return null;
    }
  },

  async setPreference(key: string, value: string) {
    try {
      await AsyncStorage.setItem(PREFERENCE_PREFIX + key, value);
    } catch {
      // A failed preference write must never surface to the user.
    }
  },
};
