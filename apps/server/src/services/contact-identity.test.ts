import { describe, expect, test } from 'bun:test';
import { Platform } from '../adapters/types';
import {
  displayNameFromBridge,
  incomingContactId,
  isOpaqueWhatsAppLid,
  phoneNumberFromBridgeIdentifiers,
  phoneNumberFromPlatformContactId,
} from './contact-identity';

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

  test('treats WhatsApp LIDs as opaque identifiers, never customer data', () => {
    expect(isOpaqueWhatsAppLid('lid-192204836479059')).toBe(true);
    expect(phoneNumberFromPlatformContactId(Platform.WHATSAPP, 'lid-192204836479059')).toBeNull();
    expect(displayNameFromBridge('lid-192204836479059', Platform.WHATSAPP, 'lid-192204836479059')).toBeNull();
  });

  test('keeps a genuine bridge profile name and phone-number contact ID', () => {
    expect(displayNameFromBridge('Lucas', Platform.WHATSAPP, '15165551212')).toBe('Lucas');
    expect(phoneNumberFromPlatformContactId(Platform.WHATSAPP, '15165551212')).toBe('15165551212');
  });

  test('extracts a canonical number from trusted bridge identifiers, never an LID', () => {
    expect(
      phoneNumberFromBridgeIdentifiers([
        'lid-192204836479059',
        '15165551212@s.whatsapp.net',
      ])
    ).toBe('+15165551212');
    expect(phoneNumberFromBridgeIdentifiers(['lid-192204836479059'])).toBeNull();
  });
});
