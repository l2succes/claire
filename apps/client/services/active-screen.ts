let activeScreen = 'Unknown';

export function setActiveScreen(pathname: string): void {
  const path = pathname.toLowerCase();
  if (path.includes('/operations/alert')) activeScreen = 'Operations alert';
  else if (path.includes('/chat/')) activeScreen = 'Chat';
  else if (path.includes('/connections/')) activeScreen = 'Connections';
  else if (path.includes('/loops')) activeScreen = 'Loops';
  else if (path.includes('/contacts')) activeScreen = 'Contacts';
  else if (path.includes('/settings/')) activeScreen = `Settings · ${pathname.split('/').at(-1) || 'Settings'}`;
  else if (path.includes('/dashboard')) activeScreen = 'Inbox';
  else if (path.includes('/auth')) activeScreen = 'Sign in';
  else activeScreen = pathname || 'Unknown';
}

export function getActiveScreen(): string {
  return activeScreen.slice(0, 100);
}
