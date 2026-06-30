-- Push tokens table for Expo Push Notification service
CREATE TABLE IF NOT EXISTS public.push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'expo',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);

CREATE TRIGGER update_push_tokens_updated_at BEFORE UPDATE ON public.push_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push tokens" ON public.push_tokens
    FOR ALL USING (auth.uid() = user_id);
