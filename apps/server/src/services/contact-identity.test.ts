import { describe, expect, test } from 'bun:test';
import { Platform } from '../adapters/types';
import {
  displayNameFromBridge,
  incomingContactId,
  isMeaningfulContactName,
  isOpaqueWhatsAppLid,
  isRedactedPhoneFallback,
  phoneNumberFromBridgeIdentifiers,
  phoneNumberFromPlatformContactId,
} from './contact-identity';
import { whatsappContactKeys } from './whatsapp-contact-backfill';

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

  test('does not turn WhatsApp privacy-masked numbers into names', () => {
    expect(isRedactedPhoneFallback('+1••••••04')).toBe(true);
    expect(isRedactedPhoneFallback('+1∙∙∙∙∙∙∙∙04')).toBe(true);
    expect(
      displayNameFromBridge('+1••••••04', Platform.WHATSAPP, 'lid-192204836479059')
    ).toBeNull();
    expect(
      displayNameFromBridge('+1••••••04 (WA)', Platform.WHATSAPP, 'lid-192204836479059')
    ).toBeNull();
  });

  test('moves mautrix phone display fallbacks into contact detail, not a name', () => {
    expect(
      displayNameFromBridge('+1 516 555 1212 (WA)', Platform.WHATSAPP, 'lid-192204836479059')
    ).toBeNull();
    expect(phoneNumberFromBridgeIdentifiers(['+1 516 555 1212 (WA)'])).toBe('+15165551212');
  });

  test('does not treat bridge punctuation as a person name', () => {
    expect(isMeaningfulContactName('.')).toBe(false);
    expect(displayNameFromBridge('.', Platform.WHATSAPP, 'lid-192204836479059')).toBeNull();
    expect(displayNameFromBridge('🌹', Platform.WHATSAPP, 'lid-192204836479059')).toBe('🌹');
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

describe('WhatsApp directory identity matching', () => {
  test('matches Matrix ghost, LID, and bare identifiers without treating LIDs as numbers', () => {
    expect(whatsappContactKeys('@whatsapp_lid-192204836479059:claire.local')).toContain('lid-192204836479059');
    expect(whatsappContactKeys('15165551212@s.whatsapp.net')).toEqual(expect.arrayContaining([
      '15165551212',
      '+15165551212',
    ]));
    expect(whatsappContactKeys('lid-192204836479059')).not.toContain('+192204836479059');
    expect(whatsappContactKeys('192204836479059')).toContain('lid-192204836479059');
  });
});
