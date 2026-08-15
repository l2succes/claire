-- Reliable, device-aware notification delivery (#110).
CREATE TABLE IF NOT EXISTS public.notification_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'macos', 'windows', 'web')),
  provider TEXT NOT NULL CHECK (provider IN ('expo', 'apns', 'fcm', 'webpush')),
  token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  app_version TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id),
  UNIQUE(provider, token)
);

CREATE INDEX IF NOT EXISTS notification_devices_user_enabled_idx
  ON public.notification_devices(user_id, enabled);

ALTER TABLE public.notification_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notification devices"
  ON public.notification_devices FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.notification_devices(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL DEFAULT 'new_message',
  state TEXT NOT NULL CHECK (state IN ('queued', 'submitted', 'delivered', 'failed', 'suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  provider_ticket_id TEXT,
  provider_receipt_id TEXT,
  error_code TEXT,
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, device_id, notification_type)
);

CREATE INDEX IF NOT EXISTS notification_deliveries_receipt_idx
  ON public.notification_deliveries(provider_receipt_id)
  WHERE provider_receipt_id IS NOT NULL;

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notification deliveries"
  ON public.notification_deliveries FOR SELECT
  USING (auth.uid() = user_id);

-- Preserve existing Expo registrations as best-effort legacy devices.
INSERT INTO public.notification_devices
  (user_id, device_id, platform, provider, token, last_seen_at, token_refreshed_at, created_at, updated_at)
SELECT
  user_id,
  COALESCE(device_id, 'legacy-' || id::text),
  CASE WHEN platform IN ('ios', 'android') THEN platform ELSE 'ios' END,
  'expo',
  token,
  COALESCE(updated_at, created_at, now()),
  COALESCE(updated_at, created_at, now()),
  COALESCE(created_at, now()),
  COALESCE(updated_at, created_at, now())
FROM public.push_tokens
ON CONFLICT (provider, token) DO NOTHING;

NOTIFY pgrst, 'reload schema';
