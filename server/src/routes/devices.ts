import { Router, Request, Response, raw } from 'express';
import { createHash } from 'crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { supabase } from '../services/supabase';
import { platformManager, Platform, MessageContentType, type UnifiedMessage } from '../adapters';
import {
  createDeviceCredential,
  hashDeviceCredential,
  matchesDeviceCredential,
} from '../services/companion-devices';
import { logger } from '../utils/logger';

const router = Router();

/** Deployment diagnostic for desktop setup. Returns no account/device data. */
router.get('/readiness', async (_req: Request, res: Response) => {
  const { count, error } = await supabase.from('companion_devices').select('id', { count: 'exact', head: true });
  return res.status(error ? 503 : 200).json({ ready: !error, enrolledDevices: count || 0 });
});

const deviceIdSchema = z.object({ params: z.object({ id: z.string().uuid() }) });
const enrolSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(1).max(120),
    hostPlatform: z.enum(['macos', 'windows']),
    publicKey: z.string().trim().min(32).max(8192),
    capabilities: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  }),
});

const companionEventsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    messages: z.array(z.object({
      platformMessageId: z.string().trim().min(1).max(1024),
      content: z.string().max(250_000).default(''),
      contentType: z.nativeEnum(MessageContentType).default(MessageContentType.TEXT),
      senderId: z.string().trim().min(1).max(512),
      senderName: z.string().trim().max(512).optional(),
      chatId: z.string().trim().min(1).max(1024),
      chatType: z.enum(['individual', 'group']),
      chatName: z.string().trim().max(512).optional(),
      timestamp: z.string().datetime({ offset: true }),
      isFromMe: z.boolean(),
      isRead: z.boolean().default(false),
      hasMedia: z.boolean().default(false),
      platformMetadata: z.record(z.unknown()).optional(),
    })).min(1).max(200),
  }),
});

function publicDevice(device: Record<string, unknown>) {
  const { credential_hash: _credentialHash, public_key: _publicKey, ...safeDevice } = device;
  return safeDevice;
}

/** List the signed-in user's desktop companions. */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });

  const { data, error } = await supabase
    .from('companion_devices')
    .select('id, display_name, host_platform, capabilities, status, last_seen_at, credential_rotated_at, created_at, updated_at')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false, nullsFirst: false });

  if (error) {
    logger.error('Unable to list companion devices:', error);
    return res.status(500).json({ error: 'Failed to list companion devices' });
  }
  return res.json({ success: true, devices: data || [] });
});

/**
 * Enrol (or re-enrol) a desktop companion. The credential is shown exactly
 * once so native code must write it to platform secure storage immediately.
 */
router.post('/', requireAuth, validateRequest(enrolSchema), async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });

  const credential = createDeviceCredential();
  const { displayName, hostPlatform, publicKey, capabilities } = req.body;
  const { data, error } = await supabase
    .from('companion_devices')
    .upsert({
      user_id: userId,
      display_name: displayName,
      host_platform: hostPlatform,
      public_key: publicKey,
      credential_hash: hashDeviceCredential(credential),
      credential_rotated_at: new Date().toISOString(),
      capabilities,
      status: 'active',
    }, { onConflict: 'user_id,public_key' })
    .select('*')
    .single();

  if (error || !data) {
    logger.error('Unable to enrol companion device:', error);
    return res.status(500).json({ error: 'Failed to enrol companion device' });
  }

  return res.status(201).json({ success: true, device: publicDevice(data), credential });
});

/** Rotate a credential after a lost-device warning or secure-storage reset. */
router.post('/:id/rotate-credential', requireAuth, validateRequest(deviceIdSchema), async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });

  const credential = createDeviceCredential();
  const { data, error } = await supabase
    .from('companion_devices')
    .update({ credential_hash: hashDeviceCredential(credential), credential_rotated_at: new Date().toISOString(), status: 'active' })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) {
    logger.error('Unable to rotate companion credential:', error);
    return res.status(500).json({ error: 'Failed to rotate companion credential' });
  }
  if (!data) return res.status(404).json({ error: 'Companion device not found' });

  return res.json({ success: true, device: publicDevice(data), credential });
});

/** Revoke a companion immediately; it can no longer report health or ingest. */
router.delete('/:id', requireAuth, validateRequest(deviceIdSchema), async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'User not authenticated' });

  const { data, error } = await supabase
    .from('companion_devices')
    .update({ status: 'revoked' })
    .eq('id', req.params.id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('Unable to revoke companion device:', error);
    return res.status(500).json({ error: 'Failed to revoke companion device' });
  }
  if (!data) return res.status(404).json({ error: 'Companion device not found' });
  return res.status(204).end();
});

/**
 * Native companion heartbeat: authenticates with its device credential, not a
 * user access token. This endpoint deliberately returns no user/chat data.
 */
