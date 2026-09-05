import { Menu, Tray, type BrowserWindow, nativeImage } from 'electron';
import { channelIconPath } from './channel';
import { IPC } from './shared/ipc';

let tray: Tray | null = null;

/** A persistent status affordance replaces the old macOS menu-bar companion. */
export function createStatusTray(getWindow: () => BrowserWindow | null): Tray | null {
  if (tray) return tray;
  const icon = nativeImage.createFromPath(channelIconPath());
  if (icon.isEmpty()) return null;
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('Claire');
  const show = () => {
    const window = getWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Claire', click: show },
    { label: 'Inbox', click: () => { show(); getWindow()?.webContents.send(IPC.navigate, '/messages'); } },
    { label: 'Connections', click: () => { show(); getWindow()?.webContents.send(IPC.navigate, '/connections'); } },
    { type: 'separator' },
    { label: 'Quit Claire', click: () => { const { app } = require('electron') as typeof import('electron'); app.quit(); } },
  ]));
  tray.on('click', show);
  return tray;
}
