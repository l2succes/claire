import { describe, expect, it } from 'bun:test';
import { clientCapabilities } from './platforms';
import type { PlatformCapabilities } from '../adapters';

const capabilities = (over: Partial<PlatformCapabilities> = {}): PlatformCapabilities => ({
  canSendText: true,
  canSendMedia: true,
  canSendStickers: true,
  canSendVoice: true,
  canSendLocation: true,
  canCreateGroups: true,
  canReadReceipts: true,
  canEditMessages: false,
  canDeleteMessages: true,
  canReactToMessages: true,
  canReplyToMessages: true,
  maxMessageLength: 4096,
  supportedMediaTypes: [],
  ...over,
});

const adapter = (over: Partial<PlatformCapabilities> = {}) => ({
  capabilities: capabilities(over),
  sendReaction: () => undefined,
});

/** An adapter that declares the capability but never implements the method. */
const adapterWithoutSendReaction = (over: Partial<PlatformCapabilities> = {}) => ({
  capabilities: capabilities(over),
});

describe('clientCapabilities', () => {
  it('exposes canReactToMessages under the name the clients actually read', () => {
    // The whole reaction feature was invisible because the adapter shape was
    // returned verbatim: the client reads capabilities.canSendReactions, which
    // was always undefined, so the picker treated every platform as incapable.
    expect(clientCapabilities(adapter({ canReactToMessages: true })).canSendReactions).toBe(true);
    expect(clientCapabilities(adapter({ canReactToMessages: false })).canSendReactions).toBe(false);
  });

  it('does not advertise reactions when the adapter cannot actually send one', () => {
    // The endpoint gates on canReactToMessages AND sendReaction. Advertising
    // the capability without the method would offer a picker whose every tap
    // comes back 400.
    expect(
      clientCapabilities(adapterWithoutSendReaction({ canReactToMessages: true })).canSendReactions,
    ).toBe(false);
  });

  it('does not leak the internal capability names onto the wire', () => {
    const wire = clientCapabilities(adapter()) as Record<string, unknown>;
    for (const internalOnly of ['canReactToMessages', 'canCreateGroups', 'canSendLocation', 'maxMessageLength', 'supportedMediaTypes']) {
      expect(internalOnly in wire).toBe(false);
    }
  });

  it('emits exactly the fields the client contract declares', () => {
    // Guards the drift in both directions: a field added on the client without
    // a mapping here, or one removed here while the client still reads it.
    expect(Object.keys(clientCapabilities(adapter())).sort()).toEqual([
      'canDeleteMessages',
      'canEditMessages',
      'canReadReceipts',
      'canReplyToMessages',
      'canSendMedia',
      'canSendReactions',
      'canSendStickers',
      'canSendText',
      'canSendVoice',
      'supportsBroadcasts',
      'supportsGroups',
    ]);
  });

  it('carries the reply capability through unchanged', () => {
    // Reply was the control case: it worked only because both sides spell it
    // the same way. Keep it that way.
    expect(clientCapabilities(adapter({ canReplyToMessages: false })).canReplyToMessages).toBe(false);
  });
});
