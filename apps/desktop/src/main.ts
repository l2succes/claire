import { app, BrowserWindow, ipcMain, nativeImage, Notification, shell } from 'electron';
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
import { createMainWindow, openConversationWindow } from './windows';

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

// Both of these must run before anything else touches app paths or windows.
// applyChannelIdentity repoints userData, which the single-instance lock below
// is keyed on; the scheme privileges must be registered before the app is
// ready or the renderer origin will not be treated as secure.
applyChannelIdentity();
registerRendererSchemePrivileges();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(onReady);
}

async function onReady(): Promise<void> {
  // A packaged build gets its icon from the bundle; an unpackaged run would
  // otherwise show the stock Electron icon and be unidentifiable in the Dock.
  if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
    const icon = nativeImage.createFromPath(channelIconPath());
    if (!icon.isEmpty()) app.dock.setIcon(icon);
  }

  registerRendererProtocol(RENDERER_ROOT);
  registerIpcHandlers();
  buildApplicationMenu({
    getWindow: () => mainWindow,
    getActiveConversationId: () => activeConversationId,
    openConversationWindow,
  });

  mainWindow = createMainWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpcHandlers(): void {
  ipcMain.on(IPC.setBadgeCount, (_event, count: unknown) => {
    if (typeof count !== 'number' || !Number.isFinite(count)) return;
    const value = Math.max(0, Math.trunc(count));
    if (typeof app.setBadgeCount === 'function') app.setBadgeCount(value);
  });

  ipcMain.on(IPC.notify, (_event, payload: NotifyPayload) => {
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

  ipcMain.on(IPC.openExternal, (_event, url: unknown) => {
    if (typeof url !== 'string') return;
    // Only ever hand http(s) to the OS — never a file:// or custom scheme.
    if (!/^https?:\/\//i.test(url)) return;
    void shell.openExternal(url);
  });

  ipcMain.on(IPC.openConversationWindow, (_event, chatId: unknown) => {
    if (typeof chatId !== 'string' || !chatId) return;
    openConversationWindow(chatId);
  });

  ipcMain.on(IPC.reportActiveConversation, (_event, chatId: unknown) => {
    activeConversationId = typeof chatId === 'string' && chatId ? chatId : null;
  });

  ipcMain.handle(IPC.preferenceGet, (_event, key: unknown) =>
    typeof key === 'string' ? getPreference(key) : null,
  );

  ipcMain.handle(IPC.preferenceSet, (_event, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || typeof value !== 'string') return;
    setPreference(key, value);
  });

  ipcMain.handle(IPC.secureGet, (_event, key: unknown) =>
    typeof key === 'string' ? secureGet(key) : null,
  );

  ipcMain.handle(IPC.secureSet, (_event, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || typeof value !== 'string') return false;
    return secureSet(key, value);
  });

  ipcMain.handle(IPC.secureDelete, (_event, key: unknown) => {
    if (typeof key === 'string') secureDelete(key);
  });
}
