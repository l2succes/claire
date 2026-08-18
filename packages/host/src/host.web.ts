import type { ClaireHost, ClaireNotification, ClaireCompanionStatus, ClaireEncryptedCacheInfo, ClaireIMessageSendRequest, ClaireIMessageSendResult, ClaireInstagramLoginRequest, ClaireInstagramLoginResult, ClairePushSetupRequest, ClaireCompanionSetupRequest, ClaireCompanionSetupResult } from './types';

/**
 * Web host — covers both a plain browser tab and the Electron renderer.
 *
 * Electron injects `window.claireDesktop` from its preload script. When that
 * object is present the app is running inside the desktop shell and gains
 * badge, native notification, and OS-keystore capabilities; when it is absent
 * the same code degrades to what a browser can actually do. That is why this
 * is one file rather than two: the renderer bundle is byte-identical in both
 * cases, and the difference is discovered at runtime.
 */

type DesktopBridge = {
  platform: string;
  version: string;
  capabilities: { badge: boolean; notifications: boolean; imessage: boolean; secureStorage: boolean; encryptedCache: boolean };
  setBadgeCount(count: number): void;
  notify(payload: ClaireNotification): void;
  openExternal(url: string): void;
  getPreference(key: string): Promise<string | null>;
  setPreference(key: string, value: string): Promise<void>;
  secureGet(key: string): Promise<string | null>;
  secureSet(key: string, value: string): Promise<boolean>;
  secureDelete(key: string): Promise<void>;
  getCompanionStatus(): Promise<ClaireCompanionStatus>;
  readEncryptedCache(userId: string): Promise<string | null>;
  writeEncryptedCache(userId: string, value: string): Promise<boolean>;
  clearEncryptedCache(userId: string): Promise<void>;
  getEncryptedCacheInfo(userId: string): Promise<ClaireEncryptedCacheInfo>;
  startInstagramLogin(request: ClaireInstagramLoginRequest): Promise<ClaireInstagramLoginResult>;
  sendIMessage(request: ClaireIMessageSendRequest): Promise<ClaireIMessageSendResult>;
  openSystemSettings(section: 'full_disk_access' | 'automation'): Promise<void>;
  configurePushNotifications(request: ClairePushSetupRequest): Promise<void>;
  configureCompanion(request: ClaireCompanionSetupRequest): Promise<ClaireCompanionSetupResult>;
  openConversationWindow(chatId: string): void;
  reportActiveConversation(chatId: string | null): void;
  onNavigate(callback: (target: string) => void): () => void;
  onFocusComposer(callback: () => void): () => void;
};

function bridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { claireDesktop?: DesktopBridge }).claireDesktop;
  return candidate && typeof candidate.setBadgeCount === 'function' ? candidate : null;
}

const PREFERENCE_PREFIX = 'claire.pref.';

