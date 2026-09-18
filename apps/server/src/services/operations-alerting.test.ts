import { describe, expect, it } from 'bun:test';
import { shouldAlertOperationsIncident } from './operations-alerting';

const nowMs = new Date('2026-09-15T12:00:00.000Z').getTime();

describe('shouldAlertOperationsIncident', () => {
  it('alerts when an incident opens or materially changes', () => {
    expect(shouldAlertOperationsIncident({ isNew: true, severity: 'warning', title: 'One connection needs a decision', nowMs })).toBe(true);
    expect(shouldAlertOperationsIncident({
      isNew: false,
      severity: 'warning',
      title: 'Two connections need a decision',
      previousSeverity: 'warning',
      previousTitle: 'One connection needs a decision',
      lastAlertedAt: '2026-09-15T11:50:00.000Z',
      nowMs,
    })).toBe(true);
  });

  it('does not repeat an unchanged warning', () => {
    expect(shouldAlertOperationsIncident({
      isNew: false,
      severity: 'warning',
      title: 'One connection needs a decision',
      previousSeverity: 'warning',
      previousTitle: 'One connection needs a decision',
      lastAlertedAt: '2026-09-01T00:00:00.000Z',
      nowMs,
    })).toBe(false);
  });

  it('reminds once per day for an unchanged critical incident', () => {
    expect(shouldAlertOperationsIncident({
      isNew: false,
      severity: 'critical',
      title: 'No active bridge is connected',
      previousSeverity: 'critical',
      previousTitle: 'No active bridge is connected',
      lastAlertedAt: '2026-09-14T11:59:00.000Z',
      nowMs,
    })).toBe(true);
  });
});

