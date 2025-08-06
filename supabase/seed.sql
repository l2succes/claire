-- Seed file for Claire development database
-- This creates test data for local development

-- Note: This seed file is for development only
-- It assumes you have already created a test user via Supabase Auth

-- You can create a test user by running:
-- INSERT INTO auth.users (id, email, email_confirmed_at, encrypted_password, created_at, updated_at)
-- VALUES 
--   ('00000000-0000-0000-0000-000000000001', 'test@example.com', NOW(), crypt('password123', gen_salt('bf')), NOW(), NOW());

-- Create test user profile (if auth user exists)
INSERT INTO public.users (id, email, name, avatar_url)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'test@example.com', 'Test User', 'https://api.dicebear.com/7.x/avataaars/svg?seed=test')
ON CONFLICT (id) DO NOTHING;

-- Create user preferences
INSERT INTO public.user_preferences (user_id, tone, response_style, auto_reply_enabled, notification_enabled)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'friendly', 'concise', false, true)
ON CONFLICT (user_id) DO NOTHING;

-- Create a sample WhatsApp session
INSERT INTO public.whatsapp_sessions (user_id, session_id, phone_number, status)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'session_001', '+1234567890', 'disconnected')
ON CONFLICT (session_id) DO NOTHING;

-- Create sample contacts
INSERT INTO public.contacts (user_id, whatsapp_id, phone_number, name, is_group)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'contact_001', '+1234567891', 'John Doe', false),
  ('00000000-0000-0000-0000-000000000001', 'contact_002', '+1234567892', 'Jane Smith', false),
  ('00000000-0000-0000-0000-000000000001', 'group_001', '', 'Family Group', true)
ON CONFLICT (user_id, whatsapp_id) DO NOTHING;

-- Note: Additional test data can be added here as needed
-- Be careful not to add production data to this file