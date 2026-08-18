import type { ClaireHost, ClaireNotification } from './types';

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
  capabilities: { badge: boolean; notifications: boolean; imessage: boolean; secureStorage: boolean };
  setBadgeCount(count: number): void;
  notify(payload: ClaireNotification): void;
  openExternal(url: string): void;
  getPreference(key: string): Promise<string | null>;
  setPreference(key: string, value: string): Promise<void>;
  secureGet(key: string): Promise<string | null>;
  secureSet(key: string, value: string): Promise<boolean>;
  secureDelete(key: string): Promise<void>;
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
};
