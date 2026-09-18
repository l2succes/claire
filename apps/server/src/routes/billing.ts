import { createHmac, timingSafeEqual } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { rateLimit, requireAuth } from '../middleware/auth';
import {
  getBillingSummary,
  processRevenueCatEvent,
  syncRevenueCatCustomer,
  type RevenueCatWebhookEvent,
} from '../services/billing';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

const router = Router();
const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

const eventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    app_user_id: z.string().nullable().optional(),
    original_app_user_id: z.string().nullable().optional(),
    aliases: z.array(z.string()).nullable().optional(),
    entitlement_ids: z.array(z.string()).nullable().optional(),
    entitlement_id: z.string().nullable().optional(),
    product_id: z.string().nullable().optional(),
    store: z.string().nullable().optional(),
    environment: z.string().nullable().optional(),
    expiration_at_ms: z.number().nullable().optional(),
    purchased_at_ms: z.number().nullable().optional(),
  })
  .passthrough();

const webhookSchema = z.object({ event: eventSchema }).passthrough();

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyRevenueCatSignature(input: {
  header: string | undefined;
  rawBody: Buffer | undefined;
  secret: string;
  nowSeconds?: number;
}): boolean {
  if (!input.header || !input.rawBody) return false;
  const values = input.header.split(',').reduce<Record<string, string[]>>((result, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key || !rest.length) return result;
    (result[key] ||= []).push(rest.join('='));
    return result;
  }, {});
  const timestamp = Number(values.t?.[0]);
  if (!Number.isFinite(timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > MAX_WEBHOOK_AGE_SECONDS) return false;

  const expected = createHmac('sha256', input.secret)
    .update(`${timestamp}.${input.rawBody.toString('utf8')}`)
    .digest('hex');
  return (values.v1 || []).some((signature) => secureEqual(signature, expected));
}

function webhookIsAuthorized(req: Request): boolean {
  const authToken = config.REVENUECAT_WEBHOOK_AUTH_TOKEN;
  const signingSecret = config.REVENUECAT_WEBHOOK_SIGNING_SECRET;
  if (!authToken && !signingSecret) return false;

  if (authToken) {
    const supplied = req.get('authorization') || '';
    if (!secureEqual(supplied, authToken)) return false;
  }
  if (
    signingSecret &&
    !verifyRevenueCatSignature({
      header: req.get('x-revenuecat-webhook-signature'),
      rawBody: req.rawBody,
      secret: signingSecret,
    })
  )
    return false;
  return true;
}

router.get('/', requireAuth, async (req: Request, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' });
  try {
    return res.json({ success: true, data: await getBillingSummary(req.user.id) });
  } catch (error) {
    logger.error('Could not load billing summary', error);
    return res.status(500).json({ error: 'Could not load billing summary' });
  }
});

router.post('/refresh', requireAuth, rateLimit(6, 60_000), async (req: Request, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: 'User not authenticated' });
  try {
    return res.json({ success: true, data: await syncRevenueCatCustomer(req.user.id) });
  } catch (error) {
    logger.error('Could not refresh RevenueCat customer', error);
    return res.status(503).json({ error: 'Could not refresh store access' });
  }
});

router.post('/revenuecat/webhook', async (req: Request, res: Response) => {
  if (!config.REVENUECAT_WEBHOOK_AUTH_TOKEN && !config.REVENUECAT_WEBHOOK_SIGNING_SECRET) {
    logger.error('RevenueCat webhook received before webhook verification was configured');
    return res.status(503).json({ error: 'Billing webhook is not configured' });
  }
  if (!webhookIsAuthorized(req))
    return res.status(401).json({ error: 'Invalid webhook signature' });

  const payload = webhookSchema.safeParse(req.body);
  if (!payload.success) return res.status(400).json({ error: 'Invalid RevenueCat event' });
  try {
    const result = await processRevenueCatEvent(payload.data.event as RevenueCatWebhookEvent);
    return res.json({ received: true, result });
  } catch (error) {
    logger.error('RevenueCat webhook processing failed', error);
    return res.status(500).json({ error: 'Billing event processing failed' });
  }
});

export default router;
