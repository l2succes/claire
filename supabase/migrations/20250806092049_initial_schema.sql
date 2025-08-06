-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- Users table (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp sessions table
CREATE TABLE public.whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    session_id TEXT UNIQUE NOT NULL,
    phone_number TEXT,
    status TEXT DEFAULT 'disconnected',
    qr_code TEXT,
    session_data JSONB,
    last_connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, phone_number)
);

-- Contacts table
CREATE TABLE public.contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    whatsapp_id TEXT NOT NULL,
    phone_number TEXT,
    name TEXT,
    avatar_url TEXT,
    is_group BOOLEAN DEFAULT FALSE,
    inferred_name TEXT,
    inferred_relationship TEXT,
    inference_confidence FLOAT,
    inference_signals JSONB,
    inference_confirmed BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, whatsapp_id)
);

-- Chats table
CREATE TABLE public.chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    whatsapp_chat_id TEXT NOT NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
    name TEXT,
    is_group BOOLEAN DEFAULT FALSE,
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER DEFAULT 0,
    is_muted BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, whatsapp_chat_id)
);

-- Messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES public.contacts(id),
    whatsapp_id TEXT UNIQUE NOT NULL,
    content TEXT,
    from_me BOOLEAN DEFAULT FALSE,
    type TEXT DEFAULT 'text', -- text, image, video, audio, document, sticker, location
    media_url TEXT,
    media_mime_type TEXT,
    status TEXT, -- sent, delivered, read
    timestamp TIMESTAMPTZ NOT NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI suggestions table
CREATE TABLE public.ai_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    suggestions JSONB NOT NULL,
    confidence FLOAT,
    reasoning TEXT,
    selected_index INTEGER,
    feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Promises/commitments table
CREATE TABLE public.promises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    message_id TEXT,
    chat_id UUID REFERENCES public.chats(id),
    contact_id UUID REFERENCES public.contacts(id),
    type TEXT NOT NULL, -- commitment, deadline, appointment, task
    content TEXT NOT NULL,
    deadline TIMESTAMPTZ,
    priority TEXT DEFAULT 'medium', -- low, medium, high
    confidence FLOAT,
    from_me BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'pending', -- pending, completed, cancelled, overdue
    completed_at TIMESTAMPTZ,
    reminder_sent_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contact inferences history table
CREATE TABLE public.contact_inferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL,
    inferred_name TEXT,
    inferred_relationship TEXT,
    confidence FLOAT,
    signals JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences table
CREATE TABLE public.user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    tone TEXT DEFAULT 'friendly',
    response_style TEXT DEFAULT 'concise',
    auto_reply_enabled BOOLEAN DEFAULT FALSE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    promise_tracking_enabled BOOLEAN DEFAULT TRUE,
    contact_inference_enabled BOOLEAN DEFAULT TRUE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    language TEXT DEFAULT 'en',
    preferences JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-reply rules table
CREATE TABLE public.auto_reply_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL, -- keyword, contact, time, always
    trigger_value JSONB,
    response_template TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 0,
    used_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_messages_user_chat ON public.messages(user_id, chat_id);
CREATE INDEX idx_messages_timestamp ON public.messages(timestamp DESC);
CREATE INDEX idx_messages_whatsapp_id ON public.messages(whatsapp_id);
CREATE INDEX idx_chats_user_last_message ON public.chats(user_id, last_message_at DESC);
CREATE INDEX idx_promises_user_status ON public.promises(user_id, status);
CREATE INDEX idx_promises_deadline ON public.promises(deadline);
CREATE INDEX idx_contacts_user_whatsapp ON public.contacts(user_id, whatsapp_id);
CREATE INDEX idx_whatsapp_sessions_user ON public.whatsapp_sessions(user_id);
CREATE INDEX idx_whatsapp_sessions_status ON public.whatsapp_sessions(status);

-- Create full text search index on messages
CREATE INDEX idx_messages_content_search ON public.messages USING gin(to_tsvector('english', content));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_sessions_updated_at BEFORE UPDATE ON public.whatsapp_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON public.chats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_suggestions_updated_at BEFORE UPDATE ON public.ai_suggestions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_promises_updated_at BEFORE UPDATE ON public.promises
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_auto_reply_rules_updated_at BEFORE UPDATE ON public.auto_reply_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_inferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_rules ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (users can only access their own data)
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own sessions" ON public.whatsapp_sessions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own contacts" ON public.contacts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own chats" ON public.chats
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own messages" ON public.messages
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own suggestions" ON public.ai_suggestions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own promises" ON public.promises
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own inferences" ON public.contact_inferences
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own preferences" ON public.user_preferences
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own auto-reply rules" ON public.auto_reply_rules
    FOR ALL USING (auth.uid() = user_id);