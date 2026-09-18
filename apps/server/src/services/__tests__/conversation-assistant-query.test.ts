import { describe, expect, it } from 'bun:test';
import { planAssistantQuery } from '../conversation-assistant-query';

describe('planAssistantQuery', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  it('turns recent identity lookup into a bounded people search', () => {
    const plan = planAssistantQuery("Who's the girl I was talking about who was Russian in the past couple of days?", now);
    expect(plan.intent).toBe('people');
    expect(plan.needsPeopleMemory).toBe(true);
    expect(plan.lexicalQuery).toContain('rusa');
    expect(plan.rangeStart).toBe('2026-09-05T12:00:00.000Z');
  });

  it('resolves an unqualified upcoming Saturday for plan recall', () => {
    const plan = planAssistantQuery('I think I made plans on Saturday but I do not remember with whom', now);
    expect(plan.intent).toBe('plans');
    expect(plan.needsPlanMemory).toBe(true);
    expect(plan.lexicalQuery).toBe('Saturday OR sábado OR sabado');
    expect(plan.rangeStart?.slice(0, 10)).toBe('2026-09-12');
    expect(plan.rangeEnd?.slice(0, 10)).toBe('2026-09-13');
    expect(plan.messageRangeStart).toBeNull();
  });

  it('adds location aliases for relationship discovery', () => {
    const plan = planAssistantQuery('Who do I know who is based in Mexico City?', now);
    expect(plan.lexicalQuery).toContain('CDMX');
    expect(plan.lexicalQuery).toContain('Ciudad de México');
  });
});
