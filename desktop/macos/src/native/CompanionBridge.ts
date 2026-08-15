import { NativeEventEmitter, NativeModules, type NativeModule } from 'react-native';
import type { DesktopCommand } from '../services/desktop-navigation';

export type { DesktopCommand } from '../services/desktop-navigation';

export type CompanionHealth = 'unavailable' | 'needs_setup' | 'starting' | 'healthy' | 'degraded';

export interface CompanionStatus {
  health: CompanionHealth;
  host: 'macos';
  iMessagePermissionState: 'unavailable' | 'not_checked' | 'needs_access' | 'ready';
  detail: string;
}

export interface CompanionDeviceIdentity {
  publicKey: string;
}

export interface NativeCompanionEnrollment {
  deviceId: string;
}

export interface DesktopRuntimeConfig {
  apiUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface MacNotificationRegistration {
  status: 'not_determined' | 'authorized' | 'provisional' | 'denied';
  token: string;
  error: string;
}

export interface NotificationResponsePayload { chatId: string; messageId?: string }

export interface NativeIMessageMessage {
  rowId: number;
  platformMessageId: string;
  content: string;
  contentType: 'text' | 'image';
  senderId: string;
  senderName: string;
  chatId: string;
  chatType: 'individual' | 'group';
  chatName: string;
  timestampMilliseconds: number;
  isFromMe: boolean;
  isRead: boolean;
  hasMedia: boolean;
}

interface NativeCompanionModule {
  runtimeConfig?: DesktopRuntimeConfig;
  getStatus(): Promise<CompanionStatus>;
  connectInstagram?(apiUrl: string, accessToken: string): Promise<{ status: 'connected'; userLoginId: string }>;
  openSystemSettings(permission: 'full_disk_access' | 'accessibility' | 'contacts' | 'automation'): Promise<void>;
  getOrCreateDeviceIdentity?(): Promise<CompanionDeviceIdentity>;
  enrolMacCompanion?(apiUrl: string, accessToken: string, userId: string): Promise<NativeCompanionEnrollment>;
  heartbeatMacCompanion?(apiUrl: string): Promise<boolean>;
  resetMacCompanion?(): Promise<boolean>;
  ingestIMessageEvents?(apiUrl: string, messages: Array<Record<string, unknown>>): Promise<boolean>;
  syncIMessageMedia?(apiUrl: string, messages: NativeIMessageMessage[]): Promise<number>;
  getRuntimeConfig?(): Promise<DesktopRuntimeConfig>;
  requestNotificationPermission?(): Promise<boolean>;
  getNotificationRegistration?(): Promise<MacNotificationRegistration>;
  getPendingNotificationResponse?(): Promise<NotificationResponsePayload | null>;
  showNotification?(title: string, body: string, chatId?: string): Promise<boolean>;
  getSecureValue?(account: string): Promise<string | null>;
  setSecureValue?(account: string, value: string): Promise<boolean>;
  removeSecureValue?(account: string): Promise<boolean>;
  getDesktopPreference?(key: string): Promise<string | null>;
  setDesktopPreference?(key: string, value: string): Promise<boolean>;
  openCompactChatWindow?(conversationId: string | null): Promise<boolean>;
  setDockBadge?(unreadCount: number): Promise<boolean>;
  fetchIMessageMessages?(cursor: number, limit: number): Promise<NativeIMessageMessage[]>;
  sendIMessage?(recipient: string, text: string): Promise<boolean>;
}

const nativeCompanion = NativeModules.ClaireCompanion as NativeCompanionModule | undefined;
// Event-emitter methods are provided by the native RCTEventEmitter superclass.
// The typed JS surface intentionally only declares Claire's public methods.
const desktopEvents = nativeCompanion ? new NativeEventEmitter(nativeCompanion as unknown as NativeModule) : null;

export const companionBridge = {
  subscribeDesktopCommands(listener: (command: DesktopCommand) => void): () => void {
    if (!desktopEvents) return () => {};
    const subscription = desktopEvents.addListener('desktopCommand', (event: { command?: DesktopCommand }) => {
      if (event.command) listener(event.command);
    });
    return () => subscription.remove();
  },

  subscribeNotificationResponses(listener: (payload: NotificationResponsePayload) => void): () => void {
    if (!desktopEvents) return () => {};
    const subscription = desktopEvents.addListener('notificationResponse', listener);
    return () => subscription.remove();
  },

  subscribeNotificationTokenChanges(listener: (token: string) => void): () => void {
    if (!desktopEvents) return () => {};
    const subscription = desktopEvents.addListener('notificationTokenChanged', (event: { token?: string }) => {
      if (event.token) listener(event.token);
    });
    return () => subscription.remove();
  },

  async getStatus(): Promise<CompanionStatus> {
    if (!nativeCompanion) {
      return {
        health: 'unavailable',
        host: 'macos',
        iMessagePermissionState: 'unavailable',
        detail: 'The native companion agent is not installed in this development build yet.',
      };
    }
    return nativeCompanion.getStatus();
  },

  async connectInstagram(apiUrl: string, accessToken: string): Promise<{ status: 'connected'; userLoginId: string }> {
    if (!nativeCompanion?.connectInstagram) throw new Error('This build does not include the secure macOS Instagram connection window.');
    return nativeCompanion.connectInstagram(apiUrl, accessToken);
  },

  async openSystemSettings(permission: 'full_disk_access' | 'accessibility' | 'contacts' | 'automation'): Promise<void> {
    if (nativeCompanion) await nativeCompanion.openSystemSettings(permission);
  },

  async getOrCreateDeviceIdentity(): Promise<CompanionDeviceIdentity> {
    if (!nativeCompanion?.getOrCreateDeviceIdentity) {
      throw new Error('This build does not include the macOS secure device identity module.');
    }
    return nativeCompanion.getOrCreateDeviceIdentity();
  },

  async enrolMacCompanion(apiUrl: string, accessToken: string, userId: string): Promise<NativeCompanionEnrollment> {
    if (!nativeCompanion?.enrolMacCompanion) throw new Error('This build does not include secure Mac companion enrolment.');
    return nativeCompanion.enrolMacCompanion(apiUrl, accessToken, userId);
  },

  async heartbeatMacCompanion(apiUrl: string): Promise<boolean> {
    if (!nativeCompanion?.heartbeatMacCompanion) throw new Error('This build does not include secure Mac companion health checks.');
    return nativeCompanion.heartbeatMacCompanion(apiUrl);
  },

  async resetMacCompanion(): Promise<boolean> {
    if (!nativeCompanion?.resetMacCompanion) throw new Error('This build does not include secure Mac companion recovery.');
    return nativeCompanion.resetMacCompanion();
  },

  async ingestIMessageEvents(apiUrl: string, messages: Array<Record<string, unknown>>): Promise<boolean> {
    if (!nativeCompanion?.ingestIMessageEvents) throw new Error('This build does not include secure iMessage ingestion.');
    return nativeCompanion.ingestIMessageEvents(apiUrl, messages);
  },

  async syncIMessageMedia(apiUrl: string, messages: NativeIMessageMessage[]): Promise<number> {
    if (!nativeCompanion?.syncIMessageMedia) return 0;
    return nativeCompanion.syncIMessageMedia(apiUrl, messages);
  },

  async getRuntimeConfig(): Promise<DesktopRuntimeConfig> {
    if (nativeCompanion?.runtimeConfig) return nativeCompanion.runtimeConfig;
    if (!nativeCompanion?.getRuntimeConfig) return { apiUrl: '', supabaseUrl: '', supabaseAnonKey: '' };
    return nativeCompanion.getRuntimeConfig();
  },

  async requestNotificationPermission(): Promise<boolean> {
    if (!nativeCompanion?.requestNotificationPermission) return false;
    return nativeCompanion.requestNotificationPermission();
  },

  async getNotificationRegistration(): Promise<MacNotificationRegistration> {
    if (!nativeCompanion?.getNotificationRegistration) return { status: 'not_determined', token: '', error: 'Native notification registration is unavailable.' };
    return nativeCompanion.getNotificationRegistration();
  },

  async getPendingNotificationResponse(): Promise<NotificationResponsePayload | null> {
    if (!nativeCompanion?.getPendingNotificationResponse) return null;
    return nativeCompanion.getPendingNotificationResponse();
  },

  async showNotification(title: string, body: string, chatId?: string): Promise<boolean> {
    if (!nativeCompanion?.showNotification) return false;
    return nativeCompanion.showNotification(title, body, chatId);
  },

  async getSecureValue(account: string): Promise<string | null> {
    if (!nativeCompanion?.getSecureValue) return null;
    return nativeCompanion.getSecureValue(account);
  },

  async setSecureValue(account: string, value: string): Promise<boolean> {
    if (!nativeCompanion?.setSecureValue) throw new Error('This build does not include macOS Keychain support.');
    return nativeCompanion.setSecureValue(account, value);
  },

  async removeSecureValue(account: string): Promise<boolean> {
    if (!nativeCompanion?.removeSecureValue) return true;
    return nativeCompanion.removeSecureValue(account);
  },

  async getDesktopPreference(key: string): Promise<string | null> {
    if (!nativeCompanion?.getDesktopPreference) return null;
    return nativeCompanion.getDesktopPreference(key);
  },

  async setDesktopPreference(key: string, value: string): Promise<boolean> {
    if (!nativeCompanion?.setDesktopPreference) return false;
    return nativeCompanion.setDesktopPreference(key, value);
  },

  async openCompactChatWindow(conversationId: string | null): Promise<boolean> {
    if (!nativeCompanion?.openCompactChatWindow) return false;
    return nativeCompanion.openCompactChatWindow(conversationId);
  },

  async setDockBadge(unreadCount: number): Promise<boolean> {
    if (!nativeCompanion?.setDockBadge) return false;
    return nativeCompanion.setDockBadge(Math.max(0, Math.floor(unreadCount)));
  },

  async fetchIMessageMessages(cursor: number, limit = 200): Promise<NativeIMessageMessage[]> {
    if (!nativeCompanion?.fetchIMessageMessages) throw new Error('This build does not include the macOS iMessage reader.');
    return nativeCompanion.fetchIMessageMessages(cursor, limit);
  },

  async sendIMessage(recipient: string, text: string): Promise<boolean> {
    if (!nativeCompanion?.sendIMessage) throw new Error('This build does not include iMessage sending.');
    return nativeCompanion.sendIMessage(recipient, text);
  },
};
