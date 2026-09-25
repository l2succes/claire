-- RevenueCat-backed subscriptions and an append-only AI credit ledger.
-- Store receipts and payment methods remain with Apple, Google, or RevenueCat.

CREATE TABLE IF NOT EXISTS public.billing_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  revenuecat_customer_id TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'preview' CHECK (plan IN ('preview', 'plus', 'pro')),
  status TEXT NOT NULL DEFAULT 'preview'
    CHECK (status IN ('preview', 'active', 'canceling', 'grace', 'billing_issue', 'expired')),
  product_identifier TEXT,
  store TEXT,
  environment TEXT CHECK (environment IS NULL OR environment IN ('sandbox', 'production')),
  entitlement_expires_at TIMESTAMPTZ,
  will_renew BOOLEAN NOT NULL DEFAULT FALSE,
  credit_reset_at TIMESTAMPTZ,
  last_revenuecat_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  bucket TEXT NOT NULL CHECK (bucket IN ('starter', 'monthly', 'purchased', 'usage')),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('grant', 'debit', 'release', 'refund', 'adjustment')),
  source_key TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_credit_ledger_user_created_idx
  ON public.billing_credit_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  app_user_id TEXT,
  environment TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own billing account" ON public.billing_accounts;
CREATE POLICY "Users read own billing account"
  ON public.billing_accounts FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE public.billing_credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own billing credits" ON public.billing_credit_ledger;
CREATE POLICY "Users read own billing credits"
  ON public.billing_credit_ledger FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_billing_preview()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.billing_accounts (user_id, revenuecat_customer_id)
  VALUES (NEW.id, NEW.id::text)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.billing_credit_ledger (
    user_id,
    amount,
    bucket,
    entry_type,
    source_key,
    expires_at,
    metadata
  ) VALUES (
    NEW.id,
    50,
    'starter',
    'grant',
    'starter:' || NEW.id::text,
    now() + interval '7 days',
    '{"reason":"first_loop_preview"}'::jsonb
  )
  ON CONFLICT (source_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_billing_preview_on_user ON public.users;
CREATE TRIGGER create_billing_preview_on_user
AFTER INSERT ON public.users
FOR EACH ROW EXECUTE FUNCTION public.create_billing_preview();

-- Existing beta accounts receive the same one-time preview as new signups.
INSERT INTO public.billing_accounts (user_id, revenuecat_customer_id)
SELECT id, id::text FROM public.users
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.billing_credit_ledger (
  user_id,
  amount,
  bucket,
  entry_type,
  source_key,
  expires_at,
  metadata
)
SELECT
  id,
  50,
  'starter',
  'grant',
  'starter:' || id::text,
  now() + interval '7 days',
  '{"reason":"first_loop_preview"}'::jsonb
FROM public.users
ON CONFLICT (source_key) DO NOTHING;

-- Spend the soonest-expiring credits first. Each debit inherits its grant
-- bucket's expiry so old usage disappears with the credits it consumed.
CREATE OR REPLACE FUNCTION public.consume_billing_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_source_key TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  available INTEGER;
  remaining INTEGER := p_amount;
  spend INTEGER;
  part INTEGER := 0;
  credit_bucket RECORD;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Credit amount must be positive'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT COALESCE(SUM(amount), 0)::INTEGER INTO available
  FROM public.billing_credit_ledger
  WHERE user_id = p_user_id AND (expires_at IS NULL OR expires_at > now());
  IF available < p_amount THEN RETURN FALSE; END IF;

  FOR credit_bucket IN
    SELECT expires_at, SUM(amount)::INTEGER AS balance
    FROM public.billing_credit_ledger
    WHERE user_id = p_user_id AND (expires_at IS NULL OR expires_at > now())
    GROUP BY expires_at
    HAVING SUM(amount) > 0
    ORDER BY expires_at ASC NULLS LAST
  LOOP
    EXIT WHEN remaining = 0;
    spend := LEAST(remaining, credit_bucket.balance);
    INSERT INTO public.billing_credit_ledger (
      user_id, amount, bucket, entry_type, source_key, expires_at, metadata
    ) VALUES (
      p_user_id, -spend, 'usage', 'debit', p_source_key || ':' || part,
      credit_bucket.expires_at, p_metadata
    );
    remaining := remaining - spend;
    part := part + 1;
  END LOOP;
  RETURN remaining = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_billing_credits(p_user_id UUID, p_source_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.billing_credit_ledger (
    user_id, amount, bucket, entry_type, source_key, expires_at, metadata
  )
  SELECT user_id, -amount, 'usage', 'release', 'release:' || source_key, expires_at,
    jsonb_build_object('reserved_by', p_source_key)
  FROM public.billing_credit_ledger
  WHERE user_id = p_user_id
    AND entry_type = 'debit'
    AND source_key LIKE p_source_key || ':%'
  ON CONFLICT (source_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_billing_credits(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_billing_credits(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_billing_credits(UUID, INTEGER, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_billing_credits(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
