import { Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IPC } from './shared/ipc';
import { APP_NAME, IS_DEV } from './channel';

/**
 * The Navigate menu mirrors the shortcuts the React Native macOS host already
 * documents, so muscle memory carries over. Each item pushes an expo-router
 * path rather than setting an internal destination enum — that is what keeps
 * back/forward and deep links working in both Electron and the browser.
 */
const NAVIGATION: Array<{ label: string; accelerator: string; route: string }> = [
  { label: 'Home', accelerator: 'CmdOrCtrl+1', route: '/dashboard' },
  { label: 'Inbox', accelerator: 'CmdOrCtrl+2', route: '/messages' },
  { label: 'Loops', accelerator: 'CmdOrCtrl+3', route: '/loops' },
  { label: 'People', accelerator: 'CmdOrCtrl+4', route: '/contacts' },
  { label: 'Ask Claire', accelerator: '', route: '/ask-claire' },
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
            label: APP_NAME,
            submenu: [
              { label: `About ${APP_NAME}`, role: 'about' },
              { type: 'separator' },
              {
                label: 'Claire Settings…',
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
      label: 'Claire',
      submenu: [
        {
          label: 'New Conversation',
          click: () => getWindow()?.webContents.send(IPC.focusComposer),
        },
        {
          label: 'Ask Claire',
          accelerator: 'CmdOrCtrl+K',
          click: () => send('/ask-claire'),
        },
        { type: 'separator' },
        { label: 'Connections', click: () => send('/connections') },
        { label: 'Set Up iMessage', click: () => send('/connections?platform=imessage') },
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
      label: 'Workspace',
      submenu: NAVIGATION.map(({ label, accelerator, route }) => ({
        label,
        accelerator,
        click: () => send(route),
      })),
    },
    {
      label: 'Conversation',
      submenu: [
        {
          label: 'Focus Composer',
          accelerator: 'CmdOrCtrl+N',
          click: () => getWindow()?.webContents.send(IPC.focusComposer),
        },
        {
          label: 'Open Conversation in New Window',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => {
            const chatId = getActiveConversationId();
            if (chatId) openConversationWindow(chatId);
          },
        },
        { type: 'separator' },
        { label: 'Search Messages', accelerator: 'CmdOrCtrl+F', click: () => send('/search') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        ...(IS_DEV ? ([{ role: 'toggleDevTools' }] as MenuItemConstructorOptions[]) : []),
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
        {
          label: 'Report an Issue',
          click: () => { void shell.openExternal('https://github.com/l2succes/claire/issues'); },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
