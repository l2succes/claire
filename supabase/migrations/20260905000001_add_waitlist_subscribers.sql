-- Public launch waitlist. Signups are written only by the website's server-side
-- service-role client; no browser or authenticated-user policies are exposed.
CREATE TABLE IF NOT EXISTS public.waitlist_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed', 'unsubscribed')),
  source TEXT NOT NULL DEFAULT 'homepage_hero' CHECK (source IN ('homepage_hero', 'homepage_footer')),
  campaign TEXT CHECK (campaign IS NULL OR char_length(campaign) <= 100),
  referrer TEXT CHECK (referrer IS NULL OR char_length(referrer) <= 500),
  consent_version TEXT NOT NULL,
  consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  welcome_email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waitlist_email_length CHECK (char_length(email) BETWEEN 3 AND 254)
);

CREATE INDEX IF NOT EXISTS idx_waitlist_subscribers_status_created
  ON public.waitlist_subscribers (status, created_at DESC);

ALTER TABLE public.waitlist_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_subscribers FROM anon, authenticated;

DROP TRIGGER IF EXISTS update_waitlist_subscribers_updated_at ON public.waitlist_subscribers;
CREATE TRIGGER update_waitlist_subscribers_updated_at
  BEFORE UPDATE ON public.waitlist_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