export const host: ClaireHost = {
  get name() {
    return bridge() ? ('electron' as const) : ('browser' as const);
  },

  get capabilities() {
    const desktop = bridge();
    return {
      badge: Boolean(desktop?.capabilities.badge),
      // A browser can raise notifications too, but only after the user grants
      // permission — treat it as available and let notify() handle the gate.
      notifications: desktop ? desktop.capabilities.notifications : typeof Notification !== 'undefined',
      imessage: Boolean(desktop?.capabilities.imessage),
      nativeWindow: Boolean(desktop),
      secureStorage: Boolean(desktop?.capabilities.secureStorage),
      encryptedCache: Boolean(desktop?.capabilities.encryptedCache),
    };
  },

  setBadgeCount(count: number) {
    const desktop = bridge();
    if (desktop) {
      desktop.setBadgeCount(count);
      return;
    }
    // Browsers that support the Badging API can still show a count on an
    // installed PWA. Everything else silently does nothing.
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void> };
    if (typeof nav.setAppBadge === 'function') void nav.setAppBadge(count).catch(() => undefined);
  },

  notify(notification: ClaireNotification) {
    const desktop = bridge();
    if (desktop) {
      desktop.notify(notification);
      return;
    }
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    // Deliberately not requesting permission here. Prompting from a background
    // event is the pattern browsers penalise; the settings screen asks.
    new Notification(notification.title, { body: notification.body });
  },

  openExternal(url: string) {
    const desktop = bridge();
    if (desktop) {
      desktop.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  },

  onNavigate(callback: (target: string) => void) {
    const desktop = bridge();
    if (desktop) return desktop.onNavigate(callback);
    // A browser has no application menu to navigate from.
    return () => undefined;
  },

  onFocusComposer(callback: () => void) {
    return bridge()?.onFocusComposer(callback) ?? (() => undefined);
  },

  openConversationWindow(chatId: string) {
    const desktop = bridge();
    if (desktop) {
      desktop.openConversationWindow(chatId);
      return;
    }
    // A browser tab can still give the conversation its own window.
    window.open(`/chat/${encodeURIComponent(chatId)}`, '_blank', 'noopener,width=420,height=640');
  },

  reportActiveConversation(chatId: string | null) {
    bridge()?.reportActiveConversation(chatId);
  },

  async secureGet(key: string) {
    // A browser has no OS keystore. Returning null rather than reading
    // localStorage keeps callers from believing a secret was protected.
    return bridge()?.secureGet(key) ?? null;
  },

  async secureSet(key: string, value: string) {
    return bridge()?.secureSet(key, value) ?? false;
  },

  async secureDelete(key: string) {
    await bridge()?.secureDelete(key);
  },

  async getPreference(key: string) {
    const desktop = bridge();
    if (desktop) return desktop.getPreference(key);
    try {
      return window.localStorage.getItem(PREFERENCE_PREFIX + key);
    } catch {
      return null;
    }
  },

  async setPreference(key: string, value: string) {
    const desktop = bridge();
    if (desktop) return desktop.setPreference(key, value);
    try {
      window.localStorage.setItem(PREFERENCE_PREFIX + key, value);
    } catch {
      // Private-mode storage limits must not break a preference write.
    }
  },

  async getCompanionStatus() {
    return bridge()?.getCompanionStatus() ?? { hostPlatform: 'browser', imessage: 'unavailable', encryptedCache: { available: false, byteLength: 0, updatedAt: null }, pushHelper: 'unsupported' };
  },
  async readEncryptedCache(userId: string) { return bridge()?.readEncryptedCache(userId) ?? null; },
  async writeEncryptedCache(userId: string, value: string) { return bridge()?.writeEncryptedCache(userId, value) ?? false; },
  async clearEncryptedCache(userId: string) { await bridge()?.clearEncryptedCache(userId); },
  async getEncryptedCacheInfo(userId: string) { return bridge()?.getEncryptedCacheInfo(userId) ?? { available: false, byteLength: 0, updatedAt: null }; },
  async startInstagramLogin(request: ClaireInstagramLoginRequest) { return bridge()?.startInstagramLogin(request) ?? { success: false, error: 'Instagram setup requires Claire Desktop.' }; },
  async sendIMessage(request: ClaireIMessageSendRequest) { return bridge()?.sendIMessage(request) ?? { success: false, error: 'iMessage sending requires Claire Desktop on a Mac.' }; },
  async openSystemSettings(section: 'full_disk_access' | 'automation') { await bridge()?.openSystemSettings(section); },
  async configurePushNotifications(request: ClairePushSetupRequest) {
    // A renderer can update before its Electron main process during Fast
    // Refresh. Treat a missing newer IPC handler as unavailable, never as a
    // user-facing crash; the next main-process restart retries registration.
    try { await bridge()?.configurePushNotifications(request); } catch { /* stale desktop main */ }
  },
  async configureCompanion(request: ClaireCompanionSetupRequest) {
    try { return await bridge()?.configureCompanion(request) ?? { success: false, error: 'iMessage setup requires Claire Desktop on a Mac.' }; }
    catch { return { success: false, error: 'Restart Claire Desktop to finish iMessage setup.' }; }
  },
};
