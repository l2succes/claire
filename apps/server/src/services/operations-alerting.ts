export type OperationsAlertSeverity = 'warning' | 'critical';

const CRITICAL_REMINDER_MS = 24 * 60 * 60_000;

export function shouldAlertOperationsIncident(input: {
  isNew: boolean;
  severity: OperationsAlertSeverity;
  title: string;
  previousSeverity?: string | null;
  previousTitle?: string | null;
  lastAlertedAt?: string | null;
  nowMs?: number;
}): boolean {
  if (input.isNew) return true;
  if (input.previousSeverity !== input.severity || input.previousTitle !== input.title) return true;
  if (input.severity === 'warning') return false;

  const lastAlerted = input.lastAlertedAt ? new Date(input.lastAlertedAt).getTime() : 0;
  const now = input.nowMs ?? Date.now();
  return !Number.isFinite(lastAlerted) || now - lastAlerted >= CRITICAL_REMINDER_MS;
}

