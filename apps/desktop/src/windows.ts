import { BrowserWindow, shell, type WebContents } from 'electron';
import path from 'node:path';
import { appConfig } from './app-config';
import { APP_NAME, channelIconPath, IS_DEV } from './channel';
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

/**
 * `scheme://host[:port]` of a URL. Node's URL reports an opaque "null" origin
 * for schemes it does not know, such as `claire-app:`, so compare this instead.
 */
function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.host ? `${parsed.protocol}//${parsed.host}` : null;
  } catch {
    return null;
  }
}

const RENDERER_URL_ORIGIN = originOf(DEV_SERVER_URL ?? RENDERER_ORIGIN);

/** True only for Claire's own renderer (the bundle, or the dev server in development). */
export function isRendererUrl(url: string | undefined | null): boolean {
  return Boolean(url && RENDERER_URL_ORIGIN && originOf(url) === RENDERER_URL_ORIGIN);
}

/** Hand a URL to the OS only when it is an ordinary web link. */
export function openExternalWebUrl(url: string): void {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url);
  } catch {
    // Not a URL; ignore.
  }
}

export function createMainWindow(): BrowserWindow {
  const bounds = getWindowBounds();

  const window = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    // Windows and Linux read the window icon from here; macOS uses the Dock.
    icon: channelIconPath(),
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
  // DevTools only on the debug channel — a production run pointed at a dev
  // server (which is a legitimate thing to do) should not sprout an inspector.
  if (IS_DEV && DEV_SERVER_URL) window.webContents.openDevTools({ mode: 'detach' });

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
    title: APP_NAME,
    icon: channelIconPath(),
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
 *
 * Claire's windows hold the preload bridge, so they never navigate away from
 * the renderer: a link or dropped file that would replace the page opens in
 * the browser instead (web links only), or not at all.
 */
function applyLinkPolicy(window: BrowserWindow): void {
  guardNavigation(window.webContents);
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
    openExternalWebUrl(url);
    return { action: 'deny' };
  });
}

function guardNavigation(contents: WebContents): void {
  const keepInRenderer = (event: { preventDefault(): void }, url: string) => {
    if (isRendererUrl(url)) return;
    event.preventDefault();
    openExternalWebUrl(url);
  };
  contents.on('will-navigate', keepInRenderer);
  contents.on('will-redirect', keepInRenderer);
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

/** The sign-in popup may open only on the configured Supabase host, or Google's. */
export function isOAuthUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (hostname === 'accounts.google.com') return protocol === 'https:';
    if (!appConfig.supabaseHost || hostname !== appConfig.supabaseHost) return false;
    // A local Supabase stack is served over plain HTTP on loopback.
    return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
