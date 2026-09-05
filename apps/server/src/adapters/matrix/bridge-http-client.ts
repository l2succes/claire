/**
 * BridgeHttpClient
 *
 * Thin wrapper around the mautrix bridge provisioning HTTP API.
 * Routes are at /_matrix/provision/v3/* (mounted by mautrix-go's ProvisioningAPI).
 * Ref: https://github.com/mautrix/go/blob/main/bridgev2/matrix/provisioning.go
 */

import { logger } from '../../utils/logger';

export interface LoginFlow {
  id: string;
  name: string;
  description?: string;
}

// Response from POST /v3/login/start/{flowID} and POST /v3/login/step/...
// RespSubmitLogin = { login_id, ...LoginStep }
export interface LoginStepResponse {
  login_id: string;    // login process ID (for subsequent step calls)
  type: 'user_input' | 'cookies' | 'display_and_wait' | 'complete';
  step_id: string;     // step ID (for the step URL)
  txn_id?: string;
  instructions?: string;
  complete?: { user_login_id: string };
  cookies?: unknown;
  display_and_wait?: {
    type?: string;
    data?: string;
  };
}

export interface ResolvedBridgeIdentifier {
  id: string;
  name?: string;
  avatar_url?: string;
  identifiers?: string[];
  mxid?: string;
}

/**
 * A contact profile returned by mautrix's authenticated provisioning API.
 * These values are scoped to a single linked bridge login; they must never be
 * copied into a shared Matrix ghost profile.
 */
export interface BridgeContact {
  id: string;
  name?: string;
  avatar_url?: string;
  identifiers?: string[];
  dm_room_mxid?: string;
  mxid?: string;
}

export class BridgeHttpClient {
  private readonly provisioningBase: string;
  private static readonly REQUEST_TIMEOUT_MS = 12_000;

  constructor(
    bridgeUrl: string,
    private readonly sharedSecret: string,
    private readonly matrixUserId: string
  ) {
    this.provisioningBase = `${bridgeUrl}/_matrix/provision`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query: Record<string, string | undefined> = {}
  ): Promise<T> {
    const params = new URLSearchParams({ user_id: this.matrixUserId });
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    const url = `${this.provisioningBase}${path}?${params.toString()}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.sharedSecret}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(BridgeHttpClient.REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown network error';
      throw new Error(`Bridge provisioning request to ${this.provisioningBase} failed: ${detail}`);
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Bridge HTTP ${res.status}: ${text}`);
    }

    if (!res.ok) {
      const err = (json as Record<string, string>).error
        || (json as Record<string, string>).message
        || text;
      throw new Error(`Bridge HTTP ${res.status}: ${err}`);
    }

    return json as T;
  }

  async getLoginFlows(): Promise<LoginFlow[]> {
    const data = await this.request<{ flows: LoginFlow[] }>('GET', '/v3/login/flows');
    return data.flows;
  }

  /**
   * Resolve a network identifier through the authenticated bridge login.
   *
   * WhatsApp now uses LIDs as its primary identity. Resolving the connected
   * phone number is the authoritative way to discover the LID ghost that
   * represents messages sent from the user's primary phone.
   */
  async resolveIdentifier(
    identifier: string,
    loginId?: string
  ): Promise<ResolvedBridgeIdentifier> {
    return this.request<ResolvedBridgeIdentifier>(
      'GET',
      `/v3/resolve_identifier/${encodeURIComponent(identifier)}`,
      undefined,
      { login_id: loginId }
    );
  }

  /**
   * Read the authenticated account's own contact directory. mautrix v3
   * exposes this separately from Matrix room-member profiles, which lets
   * Claire enrich its per-user contacts table without turning another
   * person's local address-book label into global bridge metadata.
   */
  async getContacts(loginId: string): Promise<BridgeContact[]> {
    const response = await this.request<{ contacts?: BridgeContact[] }>(
      'GET',
      '/v3/contacts',
      undefined,
      { login_id: loginId }
    );
    return Array.isArray(response.contacts) ? response.contacts : [];
  }

  async startLogin(flowId: string): Promise<LoginStepResponse> {
    logger.debug(`[BridgeHttpClient] startLogin flow=${flowId}`);
    return this.request<LoginStepResponse>('POST', `/v3/login/start/${encodeURIComponent(flowId)}`);
  }

  async submitCookies(
    loginId: string,
    stepId: string,
    cookies: Record<string, string>
  ): Promise<LoginStepResponse> {
    logger.debug(`[BridgeHttpClient] submitCookies login=${loginId} step=${stepId}`);
    return this.request<LoginStepResponse>(
      'POST',
      `/v3/login/step/${encodeURIComponent(loginId)}/${encodeURIComponent(stepId)}/cookies`,
      cookies
    );
  }

  async submitUserInput(
    loginId: string,
    stepId: string,
    input: Record<string, string>
  ): Promise<LoginStepResponse> {
    logger.debug(`[BridgeHttpClient] submitUserInput login=${loginId} step=${stepId}`);
    return this.request<LoginStepResponse>(
      'POST',
      `/v3/login/step/${encodeURIComponent(loginId)}/${encodeURIComponent(stepId)}/user_input`,
      input
    );
  }

  /**
   * Start waiting for a display_and_wait step to finish.
   *
   * Mautrix keeps the login process alive through this long-poll request. It
   * must be called immediately after receiving a code/QR step; merely showing
   * the returned data leaves the bridge login process unclaimed and it can
   * time out before the user confirms it on their phone.
   */
  async waitForDisplayAndWait(
    loginId: string,
    stepId: string,
    txnId?: string
  ): Promise<LoginStepResponse> {
    logger.debug(`[BridgeHttpClient] waitForDisplayAndWait login=${loginId} step=${stepId}`);
    return this.request<LoginStepResponse>(
      'POST',
      `/v3/login/step/${encodeURIComponent(loginId)}/${encodeURIComponent(stepId)}/display_and_wait`,
      undefined,
      { txn_id: txnId }
    );
  }
}
