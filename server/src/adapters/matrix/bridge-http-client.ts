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
  instructions?: string;
  complete?: { user_login_id: string };
  cookies?: unknown;
}

export class BridgeHttpClient {
  private readonly provisioningBase: string;

  constructor(
    bridgeUrl: string,
    private readonly sharedSecret: string,
    private readonly matrixUserId: string
  ) {
    this.provisioningBase = `${bridgeUrl}/_matrix/provision`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.provisioningBase}${path}?user_id=${encodeURIComponent(this.matrixUserId)}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.sharedSecret}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

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
}
