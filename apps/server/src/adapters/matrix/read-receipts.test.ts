import { describe, expect, it } from 'bun:test';
import { ownReadReceiptEventIds } from './read-receipts';

describe('own Matrix read receipts', () => {
  const self = ['@claire:example.org', '@whatsapp_self:example.org'];

  it('accepts only m.read from the connected account or its exact self ghost', () => {
    expect(ownReadReceiptEventIds({
      '$own': { 'm.read': { '@whatsapp_self:example.org': { ts: 1 } } },
      '$contact': { 'm.read': { '@whatsapp_contact:example.org': { ts: 2 } } },
      '$delivery': { 'm.read': { '@whatsappbot:example.org': { ts: 3 } } },
      '$private': { 'm.read.private': { '@claire:example.org': { ts: 4 } } },
    }, self)).toEqual(['$own']);
  });

  it('ignores malformed or unrelated receipts', () => {
    expect(ownReadReceiptEventIds(null, self)).toEqual([]);
    expect(ownReadReceiptEventIds({ '$bad': { 'm.read': null }, 'not-an-event': { 'm.read': { '@claire:example.org': {} } } }, self)).toEqual([]);
  });
});
