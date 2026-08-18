/**
 * The contract between the Electron main process and the renderer.
 *
 * Main and preload both import these names so the two sides cannot drift.
 * This is the desktop implementation of the `ClaireHost` capability seam: the
 * renderer never gets Node APIs, only these channels.
 */

export const IPC = {
  /** Renderer -> main. Mirror the unified unread total on the Dock/taskbar. */
  setBadgeCount: 'claire:set-badge-count',
  /** Renderer -> main. Show a native OS notification. */
  notify: 'claire:notify',
  /** Renderer -> main. Open a URL in the user's real browser. */
  openExternal: 'claire:open-external',
  /** Renderer -> main. Non-sensitive UI preferences (pane widths, workspace). */
  preferenceGet: 'claire:preference-get',
  preferenceSet: 'claire:preference-set',
  /**
   * Renderer -> main. OS-keystore values. The renderer names a key; the
   * ciphertext and the OS key never cross this boundary.
   */
  secureGet: 'claire:secure-get',
  secureSet: 'claire:secure-set',
  secureDelete: 'claire:secure-delete',
  /** Renderer -> main. Open the current conversation in its own window (⌘⇧M). */
  openConversationWindow: 'claire:open-conversation-window',
  /** Main -> renderer. Menu accelerator or notification click. */
  navigate: 'claire:navigate',
  /** Main -> renderer. ⌘N — put the cursor in the active composer. */
  focusComposer: 'claire:focus-composer',
  /** Main -> renderer. Asks which conversation is open, for ⌘⇧M. */
  requestActiveConversation: 'claire:request-active-conversation',
  /** Renderer -> main. Answers `requestActiveConversation`. */
  reportActiveConversation: 'claire:report-active-conversation',
  cacheRead: 'claire:cache-read',
  cacheWrite: 'claire:cache-write',
  cacheClear: 'claire:cache-clear',
  cacheInfo: 'claire:cache-info',
  companionStatus: 'claire:companion-status',
  instagramLogin: 'claire:instagram-login',
  imessageSend: 'claire:imessage-send',
  openSystemSettings: 'claire:open-system-settings',
  configurePush: 'claire:configure-push',
  configureCompanion: 'claire:configure-companion',
} as const;

export type NotifyPayload = {
  title: string;
  body: string;
  /** When present, clicking the notification routes to this conversation. */
  chatId?: string;
};

/**
 * Routes the desktop chrome can ask the renderer to open. These are
 * expo-router paths, not an internal destination enum — the renderer keeps
 * URL-based navigation so back/forward and deep links work.
 */
export type NavigateTarget = string;

export type DesktopCapabilities = {
  badge: boolean;
  notifications: boolean;
  /** A Mac can expose iMessage controls; permission state comes from status. */
  imessage: boolean;
  /** safeStorage is usable — false on a Linux box with no keyring. */
  secureStorage: boolean;
  encryptedCache: boolean;
};

export type EncryptedCacheInfo = { available: boolean; byteLength: number; updatedAt: string | null };
export type CompanionStatus = {
  hostPlatform: 'macos' | 'windows' | 'linux';
  imessage: 'unavailable' | 'needs_permission' | 'ready';
  encryptedCache: EncryptedCacheInfo;
  pushHelper: 'unsupported' | 'not_configured' | 'ready';
};
export type InstagramLoginRequest = { apiUrl: string; accessToken: string };
export type InstagramLoginResult = { success: boolean; error?: string };
export type IMessageSendRequest = { recipient: string; text: string };
export type IMessageSendResult = { success: true } | { success: false; error: string };
export type PushSetupRequest = { apiUrl: string; accessToken: string };
export type CompanionSetupRequest = { apiUrl: string; accessToken: string; userId: string };
export type CompanionSetupResult = { success: boolean; error?: string; deviceId?: string };

export type ClaireDesktopApi = {
  readonly platform: NodeJS.Platform;
  readonly version: string;
  readonly capabilities: DesktopCapabilities;
  setBadgeCount(count: number): void;
  notify(payload: NotifyPayload): void;
  openExternal(url: string): void;
  getPreference(key: string): Promise<string | null>;
  setPreference(key: string, value: string): Promise<void>;
  secureGet(key: string): Promise<string | null>;
  secureSet(key: string, value: string): Promise<boolean>;
  secureDelete(key: string): Promise<void>;
  getCompanionStatus(): Promise<CompanionStatus>;
  readEncryptedCache(userId: string): Promise<string | null>;
  writeEncryptedCache(userId: string, value: string): Promise<boolean>;
  clearEncryptedCache(userId: string): Promise<void>;
  getEncryptedCacheInfo(userId: string): Promise<EncryptedCacheInfo>;
  startInstagramLogin(request: InstagramLoginRequest): Promise<InstagramLoginResult>;
  sendIMessage(request: IMessageSendRequest): Promise<IMessageSendResult>;
  openSystemSettings(section: 'full_disk_access' | 'automation'): Promise<void>;
  configurePushNotifications(request: PushSetupRequest): Promise<void>;
  configureCompanion(request: CompanionSetupRequest): Promise<CompanionSetupResult>;
  /** Open a conversation in its own compact window. */
  openConversationWindow(chatId: string): void;
  /**
   * Tell the chrome which conversation is on screen, so ⌘⇧M knows what to
   * detach. Pass null when no conversation is open.
   */
  reportActiveConversation(chatId: string | null): void;
  /** Returns an unsubscribe function. */
  onNavigate(callback: (target: NavigateTarget) => void): () => void;
  /** ⌘N. Returns an unsubscribe function. */
  onFocusComposer(callback: () => void): () => void;
};
