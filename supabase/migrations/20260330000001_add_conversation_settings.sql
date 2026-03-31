-- Chat categories: classify conversations for AI-tailored suggestions
CREATE TABLE chat_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  chat_id UUID NOT NULL REFERENCES chats(id),
  category TEXT NOT NULL CHECK (category IN ('personal', 'friend', 'business', 'trip', 'romantic')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, chat_id)
);
ALTER TABLE chat_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own chat_categories" ON chat_categories FOR ALL USING (auth.uid() = user_id);

-- Contact profiles: user-editable + AI-inferred contact info
CREATE TABLE contact_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  chat_id UUID REFERENCES chats(id),
  display_name TEXT,
  email TEXT,
  phone_number TEXT,
  location TEXT,
  key_facts JSONB DEFAULT '[]'::jsonb,
  relationship_context TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, chat_id)
);
ALTER TABLE contact_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contact_profiles" ON contact_profiles FOR ALL USING (auth.uid() = user_id);

-- Smart cards: AI-generated actionable suggestion cards
CREATE TABLE smart_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  chat_id UUID NOT NULL REFERENCES chats(id),
  card_type TEXT NOT NULL CHECK (card_type IN ('maps', 'flight', 'datetime', 'reminder', 'action')),
  title TEXT NOT NULL,
  subtitle TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT DEFAULT 0,
  dismissed BOOLEAN DEFAULT false,
  acted_on BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE smart_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own smart_cards" ON smart_cards FOR ALL USING (auth.uid() = user_id);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE chat_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE contact_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE smart_cards;

-- Replica identity for realtime filters
ALTER TABLE chat_categories REPLICA IDENTITY FULL;
ALTER TABLE contact_profiles REPLICA IDENTITY FULL;
ALTER TABLE smart_cards REPLICA IDENTITY FULL;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
