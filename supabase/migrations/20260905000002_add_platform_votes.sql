-- Anonymous, first-party roadmap votes from the public connector catalog.
-- voter_id is a random browser identifier; no email address or IP is stored.
CREATE TABLE IF NOT EXISTS public.platform_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id TEXT NOT NULL CHECK (char_length(platform_id) BETWEEN 1 AND 80),
  voter_id UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'homepage_catalog' CHECK (source = 'homepage_catalog'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_votes_platform_created
  ON public.platform_votes (platform_id, created_at DESC);

ALTER TABLE public.platform_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_votes FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
