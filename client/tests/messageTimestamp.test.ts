import { formatInboxTimestamp } from '../utils/messageTimestamp';

describe('formatInboxTimestamp', () => {
  const locale = 'en-US';

  it('shows the time of day for messages from the same local day', () => {
    const now = new Date(2026, 3, 23, 14, 35);
    const messageTime = new Date(2026, 3, 23, 9, 5);

    expect(formatInboxTimestamp(messageTime, { now, locale })).toBe(
      new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(messageTime)
    );
  });

  it('shows Yesterday for messages from the previous local day', () => {
    const now = new Date(2026, 3, 23, 14, 35);
    const messageTime = new Date(2026, 3, 22, 23, 55);

    expect(formatInboxTimestamp(messageTime, { now, locale })).toBe('Yesterday');
  });

  it('shows the short weekday for messages between two and six days old', () => {
    const now = new Date(2026, 3, 23, 14, 35);
    const messageTime = new Date(2026, 3, 20, 18, 20);

    expect(formatInboxTimestamp(messageTime, { now, locale })).toBe(
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(messageTime)
    );
  });

  it('shows the short date for messages at least seven days old', () => {
    const now = new Date(2026, 3, 23, 14, 35);
    const messageTime = new Date(2026, 3, 16, 8, 0);

    expect(formatInboxTimestamp(messageTime, { now, locale })).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(messageTime)
    );
  });

  it('uses local calendar boundaries around midnight', () => {
    const now = new Date(2026, 3, 23, 0, 15);
    const messageTime = new Date(2026, 3, 22, 23, 50);

    expect(formatInboxTimestamp(messageTime, { now, locale })).toBe('Yesterday');
  });
});
