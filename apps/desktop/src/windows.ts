import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { getWindowBounds, saveWindowBounds } from './preferences';
import { RENDERER_ORIGIN } from './protocol';
import { isSecureStorageAvailable } from './secure-store';

/**
 * Window creation, shared by the main window and the detached conversation
 * windows that ⌘⇧M opens.
 */

const DEV_SERVER_URL = process.env.CLAIRE_DEV_SERVER_URL;

/** The macOS host used this floor; below it the composer and header collide. */
const CONVERSATION_MIN = { width: 360, height: 460 };

export const SECURE_STORAGE_FLAG = '--claire-secure-storage';

function webPreferences() {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    // A sandboxed preload cannot call safeStorage itself, so the answer is
    // passed in here. `additionalArguments` is what reaches the renderer's
    // process.argv — app.commandLine.appendSwitch only affects Chromium's own
    // command line, which the preload never sees.
    additionalArguments: isSecureStorageAvailable() ? [SECURE_STORAGE_FLAG] : [],
  };
}

/** Resolve a renderer route to a loadable URL in dev or packaged mode. */
export function rendererUrl(route = '/'): string {
  const base = DEV_SERVER_URL ?? RENDERER_ORIGIN;
  return `${base}${route}`;
}

export function createMainWindow(): BrowserWindow {
  const bounds = getWindowBounds();

  const window = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#F4F1EA',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 18 } : undefined,
    webPreferences: webPreferences(),
  });

  window.once('ready-to-show', () => window.show());
  window.on('close', () => {
    if (window.isDestroyed()) return;
    const { width, height, x, y } = window.getNormalBounds();
    saveWindowBounds({ width, height, x, y });
  });

  applyLinkPolicy(window);
  void window.loadURL(rendererUrl('/'));
  if (DEV_SERVER_URL) window.webContents.openDevTools({ mode: 'detach' });

  return window;
}

const conversationWindows = new Map<string, BrowserWindow>();

/**
 * Open one conversation in its own window.
 *
 * Re-focuses an existing window for the same conversation rather than opening
 * a duplicate — two windows showing the same thread would both be receiving
 * realtime updates and racing each other's read cursor.
 */
export function openConversationWindow(chatId: string): BrowserWindow {
  const existing = conversationWindows.get(chatId);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.focus();
    return existing;
  }

  const window = new BrowserWindow({
    width: 420,
    height: 640,
    minWidth: CONVERSATION_MIN.width,
    minHeight: CONVERSATION_MIN.height,
    show: false,
    backgroundColor: '#F4F1EA',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: webPreferences(),
  });

  window.once('ready-to-show', () => window.show());
  window.on('closed', () => conversationWindows.delete(chatId));

  applyLinkPolicy(window);
  void window.loadURL(rendererUrl(`/chat/${encodeURIComponent(chatId)}`));
  conversationWindows.set(chatId, window);

  return window;
}

/**
 * External links open in the user's real browser. The exception is the
 * Supabase OAuth popup, which has to stay in-app to complete sign-in.
 */
function applyLinkPolicy(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isOAuthUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 700,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
        },
      };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function isOAuthUrl(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return (
      hostname.endsWith('supabase.co') ||
      hostname.endsWith('supabase.in') ||
      hostname === 'accounts.google.com' ||
      pathname.includes('/auth/v1/authorize')
    );
  } catch {
    return false;
  }
}
