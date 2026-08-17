import { colors, fonts, radius, space, type } from '../../../packages/design-system/src/tokens';
import { clampDesktopPaneWidth, desktopWrapGridMetrics, destinationForDesktopCommand } from '../src/services/desktop-navigation';
import { mergeChronologicalMessages } from '../src/services/message-sync';

test('desktop consumes the shared Claire design language', () => {
  expect(colors.ink).toBe('#10120F');
  expect(colors.lime).toBe('#DFFF64');
  expect(colors.infoBorder).toBe('#B6D6FA');
  expect(colors.successSurface).toBe('#DDF5E5');
  expect(radius.card).toBe(20);
  expect(space[4]).toBe(16);
  expect(fonts.sans).toBe('Inter');
  expect(fonts.mono).toBe('DM Mono');
  expect(type.display.fontFamily).toBe(fonts.sans);
  expect(type.monoLabel.fontFamily).toBe(fonts.mono);
  expect(type.display.fontSize).toBeGreaterThan(type.screenTitle.fontSize);
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
  expect(destinationForDesktopCommand('loops')).toBe('Loops');
  // A native binary built before the rename still sends the old command.
  expect(destinationForDesktopCommand('promises' as never)).toBe('Loops');
  expect(destinationForDesktopCommand('people')).toBe('People');
  expect(destinationForDesktopCommand('search')).toBe('Search');
  expect(destinationForDesktopCommand('settings')).toBe('Settings');
  expect(destinationForDesktopCommand('compose')).toBe('Inbox');
  expect(destinationForDesktopCommand('compact')).toBe('Inbox');
});

test('wrap grids use measured columns instead of flexBasis', () => {
  expect(desktopWrapGridMetrics(0, 4)).toEqual({ columns: 1, itemWidth: 0 });
  expect(desktopWrapGridMetrics(980, 4, 300, 12)).toEqual({ columns: 3, itemWidth: (980 - 24) / 3 });
  expect(desktopWrapGridMetrics(640, 4, 300, 12)).toEqual({ columns: 2, itemWidth: (640 - 12) / 2 });
  expect(desktopWrapGridMetrics(280, 4, 300, 12)).toEqual({ columns: 1, itemWidth: 280 });
});

test('desktop pane widths are bounded before persisting', () => {
  expect(clampDesktopPaneWidth(120, 'conversation')).toBe(300);
  expect(clampDesktopPaneWidth(334.6, 'conversation')).toBe(335);
  expect(clampDesktopPaneWidth(900, 'conversation')).toBe(460);
  expect(clampDesktopPaneWidth(210, 'inspector')).toBe(280);
  expect(clampDesktopPaneWidth(360, 'inspector')).toBe(360);
  expect(clampDesktopPaneWidth(800, 'inspector')).toBe(420);
});
