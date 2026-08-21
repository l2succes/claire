/**
 * Privacy boundary for diagnostics and operational telemetry.
 *
 * This is deliberately conservative: identifiers and free-form content are
 * useful in a debugger but do not belong in an operational log, trace, alert,
 * or crash report. Product code should still log an allowlisted error code or
 * counter when it needs a diagnosis.
 */
const SENSITIVE_KEY = /(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|cookie|credential|session|content|body|message|prompt|query|text|media|attachment|phone|email|contact|participant|event|payload)/i;
const ALLOWED_ROOT_KEYS = new Set(['message', 'level', 'timestamp', 'service', 'event', 'component', 'status', 'errorCode', 'error_code']);

export const REDACTED = '[REDACTED]';

function redactText(value: string): string {
  return value
    // OAuth, JWT, API-key, and cookie-like material.
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 ' + REDACTED)
    .replace(/\b(?:ExponentPushToken|ExpoPushToken)\[[^\]]+\]/g, REDACTED)
    .replace(/\b(?:sk|rk|pk|ya29|eyJ)[A-Za-z0-9._-]{12,}\b/g, REDACTED)
    .replace(/\b([A-Z_]*(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY|COOKIE|CREDENTIAL)[A-Z_]*)\s*[=:]\s*[^\s,;]+/gi, '$1=' + REDACTED)
    // Direct personal identifiers.
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED)
    .replace(/\+?\d[\d\s().-]{7,}\d/g, REDACTED);
}

function isSensitiveKey(key: string, isRoot: boolean): boolean {
  return SENSITIVE_KEY.test(key) && !(isRoot && ALLOWED_ROOT_KEYS.has(key));
}

/** Redact arbitrary values before they can leave the trusted message path. */
export function redactForOperations(value: unknown, key = '', isRoot = true, seen = new WeakSet<object>()): unknown {
  if (isSensitiveKey(key, isRoot)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    const code = typeof (value as Error & { code?: unknown }).code === 'string'
      ? redactText((value as Error & { code: string }).code).slice(0, 80)
      : undefined;
    return { name: value.name || 'Error', ...(code ? { code } : {}) };
  }
  if (Array.isArray(value)) return value.map((item) => redactForOperations(item, key, false, seen));
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[CIRCULAR]';
    seen.add(value as object);
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      if (childKey === 'stack') { result.stack = REDACTED; continue; }
      result[childKey] = redactForOperations(childValue, childKey, false, seen);
    }
    return result;
  }
  return String(value);
}

/** Keep only safe, bounded error information when a public API needs a code. */
export function safeErrorCode(error: unknown, fallback = 'internal_error'): string {
  if (!error || typeof error !== 'object') return fallback;
  const candidate = (error as { code?: unknown }).code;
  if (typeof candidate !== 'string') return fallback;
  return redactText(candidate).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 80) || fallback;
}
