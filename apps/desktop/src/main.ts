import { app, BrowserWindow, ipcMain, nativeImage, Notification, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { APP_NAME, applyChannelIdentity, channelIconPath, IS_DEV } from './channel';
import { buildApplicationMenu } from './menu';
import { getPreference, setPreference } from './preferences';
import {
  registerRendererProtocol,
  registerRendererSchemePrivileges,
} from './protocol';
import { secureDelete, secureGet, secureSet } from './secure-store';
import { IPC, type NotifyPayload } from './shared/ipc';
import { createMainWindow, isRendererUrl, openConversationWindow, openExternalWebUrl } from './windows';
import { withConfiguredApiUrl } from './app-config';
import { clearEncryptedCache, encryptedCacheInfo, readEncryptedCache, writeEncryptedCache } from './encrypted-cache';
import { companionStatus, openCompanionSettings, sendIMessage } from './companion';
import { startInstagramLogin } from './instagram-login';
import { createStatusTray } from './tray';
import { configurePushHelper, startPushHelper } from './push-helper';
import { configureIMessageSync } from './imessage-sync';

/**
 * In development the renderer is the Expo web dev server, so Fast Refresh works
 * inside the Electron window. In a packaged build it is the `expo export -p web`
 * output served from the custom scheme registered in protocol.ts.
 */
const RENDERER_ROOT = path.join(__dirname, '..', 'renderer');

let mainWindow: BrowserWindow | null = null;

/**
 * The conversation the focused window is showing, reported by the renderer.
 * ⌘⇧M needs it in the main process, where the menu lives.
 */
let activeConversationId: string | null = null;
let pendingDeepLink: string | null = null;

// Both of these must run before anything else touches app paths or windows.
// applyChannelIdentity repoints userData, which the single-instance lock below
// is keyed on; the scheme privileges must be registered before the app is
// ready or the renderer origin will not be treated as secure.
applyChannelIdentity();
registerRendererSchemePrivileges();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    const link = commandLine.find((argument) => argument.startsWith('claire://'));
    if (link) navigateDeepLink(link);
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    navigateDeepLink(url);
  });

  void app.whenReady().then(onReady);
}

async function onReady(): Promise<void> {
  if (process.platform === 'darwin') {
    // The native About panel is part of the macOS application menu. Setting
    // this explicitly prevents Electron's executable name from leaking into
    // the menu even for unpackaged development launches.
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: 'Claire',
    });
  }
  // Register after ready for packaged builds. Development runs keep Electron's
  // executable argument so a `claire://` callback reaches this instance too.
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient('claire', process.execPath, [path.resolve(process.argv[1])]);
  else app.setAsDefaultProtocolClient('claire');
  // A packaged build gets its icon from the bundle; an unpackaged run would
  // otherwise show the stock Electron icon and be unidentifiable in the Dock.
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
    const icon = nativeImage.createFromPath(channelIconPath());
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  }

  registerRendererProtocol(RENDERER_ROOT);
  applyPermissionPolicy();
  registerIpcHandlers();
  buildApplicationMenu({
    getWindow: () => mainWindow,
    getActiveConversationId: () => activeConversationId,
    openConversationWindow,
  });

  mainWindow = createMainWindow();
  mainWindow.webContents.once('did-finish-load', () => {
    if (pendingDeepLink) navigateDeepLink(pendingDeepLink);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  createStatusTray(() => mainWindow);
  startPushHelper();

  const initialLink = process.argv.find((argument) => argument.startsWith('claire://'));
  if (initialLink) navigateDeepLink(initialLink);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });
}

/** Session material is never accepted from a link; only a PKCE `code` is. */
const DEEP_LINK_DROPPED_PARAMS = ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token'];

