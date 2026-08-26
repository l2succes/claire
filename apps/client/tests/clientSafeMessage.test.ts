import {
  clientSafeMessage,
  GENERIC_REQUEST_ERROR,
  GENERIC_SERVER_ERROR,
  type FailedRequest,
} from '../services/api-errors';

const failure = (status: number | undefined, body?: { error?: string; message?: string }): FailedRequest => ({
  response: status === undefined ? undefined : { status, data: body ?? {} },
});

describe('clientSafeMessage', () => {
  it('never surfaces a 5xx body, however specific it looks', () => {
    // The exact string that reached the chat composer during reaction testing.
    const leak =
      'duplicate key value violates unique constraint "message_reactions_user_id_message_id_reactor_id_emoji_key"';
    const shown = clientSafeMessage(failure(500, { error: leak }));
    expect(shown).not.toContain('duplicate key');
    expect(shown).not.toContain('message_reactions');
    expect(shown).toBe(GENERIC_SERVER_ERROR);
  });

  it('suppresses 5xx detail even when the server used the message field', () => {
    expect(clientSafeMessage(failure(503, { message: 'ECONNREFUSED 10.0.0.4:5432' }))).not.toContain(
      'ECONNREFUSED',
    );
  });

  it('relays a 4xx body, which the server wrote for the person', () => {
    expect(clientSafeMessage(failure(400, { error: 'Session not connected' }))).toBe(
      'Session not connected',
    );
    expect(clientSafeMessage(failure(404, { error: 'Conversation not found' }))).toBe(
      'Conversation not found',
    );
  });

  it('falls back when a 4xx carries no body', () => {
    expect(clientSafeMessage(failure(400))).toBe(GENERIC_REQUEST_ERROR);
  });

  it('explains a request that never reached the server', () => {
    expect(clientSafeMessage(failure(undefined))).toContain('Check your connection');
  });
});
