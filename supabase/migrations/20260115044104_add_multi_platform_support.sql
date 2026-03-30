-- Migration: Add multi-platform messaging support
-- Adds support for WhatsApp, Telegram, iMessage, and Instagram

-- Create platform enum type
CREATE TYPE platform_type AS ENUM ('whatsapp', 'telegram', 'imessage', 'instagram');

-- ============================================================
-- 1. Update whatsapp_sessions -> platform_sessions
-- ============================================================

-- Rename table
ALTER TABLE public.whatsapp_sessions RENAME TO platform_sessions;

-- Add platform column with default for existing data
ALTER TABLE public.platform_sessions
ADD COLUMN platform platform_type DEFAULT 'whatsapp';

-- Add platform-specific identifier columns
ALTER TABLE public.platform_sessions
ADD COLUMN platform_user_id TEXT,
ADD COLUMN platform_username TEXT,
ADD COLUMN bot_token TEXT,              -- For Telegram
ADD COLUMN credentials JSONB,           -- For Instagram (encrypted)
ADD COLUMN local_db_path TEXT;          -- For iMessage

-- Update the unique constraint to include platform
ALTER TABLE public.platform_sessions
DROP CONSTRAINT IF EXISTS whatsapp_sessions_session_id_key;

ALTER TABLE public.platform_sessions
ADD CONSTRAINT platform_sessions_session_id_platform_key
UNIQUE (session_id, platform);

-- Update index names
DROP INDEX IF EXISTS idx_whatsapp_sessions_user;
DROP INDEX IF EXISTS idx_whatsapp_sessions_status;
CREATE INDEX idx_platform_sessions_user ON public.platform_sessions(user_id);
CREATE INDEX idx_platform_sessions_status ON public.platform_sessions(status);
CREATE INDEX idx_platform_sessions_platform ON public.platform_sessions(platform);

-- Update trigger name
DROP TRIGGER IF EXISTS update_whatsapp_sessions_updated_at ON public.platform_sessions;
CREATE TRIGGER update_platform_sessions_updated_at BEFORE UPDATE ON public.platform_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update RLS policy
DROP POLICY IF EXISTS "Users can view own sessions" ON public.platform_sessions;
CREATE POLICY "Users can manage own platform sessions" ON public.platform_sessions
    FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 2. Update contacts table
-- ============================================================

-- Add platform column
ALTER TABLE public.contacts
ADD COLUMN platform platform_type DEFAULT 'whatsapp';

-- Rename whatsapp_id to be more generic and add new column
ALTER TABLE public.contacts
ADD COLUMN platform_contact_id TEXT;

-- Copy existing whatsapp_id to platform_contact_id
UPDATE public.contacts
SET platform_contact_id = whatsapp_id
WHERE platform_contact_id IS NULL;

-- Add username field (for Telegram/Instagram)
ALTER TABLE public.contacts
ADD COLUMN username TEXT;

-- Update unique constraint
ALTER TABLE public.contacts
DROP CONSTRAINT IF EXISTS contacts_user_id_whatsapp_id_key;

ALTER TABLE public.contacts
ADD CONSTRAINT contacts_user_platform_contact_key
UNIQUE (user_id, platform, platform_contact_id);

-- Add platform index
CREATE INDEX idx_contacts_platform ON public.contacts(platform);

-- ============================================================
-- 3. Update chats table
-- ============================================================

-- Add platform column
ALTER TABLE public.chats
ADD COLUMN platform platform_type DEFAULT 'whatsapp';

-- Rename whatsapp_chat_id to be more generic
ALTER TABLE public.chats
ADD COLUMN platform_chat_id TEXT;

-- Copy existing data
UPDATE public.chats
SET platform_chat_id = whatsapp_chat_id
WHERE platform_chat_id IS NULL;

-- Update unique constraint
ALTER TABLE public.chats
DROP CONSTRAINT IF EXISTS chats_user_id_whatsapp_chat_id_key;

ALTER TABLE public.chats
ADD CONSTRAINT chats_user_platform_chat_key
UNIQUE (user_id, platform, platform_chat_id);

-- Add platform index
CREATE INDEX idx_chats_platform ON public.chats(platform);

-- ============================================================
-- 4. Update messages table
-- ============================================================

-- Add platform column
ALTER TABLE public.messages
ADD COLUMN platform platform_type DEFAULT 'whatsapp';

-- Rename whatsapp_id to platform_message_id
ALTER TABLE public.messages
ADD COLUMN platform_message_id TEXT;

-- Copy existing data
UPDATE public.messages
SET platform_message_id = whatsapp_id
WHERE platform_message_id IS NULL;

-- Add content_type column for better message type handling
ALTER TABLE public.messages
ADD COLUMN content_type TEXT DEFAULT 'text';

-- Update existing type data to content_type
UPDATE public.messages
SET content_type = type
WHERE content_type = 'text' AND type IS NOT NULL AND type != 'text';

-- Add platform index
CREATE INDEX idx_messages_platform ON public.messages(platform);
CREATE INDEX idx_messages_platform_message_id ON public.messages(platform_message_id);

-- ============================================================
-- 5. Update ai_suggestions table
-- ============================================================

ALTER TABLE public.ai_suggestions
ADD COLUMN platform platform_type DEFAULT 'whatsapp';

CREATE INDEX idx_ai_suggestions_platform ON public.ai_suggestions(platform);

-- ============================================================
-- 6. Update promises table
-- ============================================================

ALTER TABLE public.promises
ADD COLUMN platform platform_type DEFAULT 'whatsapp';

CREATE INDEX idx_promises_platform ON public.promises(platform);

-- ============================================================
-- 7. Create platform_settings table
-- ============================================================

CREATE TABLE public.platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    platform platform_type NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    auto_reply_enabled BOOLEAN DEFAULT FALSE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    settings JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, platform)
);

-- Enable RLS on new table
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own platform settings" ON public.platform_settings
    FOR ALL USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_platform_settings_updated_at BEFORE UPDATE ON public.platform_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 8. Create view for cross-platform message stats
-- ============================================================

CREATE OR REPLACE VIEW public.platform_message_stats AS
SELECT
    user_id,
    platform,
    COUNT(*) as message_count,
    COUNT(*) FILTER (WHERE from_me = true) as sent_count,
    COUNT(*) FILTER (WHERE from_me = false) as received_count,
    MAX(timestamp) as last_message_at
FROM public.messages
GROUP BY user_id, platform;

-- ============================================================
-- 9. Add comments for documentation
-- ============================================================

COMMENT ON TYPE platform_type IS 'Supported messaging platforms: whatsapp, telegram, imessage, instagram';
COMMENT ON TABLE public.platform_sessions IS 'Active messaging platform connections for users';
COMMENT ON TABLE public.platform_settings IS 'Per-platform user settings and preferences';
COMMENT ON COLUMN public.platform_sessions.bot_token IS 'Telegram bot token (encrypted)';
COMMENT ON COLUMN public.platform_sessions.credentials IS 'Instagram credentials (encrypted JSON)';
COMMENT ON COLUMN public.platform_sessions.local_db_path IS 'iMessage database path (macOS only)';
