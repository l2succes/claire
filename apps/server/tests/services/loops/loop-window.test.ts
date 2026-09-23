import { describe, expect, it } from 'bun:test';
import { boundWindowRows } from '../../../src/services/loops/loop-context';

describe('detection window progress', () => {
  it('consumes oldest pending messages before later traffic', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i, content: 'Synthetic '.repeat(50) }));
    let pending = rows;
    const consumed: number[] = [];
    while (pending.length) {
      const window = boundWindowRows(pending);
      expect(window.length).toBeGreaterThan(0);
      consumed.push(...window.map(row => row.id));
      pending = pending.slice(window.length);
    }
    expect(consumed).toEqual(rows.map(row => row.id));
  });
  it('does not acknowledge an oversized message after reading only its prefix', () => {
    const content = 'x'.repeat(9000) + ' I will send the deck tomorrow';
    expect(boundWindowRows([{ content }, { content: 'Next message' }])).toEqual([{ content }]);
  });
});
