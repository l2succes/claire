import { colors, radius, space } from '../../../packages/design-system/src/tokens';
import { clampDesktopPaneWidth, destinationForDesktopCommand } from '../src/services/desktop-navigation';
import { mergeChronologicalMessages } from '../src/services/message-sync';

test('desktop consumes the shared Claire design language', () => {
  expect(colors.ink).toBe('#10120F');
  expect(colors.lime).toBe('#DFFF64');
  expect(colors.infoBorder).toBe('#B6D6FA');
  expect(colors.successSurface).toBe('#DDF5E5');
  expect(radius.card).toBe(20);
  expect(space[4]).toBe(16);
});

test('background message refreshes preserve loaded history and replace stale rows', () => {
  const current = [
    { id: 'one', content: 'earlier', timestamp: '2026-08-14T10:00:00.000Z', from_me: false },
    { id: 'two', content: 'stale', timestamp: '2026-08-14T10:02:00.000Z', from_me: true },
  ];
  const incoming = [
    { id: 'two', content: 'updated', timestamp: '2026-08-14T10:02:00.000Z', from_me: true },
    { id: 'three', content: 'new', timestamp: '2026-08-14T10:04:00.000Z', from_me: false },
  ];

  expect(mergeChronologicalMessages(current, incoming)).toEqual([
    current[0],
    incoming[0],
    incoming[1],
  ]);
});

test('native desktop commands have stable workspace destinations', () => {
  expect(destinationForDesktopCommand('home')).toBe('Home');
  expect(destinationForDesktopCommand('inbox')).toBe('Inbox');
  expect(destinationForDesktopCommand('promises')).toBe('Promises');
  expect(destinationForDesktopCommand('people')).toBe('People');
  expect(destinationForDesktopCommand('search')).toBe('Search');
  expect(destinationForDesktopCommand('settings')).toBe('Settings');
  expect(destinationForDesktopCommand('compose')).toBe('Inbox');
  expect(destinationForDesktopCommand('compact')).toBe('Inbox');
});

test('desktop pane widths are bounded before persisting', () => {
  expect(clampDesktopPaneWidth(120, 'conversation')).toBe(300);
  expect(clampDesktopPaneWidth(334.6, 'conversation')).toBe(335);
  expect(clampDesktopPaneWidth(900, 'conversation')).toBe(460);
  expect(clampDesktopPaneWidth(210, 'inspector')).toBe(280);
  expect(clampDesktopPaneWidth(360, 'inspector')).toBe(360);
  expect(clampDesktopPaneWidth(800, 'inspector')).toBe(420);
});
