import { describe, expect, it } from 'bun:test';
import { classifyMessageFreshness } from './operations-health';

describe('classifyMessageFreshness', () => {
  it('is healthy when the current window has traffic', () => {
    expect(classifyMessageFreshness(3, 5, 120).status).toBe('healthy');
  });

  it('opens a critical signal only after traffic has stopped', () => {
    expect(classifyMessageFreshness(0, 4, 120).status).toBe('critical');
  });

  it('does not alert merely because an account is quiet', () => {
    expect(classifyMessageFreshness(0, 0, 120).status).toBe('unknown');
  });
});
