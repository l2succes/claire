-- Small, user-owned continuity records. They intentionally contain route IDs,
-- drafts and assistant references only; full timelines and credentials never
-- leave their normal stores for handoff.
CREATE TABLE IF NOT EXISTS public.workspace_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL CHECK (char_length(installation_id) BETWEEN 12 AND 200),
  source_platform TEXT NOT NULL CHECK (source_platform IN ('ios', 'android', 'web', 'electron')),
  kind TEXT NOT NULL CHECK (kind IN ('chat_draft', 'assistant_thread', 'search', 'workspace')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  UNIQUE (user_id, installation_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_workspace_handoffs_recent
  ON public.workspace_handoffs (user_id, updated_at DESC);

ALTER TABLE public.workspace_handoffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own workspace handoffs" ON public.workspace_handoffs;
CREATE POLICY "Users manage own workspace handoffs" ON public.workspace_handoffs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_workspace_handoffs_updated_at ON public.workspace_handoffs;
CREATE TRIGGER update_workspace_handoffs_updated_at
  BEFORE UPDATE ON public.workspace_handoffs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
