/**
 * Unit tests for contact identity resolution.
 *
 * Mention resolution is load-bearing for the loops relevance model: it is what
 * answers "was I named in this group message?" on platforms where the rendered
 * text gives no usable signal (WhatsApp writes phone numbers, Slack writes
 * display names). See docs/LOOPS_REVAMP_PLAN.md §6.
 *
 * Pure functions, no mocking required.
 */

import { describe, it, expect } from 'bun:test';
import {
  incomingContactId,
  ghostToPlatformContactId,
  resolveMentions,
} from '../../src/services/contact-identity';
import { Platform } from '../../src/adapters/types';

describe('incomingContactId', () => {
  it('extracts the platform contact id from a WhatsApp ghost MXID', () => {
    expect(
      incomingContactId({
        platform: Platform.WHATSAPP,
        isFromMe: false,
        senderId: '@whatsapp_15551234567:claire.local',
      }),
    ).toBe('15551234567');
  });

  it('returns null for the user\'s own messages', () => {
    expect(
      incomingContactId({
        platform: Platform.WHATSAPP,
        isFromMe: true,
        senderId: '@whatsapp_15551234567:claire.local',
      }),
    ).toBeNull();
  });

  it('passes iMessage handles through verbatim', () => {
    expect(
      incomingContactId({
        platform: Platform.IMESSAGE,
        isFromMe: false,
        senderId: 'someone@example.com',
      }),
    ).toBe('someone@example.com');
  });
});

describe('ghostToPlatformContactId', () => {
  it.each([
    ['@whatsapp_15551234567:claire.local', '15551234567'],
    ['@_telegram_884422:claire.local', '884422'],
    ['@meta_17841400000:claire.local', '17841400000'],
    ['@_imessage_+15551234567:claire.local', '+15551234567'],
    ['@slack_U012ABCDEF:claire.local', 'U012ABCDEF'],
  ])('resolves %s', (mxid, expected) => {
    expect(ghostToPlatformContactId(mxid)).toBe(expected);
  });

  it('handles WhatsApp LID-form ghosts', () => {
    expect(ghostToPlatformContactId('@whatsapp_lid-99887766:claire.local')).toBe('lid-99887766');
  });

  it('returns null for the bridge bot and other non-ghost users', () => {
    expect(ghostToPlatformContactId('@whatsappbot:claire.local')).toBeNull();
    expect(ghostToPlatformContactId('@claire_bot:claire.local')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(ghostToPlatformContactId('')).toBeNull();
  });
});

describe('resolveMentions', () => {
  it('returns null rather than an empty array when there are no mentions', () => {
    // Null keeps the column NULL instead of storing an empty array, so
    // "has mentions" stays a simple NOT NULL check.
    expect(resolveMentions(undefined)).toBeNull();
    expect(resolveMentions([])).toBeNull();
  });

  it('resolves a mixed-platform mention list', () => {
    expect(
      resolveMentions([
        '@whatsapp_15551234567:claire.local',
        '@_telegram_884422:claire.local',
      ]),
    ).toEqual(['15551234567', '884422']);
  });

  it('drops entries that are not ghost users', () => {
    expect(
      resolveMentions(['@whatsappbot:claire.local', '@whatsapp_15551234567:claire.local']),
    ).toEqual(['15551234567']);
  });

  it('returns null when nothing in the list resolves', () => {
    expect(resolveMentions(['@whatsappbot:claire.local', '@claire_bot:claire.local'])).toBeNull();
  });

  it('de-duplicates repeated mentions of the same person', () => {
    // Bridges can list a contact twice when a message mentions them in both the
    // body and a quoted fallback.
    expect(
      resolveMentions([
        '@whatsapp_15551234567:claire.local',
        '@whatsapp_15551234567:claire.local',
      ]),
    ).toEqual(['15551234567']);
  });
});