function navigateDeepLink(url: string): void {
  let route: string | null = null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'claire:') return;
    for (const name of DEEP_LINK_DROPPED_PARAMS) parsed.searchParams.delete(name);
    const path = `${parsed.host}${parsed.pathname}`.replace(/^\/+/, '');
    route = path ? `/${path}${parsed.search}` : '/';
  } catch { return; }
  pendingDeepLink = route;
  if (!mainWindow || mainWindow.webContents.isLoading()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send(IPC.navigate, route);
  pendingDeepLink = null;
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * Deny every permission by default. Claire's own renderer may use the
 * microphone (voice notes), notifications and clipboard writes; no other page
 * — including the sign-in popup — is granted anything.
 */
function applyPermissionPolicy(): void {
  const allowed = (permission: string, origin: string | undefined, mediaTypes: string[] = []): boolean => {
    if (!isRendererUrl(origin)) return false;
    if (permission === 'media') return mediaTypes.length > 0 && mediaTypes.every((type) => type === 'audio');
    return permission === 'notifications' || permission === 'clipboard-sanitized-write';
  };
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? details.mediaTypes ?? [] : [];
    callback(allowed(permission, details.requestingUrl || contents.getURL(), mediaTypes));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
    const mediaType = 'mediaType' in details && details.mediaType ? [details.mediaType] : ['audio'];
    return allowed(permission, requestingOrigin, mediaType);
  });
}

/** IPC is only honoured from Claire's own renderer, never from a page it navigated to. */
function fromRenderer(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return isRendererUrl(event.senderFrame?.url);
}

function registerIpcHandlers(): void {
  const on = (channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) =>
    ipcMain.on(channel, (event, ...args) => { if (fromRenderer(event)) listener(event, ...args); });
  const handle = (channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!fromRenderer(event)) throw new Error('Unauthorized IPC sender');
      return listener(event, ...args);
    });

  on(IPC.setBadgeCount, (_event, count: unknown) => {
    if (typeof count !== 'number' || !Number.isFinite(count)) return;
    const value = Math.max(0, Math.trunc(count));
    if (typeof app.setBadgeCount === 'function') app.setBadgeCount(value);
  });

  on(IPC.notify, (_event, payload: NotifyPayload) => {
    if (!Notification.isSupported()) return;
    if (!payload || typeof payload.title !== 'string' || typeof payload.body !== 'string') return;

    const notification = new Notification({ title: payload.title, body: payload.body });
    notification.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (payload.chatId) {
        mainWindow.webContents.send(IPC.navigate, `/chat/${payload.chatId}`);
      }
    });
    notification.show();
  });

  on(IPC.openExternal, (_event, url: unknown) => {
    // Only ever hand http(s) to the OS — never a file:// or custom scheme.
    if (typeof url === 'string') openExternalWebUrl(url);
  });

  on(IPC.openConversationWindow, (_event, chatId: unknown) => {
    if (typeof chatId !== 'string' || !chatId) return;
    openConversationWindow(chatId);
  });

  on(IPC.reportActiveConversation, (_event, chatId: unknown) => {
    activeConversationId = typeof chatId === 'string' && chatId ? chatId : null;
  });

  handle(IPC.preferenceGet, (_event, key: unknown) =>
    typeof key === 'string' ? getPreference(key) : null,
  );

  handle(IPC.preferenceSet, (_event, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || typeof value !== 'string') return;
    setPreference(key, value);
  });

  handle(IPC.secureGet, (_event, key: unknown) =>
    typeof key === 'string' ? secureGet(key) : null,
  );

  handle(IPC.secureSet, (_event, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || typeof value !== 'string') return false;
    return secureSet(key, value);
  });

  handle(IPC.secureDelete, (_event, key: unknown) => {
    if (typeof key === 'string') secureDelete(key);
  });

  handle(IPC.companionStatus, () => companionStatus());
  handle(IPC.cacheRead, (_event, userId: unknown) => readEncryptedCache(userId));
  handle(IPC.cacheWrite, (_event, userId: unknown, value: unknown) => writeEncryptedCache(userId, value));
  handle(IPC.cacheClear, (_event, userId: unknown) => clearEncryptedCache(userId));
  handle(IPC.cacheInfo, (_event, userId: unknown) => encryptedCacheInfo(userId));
  // The main process decides where credentials and local data are sent.
  handle(IPC.instagramLogin, (_event, request: unknown) => startInstagramLogin(withConfiguredApiUrl(request)));
  handle(IPC.imessageSend, (_event, request: unknown) => sendIMessage(request));
  handle(IPC.openSystemSettings, (_event, section: unknown) => openCompanionSettings(section));
  handle(IPC.configurePush, (_event, request: unknown) => configurePushHelper(withConfiguredApiUrl(request)));
  handle(IPC.configureCompanion, (_event, request: unknown) => configureIMessageSync(withConfiguredApiUrl(request)));
}
