import { connect } from 'node:http2';
import { createPrivateKey, sign } from 'node:crypto';
import { config } from '../config';

export interface NotificationPayload {
  title: string;
  body: string;
  badge?: number;
  data: Record<string, string | number | boolean>;
  collapseId: string;
}

export interface ProviderResult {
  state: 'submitted' | 'delivered' | 'failed';
  ticketId?: string;
  receiptId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  invalidToken?: boolean;
}

export interface NotificationProvider {
  readonly name: 'expo' | 'apns';
  send(token: string, payload: NotificationPayload): Promise<ProviderResult>;
}

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

export class ExpoNotificationProvider implements NotificationProvider {
  readonly name = 'expo' as const;

  async send(token: string, payload: NotificationPayload): Promise<ProviderResult> {
    try {
      const response = await fetch(EXPO_SEND_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: token,
          title: payload.title,
          body: payload.body,
          sound: 'default',
          channelId: 'messages',
          badge: payload.badge,
          data: payload.data,
          collapseId: payload.collapseId,
        }),
      });
      if (!response.ok) return { state: 'failed', errorCode: `expo_http_${response.status}`, retryable: response.status >= 500 };
      const result = await response.json() as { data?: { status: string; id?: string; message?: string; details?: { error?: string } } };
      const ticket = result.data;
      if (ticket?.status === 'ok' && ticket.id) return { state: 'submitted', ticketId: ticket.id, receiptId: ticket.id };
      const code = ticket?.details?.error || 'expo_ticket_error';
      return {
        state: 'failed', errorCode: code, errorMessage: ticket?.message,
        invalidToken: code === 'DeviceNotRegistered', retryable: code === 'MessageRateExceeded',
      };
    } catch (error) {
      return { state: 'failed', errorCode: 'expo_network_error', errorMessage: (error as Error).message, retryable: true };
    }
  }

  async getReceipt(receiptId: string): Promise<ProviderResult> {
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [receiptId] }),
      });
      if (!response.ok) return { state: 'failed', errorCode: `expo_receipt_http_${response.status}`, retryable: response.status >= 500 };
      const result = await response.json() as { data?: Record<string, { status: string; message?: string; details?: { error?: string } }> };
      const receipt = result.data?.[receiptId];
      if (!receipt) return { state: 'submitted', receiptId };
      if (receipt.status === 'ok') return { state: 'delivered', receiptId };
      const code = receipt.details?.error || 'expo_receipt_error';
      return { state: 'failed', receiptId, errorCode: code, errorMessage: receipt.message, invalidToken: code === 'DeviceNotRegistered' };
    } catch (error) {
      return { state: 'failed', errorCode: 'expo_receipt_network_error', errorMessage: (error as Error).message, retryable: true };
    }
  }
}

function base64Url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

export class ApnsNotificationProvider implements NotificationProvider {
  readonly name = 'apns' as const;
  private cachedJwt?: { value: string; createdAt: number };

  private jwt(): string | null {
    if (!config.APNS_KEY_ID || !config.APNS_TEAM_ID || !config.APNS_PRIVATE_KEY) return null;
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedJwt && now - this.cachedJwt.createdAt < 50 * 60) return this.cachedJwt.value;
    const header = base64Url(JSON.stringify({ alg: 'ES256', kid: config.APNS_KEY_ID }));
    const claims = base64Url(JSON.stringify({ iss: config.APNS_TEAM_ID, iat: now }));
    const unsigned = `${header}.${claims}`;
    const key = createPrivateKey(config.APNS_PRIVATE_KEY.replace(/\\n/g, '\n'));
    const signature = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
    const value = `${unsigned}.${base64Url(signature)}`;
    this.cachedJwt = { value, createdAt: now };
    return value;
  }

  async send(token: string, payload: NotificationPayload): Promise<ProviderResult> {
    const jwt = this.jwt();
    const topic = config.APNS_MACOS_TOPIC;
    if (!jwt || !topic) return { state: 'failed', errorCode: 'apns_not_configured', errorMessage: 'APNs credentials are incomplete' };
    const authority = config.APNS_USE_SANDBOX ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
    return new Promise((resolve) => {
      const client = connect(authority);
      let settled = false;
      const finish = (result: ProviderResult) => {
        if (settled) return;
        settled = true;
        client.close();
        resolve(result);
      };
      client.once('error', (error) => finish({ state: 'failed', errorCode: 'apns_network_error', errorMessage: error.message, retryable: true }));
      const request = client.request({
        ':method': 'POST', ':path': `/3/device/${token}`,
        authorization: `bearer ${jwt}`, 'apns-topic': topic, 'apns-push-type': 'alert',
        'apns-priority': '10', 'apns-collapse-id': payload.collapseId.slice(0, 64),
      });
      let status = 0;
      let responseBody = '';
      request.setEncoding('utf8');
      request.on('response', (headers) => { status = Number(headers[':status'] || 0); });
      request.on('data', (chunk) => { responseBody += chunk; });
      request.on('end', () => {
        if (status === 200) return finish({ state: 'delivered' });
        let reason = 'apns_error';
        try { reason = (JSON.parse(responseBody) as { reason?: string }).reason || reason; } catch { /* response may be empty */ }
        finish({
          state: 'failed', errorCode: reason, errorMessage: responseBody || `APNs returned ${status}`,
          invalidToken: status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered',
          retryable: status === 429 || status >= 500,
        });
      });
      request.end(JSON.stringify({
        aps: { alert: { title: payload.title, body: payload.body }, sound: 'default', badge: payload.badge },
        ...payload.data,
      }));
    });
  }
}

export const expoNotificationProvider = new ExpoNotificationProvider();
export const apnsNotificationProvider = new ApnsNotificationProvider();
