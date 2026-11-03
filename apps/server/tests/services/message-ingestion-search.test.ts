import { describe, expect, it, mock } from 'bun:test';
import { EventEmitter } from 'events';

const filters: Array<[string, unknown]> = [];
const query: any = {
  select: () => query,
  eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
  ilike: () => query,
  order: () => query,
  limit: () => Promise.resolve({ data: [], error: null }),
};

mock.module('../../src/utils/logger', () => ({
  logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
}));
mock.module('../../src/services/supabase', () => ({ supabase: { from: () => query } }));
mock.module('../../src/services/message-queue', () => ({ messageQueue: {} }));
mock.module('../../src/auth/whatsapp-auth', () => ({ whatsappAuth: new EventEmitter() }));

import { MessageIngestionService } from '../../src/services/message-ingestion';

describe('MessageIngestionService.searchMessages', () => {
  it('excludes deleted messages and stays scoped to the user', async () => {
    await new MessageIngestionService().searchMessages('user-1', 'lease');
    expect(filters).toEqual([['user_id', 'user-1'], ['is_deleted', false]]);
  });
});
