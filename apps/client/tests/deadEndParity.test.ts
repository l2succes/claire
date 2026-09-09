/**
 * Server/client agreement on hiding a contact.
 *
 * Two rules now decide this: the `is_dead_end` expression in the
 * people_directory view, and isDeadEndContact on the client. They are
 * deliberately not identical — the view only encodes the cheap, unambiguous
 * part, because it cannot see bridge LIDs, privacy masks, or chat-envelope
 * names the way the display layer can.
 *
 * What must hold is the direction: anything the VIEW hides, the CLIENT would
 * also hide. Break that and a real person disappears from People with no way
 * for the user to get them back — the server dropped them before the client
 * ever had an opinion.
 *
 * The `serverHides` values below are the actual output of the view, captured
 * from the migration running against supabase/postgres with these rows.
 */
import { isDeadEndContact } from '../services/contact-display';
import { Platform } from '../types/platform';

/** Mirrors what routes/contacts.ts synthesizes before the client sees a row. */
function asApiContact(row: {
  name?: string | null;
  inferred_name?: string | null;
  phone_number?: string | null;
  username?: string | null;
  platform_contact_id?: string | null;
  is_group?: boolean;
  hasChat?: boolean;
}) {
  const local = (row.platform_contact_id || '').split('@')[0];
  const derived = /^\+?\d{7,15}$/.test(local) && !/^lid[-:]?\d+$/i.test(local) ? local : null;
  return {
    name: row.name ?? null,
    inferred_name: row.inferred_name ?? null,
    phone_number: row.phone_number ?? derived,
    username: row.username ?? null,
    platform: Platform.WHATSAPP,
    is_group: row.is_group ?? false,
    chat: row.hasChat ? { id: 'chat-1' } : null,
  };
}

const cases: Array<{ label: string; serverHides: boolean; row: Parameters<typeof asApiContact>[0] }> = [
  { label: 'single letter, LID, nothing else', serverHides: true, row: { name: 'A', platform_contact_id: 'lid-123456789012345' } },
  { label: 'no name at all', serverHides: true, row: { platform_contact_id: 'lid-223456789012345' } },
  { label: 'whitespace in every field', serverHides: true, row: { name: '  ', inferred_name: '   ', phone_number: '   ', username: '  ', platform_contact_id: 'lid-a23456789012345' } },
  { label: 'phone derivable from a plain JID', serverHides: false, row: { name: 'A', platform_contact_id: '15551234567@s.whatsapp.net' } },
  { label: 'inferred name identifies them', serverHides: false, row: { name: 'A', inferred_name: 'Ada Lovelace', platform_contact_id: 'lid-423456789012345' } },
  { label: 'has a phone number', serverHides: false, row: { name: 'A', phone_number: '+15551110000', platform_contact_id: 'lid-523456789012345' } },
  { label: 'has a username', serverHides: false, row: { name: 'A', username: 'ada', platform_contact_id: 'tg-6' } },
  { label: 'has a conversation', serverHides: false, row: { name: 'A', platform_contact_id: 'lid-723456789012345', hasChat: true } },
  { label: 'two-character name', serverHides: false, row: { name: 'Jo', platform_contact_id: 'lid-823456789012345' } },
  { label: 'group', serverHides: false, row: { name: 'A', is_group: true, platform_contact_id: 'lid-923456789012345' } },
];

describe('people_directory.is_dead_end vs isDeadEndContact', () => {
  for (const { label, serverHides, row } of cases) {
    it(`${label}: the client also hides whatever the view hides`, () => {
      if (!serverHides) return;
      expect(isDeadEndContact(asApiContact(row))).toBe(true);
    });
  }

  it('never lets the view be the stricter of the two', () => {
    // The single assertion this file exists for, stated once over every case.
    const violations = cases.filter(
      ({ serverHides, row }) => serverHides && !isDeadEndContact(asApiContact(row)),
    );
    expect(violations.map((violation) => violation.label)).toEqual([]);
  });

  it('lets the client be stricter, which is the safe direction', () => {
    // A LID-named contact survives the view (it has no LID vocabulary) and is
    // caught by the client. That asymmetry is intended, not a gap.
    const lidNamed = asApiContact({ name: '123456789012345@lid', platform_contact_id: 'lid-b23456789012345' });
    expect(isDeadEndContact(lidNamed)).toBe(true);
  });
});