router.post('/:id/heartbeat', validateRequest(deviceIdSchema), async (req: Request, res: Response) => {
  const credential = req.header('x-claire-device-token');
  if (!credential) return res.status(401).json({ error: 'Missing device credential' });

  const { data: device, error } = await supabase
    .from('companion_devices')
    .select('id, status, credential_hash')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error || !device || device.status !== 'active' || !matchesDeviceCredential(credential, device.credential_hash)) {
    return res.status(401).json({ error: 'Invalid device credential' });
  }

  const { error: updateError } = await supabase
    .from('companion_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', device.id);
  if (updateError) {
    logger.error('Unable to record companion heartbeat:', updateError);
    return res.status(500).json({ error: 'Failed to record companion heartbeat' });
  }
  return res.json({ success: true });
});

/**
 * Receive one attachment from the native iMessage companion. The file is sent
 * directly from native code with the device credential; neither its local path
 * nor the raw bytes are available to the React Native layer.
 */
router.post('/:id/media/:platformMessageId', raw({ type: 'application/octet-stream', limit: '25mb' }), async (req: Request, res: Response) => {
  const credential = req.header('x-claire-device-token');
  if (!credential) return res.status(401).json({ error: 'Missing device credential' });
  const { id, platformMessageId } = req.params;
  const { data: device, error } = await supabase
    .from('companion_devices')
    .select('id, user_id, host_platform, status, credential_hash')
    .eq('id', id)
    .maybeSingle();
  if (error || !device || device.status !== 'active' || !matchesDeviceCredential(credential, device.credential_hash)) {
    return res.status(401).json({ error: 'Invalid device credential' });
  }
  if (device.host_platform !== 'macos') return res.status(403).json({ error: 'Only a Mac companion can upload iMessage media' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Attachment body is required' });

  const mimeType = String(req.header('x-claire-media-mime-type') || 'application/octet-stream').toLowerCase();
  if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType)) return res.status(400).json({ error: 'Invalid attachment MIME type' });
  const extension = mimeType.split('/')[1].replace(/[^a-z0-9]/g, '').slice(0, 12) || 'bin';
  const messageHash = createHash('sha256').update(platformMessageId).digest('hex');
  const objectPath = `imessage/${device.id}/${messageHash}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('message-media')
    .upload(objectPath, req.body, { contentType: mimeType, upsert: true, cacheControl: '31536000' });
  if (uploadError) {
    logger.error('Unable to store companion media:', uploadError);
    return res.status(500).json({ error: 'Failed to store attachment' });
  }
  const { data: urlData } = supabase.storage.from('message-media').getPublicUrl(objectPath);
  const contentType = mimeType.startsWith('image/') ? MessageContentType.IMAGE
    : mimeType.startsWith('video/') ? MessageContentType.VIDEO
      : mimeType.startsWith('audio/') ? MessageContentType.AUDIO
        : MessageContentType.DOCUMENT;
  const { error: updateError } = await supabase
    .from('messages')
    .update({ media_url: urlData.publicUrl, media_mime_type: mimeType, content_type: contentType, type: contentType })
    .eq('user_id', device.user_id)
    .eq('platform_message_id', platformMessageId)
    .eq('platform', Platform.IMESSAGE);
  if (updateError) {
    logger.error('Unable to attach companion media to message:', updateError);
    return res.status(500).json({ error: 'Failed to attach media to message' });
  }
  return res.status(201).json({ success: true, mediaUrl: urlData.publicUrl, mimeType });
});

/**
 * Ingest an iMessage batch read by an enrolled Mac companion. The device token
 * is enough to identify the owning account; user_id and platform are never
 * accepted from the client. This prevents a desktop host from writing into a
 * different user's history or masquerading as another bridge.
 */
router.post('/:id/events', validateRequest(companionEventsSchema), async (req: Request, res: Response) => {
  const credential = req.header('x-claire-device-token');
  if (!credential) return res.status(401).json({ error: 'Missing device credential' });

  const { data: device, error } = await supabase
    .from('companion_devices')
    .select('id, user_id, host_platform, status, credential_hash, capabilities')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error || !device || device.status !== 'active' || !matchesDeviceCredential(credential, device.credential_hash)) {
    return res.status(401).json({ error: 'Invalid device credential' });
  }
  if (device.host_platform !== 'macos') {
    return res.status(403).json({ error: 'Only a Mac companion can ingest iMessage events' });
  }

  const sessionId = `companion:${device.id}`;
  for (const incoming of req.body.messages) {
    const message: UnifiedMessage = {
      id: `companion-imessage:${incoming.platformMessageId}`,
      platformMessageId: incoming.platformMessageId,
      platform: Platform.IMESSAGE,
      sessionId,
      userId: device.user_id,
      content: incoming.content,
      contentType: incoming.contentType,
      senderId: incoming.senderId,
      senderName: incoming.senderName,
      chatId: incoming.chatId,
      chatType: incoming.chatType,
      chatName: incoming.chatName,
      timestamp: new Date(incoming.timestamp),
      isFromMe: incoming.isFromMe,
      isRead: incoming.isRead,
      hasMedia: incoming.hasMedia,
      platformMetadata: { ...(incoming.platformMetadata || {}), source: 'mac_companion' },
    };
    await platformManager.ingestMessage(message);
  }

  await supabase
    .from('companion_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', device.id);
  return res.status(202).json({ success: true, accepted: req.body.messages.length });
});

export default router;
