import { logger } from '../utils/logger';
import { expoNotificationProvider, type NotificationPayload } from './notification-providers';
import { type DbRow, supabase } from './supabase';

type OperatorAlert = {
  subject: string;
  lines: string[];
  dedupeKey?: string;
  dedupeSeconds?: number;
};

const ALERT_WINDOW_SECONDS = 15 * 60;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export class OperatorEmailAlerts {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  async send(alert: OperatorAlert): Promise<void> {
    const apiKey = this.env.RESEND_API_KEY;
    const from = this.env.OPERATOR_ALERT_FROM || this.env.RESEND_FROM_EMAIL;

    if (alert.dedupeKey) {
      try {
        const { redis } = await import('./redis');
        const claimed = await redis.claimOnce(`operator-alert:${alert.dedupeKey}`, alert.dedupeSeconds || ALERT_WINDOW_SECONDS);
        if (!claimed) return;
      } catch (error) {
        logger.warn('Operator alert deduplication unavailable; sending alert', error);
      }
    }

    await Promise.allSettled([
      apiKey && from ? this.sendEmail(alert, apiKey, from) : Promise.resolve(),
      this.sendIosPush(alert),
    ]);
  }

  private async getRecipients(): Promise<{ emails: string[]; userIds: string[] }> {
    const { data: admins, error: adminError } = await supabase
      .from('operations_admins')
      .select('email')
      .in('role', ['owner', 'operator']);
    if (adminError) throw adminError;

    const emails = [...new Set([
      this.env.OPERATOR_ALERT_EMAIL?.trim().toLowerCase(),
      ...(admins || []).map((row: DbRow) => String(row.email).trim().toLowerCase()),
    ].filter((email): email is string => Boolean(email)))];
    if (emails.length === 0) return { emails, userIds: [] };

    const { data: users, error: usersError } = await supabase.from('users').select('id,email').in('email', emails);
    if (usersError) throw usersError;
    return { emails, userIds: (users || []).map((row: DbRow) => String(row.id)) };
  }

  private async sendEmail(alert: OperatorAlert, apiKey: string, from: string): Promise<void> {
    try {
      const { emails } = await this.getRecipients();
      if (emails.length === 0) return;
      const html = `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>${escapeHtml(alert.subject)}</h2><ul>${alert.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`;
      const deliveries = await Promise.all(emails.map(async (to) => this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject: `[Claire] ${alert.subject}`, html }),
      })));
      for (const response of deliveries) {
        if (!response.ok) logger.error('Operator email alert delivery failed', { status: response.status });
      }
    } catch (error) {
      logger.error('Operator email alert could not be sent', error);
    }
  }

  private async sendIosPush(alert: OperatorAlert): Promise<void> {
    try {
      const { userIds } = await this.getRecipients();
      if (userIds.length === 0) return;
      const { data: devices, error } = await supabase
        .from('notification_devices')
        .select('token')
        .in('user_id', userIds)
        .eq('platform', 'ios')
        .eq('provider', 'expo')
        .eq('enabled', true);
      if (error) throw error;
      const tokens: string[] = Array.from(new Set<string>(
        (devices || []).map((row: DbRow) => String(row.token)).filter((token: string) => token.length > 0),
      ));
      if (tokens.length === 0) return;

      const payload: NotificationPayload = {
        title: `Claire: ${alert.subject}`,
        body: this.pushSummary(alert),
        threadId: 'operations',
        tag: 'operations-alerts',
        collapseId: `ops-${alert.dedupeKey || Date.now()}`.slice(0, 64),
        data: {
          type: 'operations_alert',
          version: 1,
          url: 'https://useclaire.co/ops',
        },
      };
      await Promise.all(tokens.map((token) => expoNotificationProvider.send(token, payload)));
    } catch (error) {
      logger.error('Operator iOS push alert could not be sent', error);
    }
  }

  private pushSummary(alert: OperatorAlert): string {
    if (alert.subject === 'New signup') return 'A new account signed up.';
    if (alert.subject.endsWith('connected')) return 'A customer connected a service.';
    if (alert.subject.endsWith('connection failed')) return 'A customer could not connect a service.';
    return alert.lines[0] || 'Open the Operations dashboard for details.';
  }

  signup(email: string, userId: string): Promise<void> {
    return this.send({
      subject: 'New signup',
      lines: [`Email: ${email}`, `User ID: ${userId}`, `Time: ${new Date().toISOString()}`],
      dedupeKey: `signup:${userId}`,
      dedupeSeconds: 60 * 60 * 24 * 30,
    });
  }

  platformConnected(platform: string, email: string | undefined, userId: string, sessionId: string): Promise<void> {
    return this.send({
      subject: `${platform} connected`,
      lines: [`Platform: ${platform}`, `Email: ${email || 'unavailable'}`, `User ID: ${userId}`, `Session: ${sessionId}`, `Time: ${new Date().toISOString()}`],
      dedupeKey: `connected:${sessionId}`,
    });
  }

  platformFailed(platform: string, email: string | undefined, userId: string, sessionId: string): Promise<void> {
    return this.send({
      subject: `${platform} connection failed`,
      lines: [`Platform: ${platform}`, `Email: ${email || 'unavailable'}`, `User ID: ${userId}`, `Session: ${sessionId}`, `Time: ${new Date().toISOString()}`],
      dedupeKey: `platform-failed:${sessionId}`,
    });
  }

  serverError(method: string, path: string, status: number, userId?: string): Promise<void> {
    return this.send({
      subject: `Server error (${status})`,
      lines: [`Request: ${method} ${path}`, `Status: ${status}`, `User ID: ${userId || 'anonymous'}`, `Time: ${new Date().toISOString()}`],
      dedupeKey: `server-error:${method}:${path}:${status}`,
    });
  }
}

export const operatorEmailAlerts = new OperatorEmailAlerts();
