import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type ClaireDesktopApi, type NavigateTarget, type NotifyPayload, type InstagramLoginRequest, type IMessageSendRequest, type PushSetupRequest, type CompanionSetupRequest, type CompanionSetupResult } from './shared/ipc';

/**
 * The entire surface the renderer can reach. Everything else — the filesystem,
 * the OS keystore, and eventually the iMessage database — stays in the main
 * process, mirroring how the React Native macOS host keeps that material out
 * of the JavaScript layer.
 *
 * This file is bundled to a single module before shipping: a sandboxed preload
 * cannot `require()` relative paths, so an unbundled import of ./shared/ipc
 * would resolve to nothing and silently expose no API at all.
 */

function subscribe(channel: string, callback: (...args: unknown[]) => void) {
  const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: ClaireDesktopApi = {
  platform: process.platform,
  version: process.env.CLAIRE_DESKTOP_VERSION ?? '0.0.0',
  capabilities: {
    badge: process.platform === 'darwin' || process.platform === 'linux',
    notifications: true,
    imessage: process.platform === 'darwin',
    // Resolved by the main process at startup and injected as an argument,
    // because safeStorage is not reachable from a sandboxed preload.
    secureStorage: process.argv.includes('--claire-secure-storage'),
    encryptedCache: process.argv.includes('--claire-secure-storage'),
  },

  setBadgeCount(count: number) {
    ipcRenderer.send(IPC.setBadgeCount, count);
  },
  notify(payload: NotifyPayload) {
    ipcRenderer.send(IPC.notify, payload);
  },
  openExternal(url: string) {
    ipcRenderer.send(IPC.openExternal, url);
  },
  openConversationWindow(chatId: string) {
    ipcRenderer.send(IPC.openConversationWindow, chatId);
  },
  reportActiveConversation(chatId: string | null) {
    ipcRenderer.send(IPC.reportActiveConversation, chatId);
  },

  getPreference(key: string) {
    return ipcRenderer.invoke(IPC.preferenceGet, key) as Promise<string | null>;
  },
  setPreference(key: string, value: string) {
    return ipcRenderer.invoke(IPC.preferenceSet, key, value) as Promise<void>;
  },
  secureGet(key: string) {
    return ipcRenderer.invoke(IPC.secureGet, key) as Promise<string | null>;
  },
  secureSet(key: string, value: string) {
    return ipcRenderer.invoke(IPC.secureSet, key, value) as Promise<boolean>;
  },
  secureDelete(key: string) {
    return ipcRenderer.invoke(IPC.secureDelete, key) as Promise<void>;
  },
  getCompanionStatus() { return ipcRenderer.invoke(IPC.companionStatus); },
  readEncryptedCache(userId: string) { return ipcRenderer.invoke(IPC.cacheRead, userId) as Promise<string | null>; },
  writeEncryptedCache(userId: string, value: string) { return ipcRenderer.invoke(IPC.cacheWrite, userId, value) as Promise<boolean>; },
  clearEncryptedCache(userId: string) { return ipcRenderer.invoke(IPC.cacheClear, userId) as Promise<void>; },
  getEncryptedCacheInfo(userId: string) { return ipcRenderer.invoke(IPC.cacheInfo, userId); },
  startInstagramLogin(request: InstagramLoginRequest) { return ipcRenderer.invoke(IPC.instagramLogin, request); },
  sendIMessage(request: IMessageSendRequest) { return ipcRenderer.invoke(IPC.imessageSend, request); },
  openSystemSettings(section: 'full_disk_access' | 'automation') { return ipcRenderer.invoke(IPC.openSystemSettings, section) as Promise<void>; },
  configurePushNotifications(request: PushSetupRequest) { return ipcRenderer.invoke(IPC.configurePush, request) as Promise<void>; },
  configureCompanion(request: CompanionSetupRequest) { return ipcRenderer.invoke(IPC.configureCompanion, request) as Promise<CompanionSetupResult>; },

  onNavigate(callback: (target: NavigateTarget) => void) {
    return subscribe(IPC.navigate, (target) => callback(target as NavigateTarget));
  },
  onFocusComposer(callback: () => void) {
    return subscribe(IPC.focusComposer, () => callback());
  },
};

contextBridge.exposeInMainWorld('claireDesktop', api);
