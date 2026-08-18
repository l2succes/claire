/**
 * The capability seam.
 *
 * One UI runs on iOS, Android, the browser, and the Electron desktop shell.
 * What differs between them is not layout — that follows the viewport — but
 * *capability*: only some hosts can set a Dock badge, only one can read the
 * local iMessage database. Those differences live behind this interface, with
 * one implementation per host selected by platform extension
 * (`host.native.ts` / `host.web.ts`), following the same convention as
 * `services/mobile-cache.{native,web}.ts`.
 *
 * Callers must branch on `capabilities`, never on `Platform.OS`. A capability
 * check survives a new host being added; a platform check does not.
 */

export type ClaireNotification = {
  title: string;
  body: string;
  /** When present, activating the notification routes to this conversation. */
  chatId?: string;
};

export type ClaireEncryptedCacheInfo = {
  available: boolean;
  byteLength: number;
  updatedAt: string | null;
};

export type ClaireCompanionStatus = {
  hostPlatform: 'macos' | 'windows' | 'linux' | 'browser' | 'native';
  imessage: 'unavailable' | 'needs_permission' | 'ready';
  encryptedCache: ClaireEncryptedCacheInfo;
  pushHelper: 'unsupported' | 'not_configured' | 'ready';
};

export type ClaireIMessageSendRequest = {
  recipient: string;
  text: string;
};

export type ClaireIMessageSendResult = { success: true } | { success: false; error: string };

export type ClaireInstagramLoginRequest = {
  /** Ephemeral, authenticated server context. Never persisted by the host. */
  apiUrl: string;
  accessToken: string;
};

export type ClaireInstagramLoginResult = { success: boolean; error?: string };
export type ClairePushSetupRequest = { apiUrl: string; accessToken: string };
export type ClaireCompanionSetupRequest = { apiUrl: string; accessToken: string; userId: string };
export type ClaireCompanionSetupResult = { success: boolean; error?: string; deviceId?: string };

export type ClaireHostCapabilities = {
  /** Unread total can be mirrored on a Dock/taskbar badge. */
  badge: boolean;
  /** OS-level notifications can be raised from this host. */
  notifications: boolean;
  /** Local iMessage history can be read on this machine. */
  imessage: boolean;
  /** The host chrome supplies its own window controls and drag region. */
  nativeWindow: boolean;
  /** Values given to `secureSet` are held by an OS keystore, not just the page. */
  secureStorage: boolean;
  /** An encrypted per-user desktop snapshot can be stored by the host. */
  encryptedCache: boolean;
};

export type ClaireHost = {
  readonly name: 'native' | 'browser' | 'electron';
  readonly capabilities: ClaireHostCapabilities;

  /** Mirror the unified unread total. No-op where `capabilities.badge` is false. */
  setBadgeCount(count: number): void;

  /** Raise an OS notification. No-op where `capabilities.notifications` is false. */
  notify(notification: ClaireNotification): void;

  /** Open a URL outside the app. */
  openExternal(url: string): void;

  /**
   * Chrome-initiated navigation — a menu accelerator, a notification click.
   * Targets are expo-router paths, so URL history keeps working.
   * Returns an unsubscribe function.
   */
  onNavigate(callback: (target: string) => void): () => void;

  /** ⌘N — the chrome asking the active screen to focus its composer. */
  onFocusComposer(callback: () => void): () => void;

  /**
   * Open a conversation in its own window. No-op where
   * `capabilities.nativeWindow` is false.
   */
  openConversationWindow(chatId: string): void;

  /**
   * Tell the chrome which conversation is on screen so a window-level command
   * (⌘⇧M) knows what to act on. Pass null when none is open.
   */
  reportActiveConversation(chatId: string | null): void;

  /**
   * Small non-sensitive values: pane widths, last workspace.
   * Not for credentials — use the secure* methods for those.
   */
  getPreference(key: string): Promise<string | null>;
  setPreference(key: string, value: string): Promise<void>;

  /**
   * OS-keystore values, when `capabilities.secureStorage` is true.
   * `secureSet` returns false when the host could not encrypt, so callers can
   * refuse to persist a credential rather than storing it in the clear.
   */
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
};
