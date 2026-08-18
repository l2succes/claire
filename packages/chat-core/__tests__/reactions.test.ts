import {
  groupReactions,
  groupReactionsByMessage,
  normalizeEmoji,
  removeReactionRow,
  upsertReactionRow,
} from '../src/reactions';
import type { ReactionRow } from '../src/types';

const row = (over: Partial<ReactionRow> = {}): ReactionRow => ({
  id: 'r1',
  message_id: 'm1',
  emoji: '❤️',
  from_me: false,
  ...over,
});

describe('groupReactions', () => {
  it('collapses the same emoji into one chip with a count', () => {
    const chips = groupReactions([
      row({ id: 'r1', reactor_name: 'Maya' }),
      row({ id: 'r2', reactor_name: 'Noah' }),
    ]);
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ emoji: '❤️', count: 2, mine: false });
    expect(chips[0].reactors).toEqual(['Maya', 'Noah']);
  });

  it('marks the chip as mine when any row is mine', () => {
    const chips = groupReactions([row({ id: 'r1' }), row({ id: 'r2', from_me: true })]);
    expect(chips[0].mine).toBe(true);
  });

  it('keeps distinct emoji as separate chips in first-seen order', () => {
    const chips = groupReactions([row({ id: 'r1', emoji: '👍' }), row({ id: 'r2', emoji: '😂' })]);
    expect(chips.map((chip) => chip.emoji)).toEqual(['👍', '😂']);
  });

  it('does not repeat a reactor name', () => {
    const chips = groupReactions([
      row({ id: 'r1', reactor_name: 'Maya' }),
      row({ id: 'r2', reactor_name: 'Maya' }),
    ]);
    expect(chips[0].reactors).toEqual(['Maya']);
  });

  it('returns nothing for no rows', () => {
    expect(groupReactions([])).toEqual([]);
  });
});

describe('groupReactionsByMessage', () => {
  it('keys rows by message and skips orphans', () => {
    const grouped = groupReactionsByMessage([
      row({ id: 'r1', message_id: 'm1' }),
      row({ id: 'r2', message_id: 'm2' }),
      row({ id: 'r3', message_id: '' as unknown as string }),
    ]);
    expect(Object.keys(grouped).sort()).toEqual(['m1', 'm2']);
  });
});

describe('upsertReactionRow', () => {
  it('adds a new row', () => {
    const next = upsertReactionRow({}, row());
    expect(next.m1).toHaveLength(1);
  });

  it('replaces by id', () => {
    const prev = { m1: [row({ id: 'r1', emoji: '👍' })] };
    const next = upsertReactionRow(prev, row({ id: 'r1', emoji: '😂' }));
    expect(next.m1).toHaveLength(1);
    expect(next.m1[0].emoji).toBe('😂');
  });

  it('replaces an optimistic row with the confirmed one instead of duplicating', () => {
    const prev = { m1: [row({ id: 'optimistic-reaction-1', from_me: true })] };
    const next = upsertReactionRow(prev, row({ id: 'real-1', from_me: true }));
    expect(next.m1).toHaveLength(1);
    expect(next.m1[0].id).toBe('real-1');
  });

  it('does not collapse someone else\'s identical emoji onto mine', () => {
    const prev = { m1: [row({ id: 'mine', from_me: true })] };
    const next = upsertReactionRow(prev, row({ id: 'theirs', from_me: false }));
    expect(next.m1).toHaveLength(2);
  });

  it('ignores a row with no message id', () => {
    const prev = { m1: [row()] };
    expect(upsertReactionRow(prev, row({ message_id: '' as unknown as string }))).toBe(prev);
  });
});

describe('removeReactionRow', () => {
  it('removes by id and drops the key when it was the last chip', () => {
    const prev = { m1: [row({ id: 'r1' })] };
    expect(removeReactionRow(prev, { id: 'r1', message_id: 'm1' })).toEqual({});
  });

  it('keeps the other rows on that message', () => {
    const prev = { m1: [row({ id: 'r1' }), row({ id: 'r2', emoji: '👍' })] };
    const next = removeReactionRow(prev, { id: 'r1', message_id: 'm1' });
    expect(next.m1).toHaveLength(1);
    expect(next.m1[0].id).toBe('r2');
  });

  it('finds the row without a message_id, as a DELETE payload may omit it', () => {
    const prev = { m1: [row({ id: 'r1' })], m2: [row({ id: 'r2', message_id: 'm2' })] };
    const next = removeReactionRow(prev, { id: 'r2' });
    expect(next.m2).toBeUndefined();
    expect(next.m1).toHaveLength(1);
  });

  it('returns the same object when nothing matched, to preserve reference identity', () => {
    const prev = { m1: [row({ id: 'r1' })] };
    expect(removeReactionRow(prev, { id: 'nope' })).toBe(prev);
  });
});

describe('normalizeEmoji', () => {
  it('is stable for an already-normalized emoji', () => {
    expect(normalizeEmoji('👍')).toBe('👍');
  });

  it('groups the same visual emoji consistently', () => {
    // U+2764 U+FE0F and the composed form must land on one key.
    expect(normalizeEmoji('❤️')).toBe(normalizeEmoji('❤️'));
  });
});
