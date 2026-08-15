import { describe, expect, test } from 'bun:test';
import { Platform } from '../adapters/types';
import { incomingContactId } from './contact-identity';

describe('incoming contact identity', () => {
  test('keeps a direct Mac iMessage phone handle', () => {
    expect(incomingContactId({ platform: Platform.IMESSAGE, isFromMe: false, senderId: '+15165551212' })).toBe('+15165551212');
  });

  test('does not turn the local iMessage account into a contact', () => {
    expect(incomingContactId({ platform: Platform.IMESSAGE, isFromMe: true, senderId: 'me' })).toBeNull();
  });

  test('continues to map a Matrix ghost to its platform identifier', () => {
    expect(incomingContactId({ platform: Platform.WHATSAPP, isFromMe: false, senderId: '@whatsapp_15165551212:claire.local' })).toBe('15165551212');
  });
});
