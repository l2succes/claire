import { describe, expect, it } from 'bun:test';

import { buildParticipants } from '../../../src/services/loops/loop-detector';
import type { LoopContext } from '../../../src/services/loops/loop-context';

const context = {
  roster: [
    { identityKey: 'self', displayName: 'Luc Succes', contactId: null, isSelf: true },
    { identityKey: 'maya', displayName: 'Maya', contactId: 'maya-id', isSelf: false },
  ],
} as LoopContext;

describe('buildParticipants', () => {
  it('does not label the user as the owner when the counterparty owes the next move', () => {
    const participants = buildParticipants(['Luc Succes', 'Maya'], context, 'them', 'Luc Succes');

    expect(participants.find((participant) => participant.isSelf)?.role).toBe('counterparty');
  });

  it('uses the structured owner direction when the user owes the next move', () => {
    const participants = buildParticipants(['Luc Succes', 'Maya'], context, 'me', null);

    expect(participants.find((participant) => participant.isSelf)?.role).toBe('owner');
  });
});
