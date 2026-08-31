/**
 * What the user is allowed to read from a failed request.
 *
 * Trust is decided by status, not by inspecting the text. A 4xx is the server
 * deliberately telling the person something — a validation failure, a
 * disconnected session, an unsupported capability — and that copy is written
 * for them. A 5xx means something broke, and its message is written for whoever
 * reads the logs: it has carried a database constraint name into the chat
 * composer before. Never show that, whatever it says.
 *
 * This is the backstop, not the control. The server is responsible for keeping
 * internal detail out of a response body in the first place; this exists so that
 * when an endpoint gets it wrong the failure mode is a vague message rather than
 * a leak.
 *
 * Structural rather than typed against AxiosError so it stays free of axios —
 * which cannot be imported under the test environment.
 */
export interface FailedRequest {
  response?: { status?: number; data?: { error?: string; message?: string } };
}

export const GENERIC_SERVER_ERROR = 'Something went wrong on our end. Please try again.';
export const GENERIC_REQUEST_ERROR = 'Something went wrong. Please try again.';
export const UNREACHABLE_ERROR = 'Could not reach Claire. Check your connection and try again.';

export function clientSafeMessage(error: FailedRequest): string {
  const status = error.response?.status;
  const body = error.response?.data?.error || error.response?.data?.message;

  if (status !== undefined && status >= 500) {
    // Keep the real text reachable while developing, but never render it.
    if (body) console.warn('[api] server error detail (not shown to user):', body);
    return GENERIC_SERVER_ERROR;
  }

  // No response at all: the request never completed.
  if (status === undefined) return UNREACHABLE_ERROR;

  return body || GENERIC_REQUEST_ERROR;
}
