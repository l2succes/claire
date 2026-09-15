/**
 * Dead-end contacts.
 *
 * The failure mode that matters is a false positive: hiding somebody the user
 * was actually looking for. So most of these pin what must *survive* the
 * filter, not what it removes.
 */
import { isDeadEndContact } from '../services/contact-display';
import { Platform } from '../types/platform';

const residue = {
  name: 'A',
  phone_number: null,
  username: null,
  platform: Platform.WHATSAPP,
  is_group: false,
  chat: null,
};

describe('isDeadEndContact — what it removes', () => {
  it('removes a single-letter WhatsApp contact with nothing else', () => {
    expect(isDeadEndContact(residue)).toBe(true);
  });

  it('removes one with no name at all', () => {
    expect(isDeadEndContact({ ...residue, name: null })).toBe(true);
    expect(isDeadEndContact({ ...residue, name: '   ' })).toBe(true);
  });

  it('removes one whose only name is a bridge LID', () => {
    expect(isDeadEndContact({ ...residue, name: '123456789012345@lid' })).toBe(true);
  });

  it('removes a single-emoji name with no other identity', () => {
    expect(isDeadEndContact({ ...residue, name: '🙂' })).toBe(true);
  });

  it('applies on every platform, not just WhatsApp', () => {
    // Only WhatsApp's bridge produces these in practice, but the rule is about
    // identity rather than platform. Pinned so it reads as a decision.
    expect(isDeadEndContact({ ...residue, platform: Platform.TELEGRAM })).toBe(true);
  });
});

describe('isDeadEndContact — what it must keep', () => {
  it('keeps anyone with a phone number', () => {
    expect(isDeadEndContact({ ...residue, phone_number: '+15551234567' })).toBe(false);
  });

  it('keeps anyone with a username', () => {
    expect(isDeadEndContact({ ...residue, username: '@ada' })).toBe(false);
  });

  it('keeps anyone with a real conversation, however useless the name', () => {
    // The chat is somewhere to go, which is the whole test: the row leads
    // somewhere even though it identifies nobody.
    expect(isDeadEndContact({ ...residue, chat: { id: 'chat-1' } })).toBe(false);
  });

  it('keeps a two-character name', () => {
    // "Jo" and "Al" are real names. The rule bites at one character only.
    expect(isDeadEndContact({ ...residue, name: 'Jo' })).toBe(false);
  });

  it('keeps a name built from several code points', () => {
    // A ZWJ emoji counts as more than one code point and is kept. Erring
    // toward showing the row is the correct direction for this filter.
    expect(isDeadEndContact({ ...residue, name: '👨‍👩‍👧' })).toBe(false);
  });

  it('keeps groups', () => {
    expect(isDeadEndContact({ ...residue, is_group: true })).toBe(false);
  });

  it('keeps someone whose inferred name identifies them', () => {
    // `name` wins for display, so judging on it alone would hide a contact
    // Claire has actually worked out the identity of.
    expect(isDeadEndContact({ ...residue, name: 'A', inferred_name: 'Ada Lovelace' })).toBe(false);
  });

  it('keeps an ordinary name with no other identity', () => {
    // No number, no username, no chat — but a name you could recognise, which
    // is enough for the row to be worth showing.
    expect(isDeadEndContact({ ...residue, name: 'Ada Lovelace' })).toBe(false);
  });
});
