-- Add missing columns to messages table that the dashboard queries expect

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS contact_name TEXT;

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS contact_phone TEXT;
