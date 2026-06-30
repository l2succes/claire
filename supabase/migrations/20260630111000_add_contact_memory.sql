-- Add contact_memory table for persistent per-contact facts extracted from conversations.
-- Injected into AI prompts via context-builder to personalise suggestions.

CREATE TABLE IF NOT EXISTS public.contact_memory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- The platform-level contact identifier (mirrors contacts.whatsapp_id usage pattern)
    contact_id TEXT NOT NULL,
    -- Short label: 'birthday', 'job', 'preference', 'recent_event', …
    key TEXT NOT NULL,
    -- The remembered fact
    value TEXT NOT NULL,
    -- 0..1 confidence from extraction
    confidence FLOAT DEFAULT 1.0,
    -- Source message ID that triggered this memory (nullable for manually-added entries)
    source_message_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- One entry per (user, contact, key) — upsert on this
    UNIQUE(user_id, contact_id, key)
);

CREATE INDEX IF NOT EXISTS idx_contact_memory_user_contact
    ON public.contact_memory(user_id, contact_id);

CREATE TRIGGER update_contact_memory_updated_at
    BEFORE UPDATE ON public.contact_memory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.contact_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contact memory"
    ON public.contact_memory
    FOR ALL USING (auth.uid() = user_id);
