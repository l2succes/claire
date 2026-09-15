import { describe, expect, it } from 'bun:test';
import { Platform } from '../adapters/types';
import { isWhatsAppStatusUpdate } from './whatsapp-status';

describe('isWhatsAppStatusUpdate', () => {
  it('recognizes every status signal used by direct and Matrix bridges', () => {
    expect(isWhatsAppStatusUpdate({
      platform: Platform.WHATSAPP,
      chatId: 'a-contact',
      platformMetadata: { isStatus: true },
    })).toBe(true);
    expect(isWhatsAppStatusUpdate({
      platform: Platform.WHATSAPP,
      chatId: 'status@broadcast',
    })).toBe(true);
    expect(isWhatsAppStatusUpdate({
      platform: Platform.WHATSAPP,
      chatId: '!matrix-room:claire.local',
      chatName: 'WhatsApp Status Broadcast',
    })).toBe(true);
    expect(isWhatsAppStatusUpdate({
      platform: Platform.WHATSAPP,
      chatId: '!matrix-room:claire.local',
      chatName: 'WhatsApp Status Updates',
    })).toBe(true);
  });

  it('does not suppress normal WhatsApp or similarly named non-WhatsApp chats', () => {
    expect(isWhatsAppStatusUpdate({
      platform: Platform.WHATSAPP,
      chatId: '15551234567@s.whatsapp.net',
      chatName: 'Status team',
    })).toBe(false);
    expect(isWhatsAppStatusUpdate({
      platform: Platform.TELEGRAM,
      chatId: 'status@broadcast',
      chatName: 'WhatsApp Status Broadcast',
    })).toBe(false);
  });
});
