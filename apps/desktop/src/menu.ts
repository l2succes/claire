import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC } from './shared/ipc';

/**
 * The Navigate menu mirrors the shortcuts the React Native macOS host already
 * documents, so muscle memory carries over. Each item pushes an expo-router
 * path rather than setting an internal destination enum — that is what keeps
 * back/forward and deep links working in both Electron and the browser.
 */
const NAVIGATION: Array<{ label: string; accelerator: string; route: string }> = [
  { label: 'Home', accelerator: 'CmdOrCtrl+1', route: '/' },
  { label: 'Inbox', accelerator: 'CmdOrCtrl+2', route: '/dashboard' },
  { label: 'Promises', accelerator: 'CmdOrCtrl+3', route: '/promises' },
  { label: 'People', accelerator: 'CmdOrCtrl+4', route: '/people' },
  { label: 'Ask Claire', accelerator: 'CmdOrCtrl+K', route: '/assistant' },
  { label: 'Settings', accelerator: 'CmdOrCtrl+,', route: '/settings' },
];

export function buildApplicationMenu({
  getWindow,
  getActiveConversationId,
  openConversationWindow,
}: {
  getWindow: () => BrowserWindow | null;
  getActiveConversationId: () => string | null;
  openConversationWindow: (chatId: string) => void;
}): void {
  const send = (route: string) => {
    getWindow()?.webContents.send(IPC.navigate, route);
  };

  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: () => send('/settings'),
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Message',
          accelerator: 'CmdOrCtrl+N',
          click: () => getWindow()?.webContents.send(IPC.focusComposer),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Navigate',
      submenu: NAVIGATION.map(({ label, accelerator, route }) => ({
        label,
        accelerator,
        click: () => send(route),
      })),
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Open Conversation in New Window',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            const chatId = getActiveConversationId();
            // Nothing to detach when no conversation is on screen.
            if (chatId) openConversationWindow(chatId);
          },
        },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }] as MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as MenuItemConstructorOptions[])),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Claire Documentation',
          click: () => {
            void shell.openExternal('https://github.com/l2succes/claire');
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
