import { app } from 'electron';
import path from 'node:path';

/**
 * Which build this is.
 *
 * The debug and production apps are meant to run at the same time, so they
 * cannot share an identity. Everything that distinguishes them follows from
 * this one value: the app name, the userData directory, and the icon.
 */
export type Channel = 'dev' | 'production';

export const CHANNEL: Channel =
  process.env.CLAIRE_DESKTOP_CHANNEL === 'dev' ? 'dev' : 'production';

export const IS_DEV = CHANNEL === 'dev';

/** "Claire Dev" is visible in the menu bar and the Dock, so it reads clearly. */
export const APP_NAME = IS_DEV ? 'Claire Dev' : 'Claire';

/**
 * Give each channel its own userData directory.
 *
 * This is what actually lets both run side by side, and it must happen before
 * anything reads a path. Electron keys the single-instance lock on userData,
 * so without this the second app to launch would simply quit. It also keeps
 * their sessions apart: signing into a debug build does not disturb the
 * production build's `localStorage`, preferences, or safeStorage entries.
 */
export function applyChannelIdentity(): void {
  app.setName(APP_NAME);
  app.setPath('userData', path.join(app.getPath('appData'), APP_NAME));
}

/**
 * The Dock/taskbar icon for an unpackaged run.
 *
 * A packaged build takes its icon from the bundle, but `electron .` shows the
 * default Electron icon unless it is set explicitly — which would make the
 * debug app indistinguishable from a stock Electron window.
 */
export function channelIconPath(): string {
  return path.join(__dirname, '..', 'build', IS_DEV ? 'icon-dev.png' : 'icon.png');
}
