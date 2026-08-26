import { logger } from './logger';

/**
 * An error whose message is written for the person using the app.
 *
 * The default assumption for a thrown error is the opposite: `error.message`
 * is written for whoever is reading the logs, and routinely carries database
 * constraint names, table names, provider payloads and other internal detail.
 * Returning that verbatim is both a poor experience and an information leak —
 * a reaction that raced its own bridge echo once surfaced
 * `duplicate key value violates unique constraint
 * "message_reactions_user_id_message_id_reactor_id_emoji_key"` in the chat
 * composer.
 *
 * So safety is opt-in, never inferred. Throw this when the text is genuinely
 * meant for a person — a validation failure, a business rule, a provider
 * result worth relaying — and let everything else fall back to a generic
 * message.
 */
export class ClientFacingError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'ClientFacingError';
    this.status = options.status ?? 400;
    this.code = options.code;
  }
}

export function isClientFacingError(error: unknown): error is ClientFacingError {
  return error instanceof ClientFacingError;
}

interface ErrorResponseBody {
  success: false;
  error: string;
  code?: string;
}

/**
 * Log the real failure, return something safe.
 *
 * `fallback` is what an unexpected error becomes. Write it as advice to the
 * person — what happened and whether retrying is worth it — not as a
 * description of the internal fault.
 */
export function respondWithError(
  res: { status: (code: number) => { json: (body: ErrorResponseBody) => unknown } },
  error: unknown,
  context: { fallback: string; logMessage: string; details?: Record<string, unknown> },
): unknown {
  // The full error only ever goes to the logs.
  logger.error(context.logMessage, {
    ...context.details,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  if (isClientFacingError(error)) {
    return res.status(error.status).json({
      success: false,
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
  }

  return res.status(500).json({ success: false, error: context.fallback });
}
