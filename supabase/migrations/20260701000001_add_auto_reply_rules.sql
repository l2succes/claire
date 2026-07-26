-- Auto-reply rule engine (issue #39)
-- Rules fire when an incoming message matches a trigger; the engine
-- sends a canned or AI-generated reply, subject to per-rule rate caps.

CREATE TABLE IF NOT EXISTS public.auto_reply_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('keyword', 'birthday', 'thanks')),
  -- keyword trigger: JSON array of strings, e.g. ["meeting","schedule"]
  keywords     JSONB,
  -- reply template; {name} is substituted with sender name when available
  reply_template TEXT NOT NULL,
  -- platforms this rule applies to; NULL/empty = all platforms
  platforms    JSONB,
  -- rate cap: max fires per window
  max_per_hour  INT NOT NULL DEFAULT 5,
  max_per_day   INT NOT NULL DEFAULT 20,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track when each rule last fired for rate-cap enforcement
CREATE TABLE IF NOT EXISTS public.auto_reply_log (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id  UUID NOT NULL REFERENCES public.auto_reply_rules(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id  TEXT NOT NULL,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_user ON public.auto_reply_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_log_rule  ON public.auto_reply_log(rule_id, fired_at);

-- RLS
ALTER TABLE public.auto_reply_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_log   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own auto_reply_rules"
  ON public.auto_reply_rules FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users read own auto_reply_log"
  ON public.auto_reply_log FOR ALL
  USING (auth.uid() = user_id);
