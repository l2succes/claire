-- One account-level activity item per event, independent of push devices and
-- their delivery receipts. The client may only read and mark its own items read.
CREATE TABLE public.in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('message', 'loop')),
  event_key text NOT NULL,
  chat_id uuid REFERENCES public.chats(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  loop_id uuid REFERENCES public.loops(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  sender_name text,
  chat_name text,
  avatar_url text,
  platform text,
  is_group boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (user_id, kind, event_key)
);

CREATE INDEX in_app_notifications_recent_idx
  ON public.in_app_notifications (user_id, created_at DESC);
CREATE INDEX in_app_notifications_unread_idx
  ON public.in_app_notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX in_app_notifications_unread_chat_idx
  ON public.in_app_notifications (user_id, chat_id) WHERE read_at IS NULL AND chat_id IS NOT NULL;
CREATE INDEX in_app_notifications_unread_loop_idx
  ON public.in_app_notifications (user_id, loop_id) WHERE read_at IS NULL AND loop_id IS NOT NULL;

ALTER TABLE public.in_app_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own in-app notifications"
  ON public.in_app_notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users mark own in-app notifications read"
  ON public.in_app_notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.in_app_notifications FROM anon, authenticated;
GRANT SELECT ON public.in_app_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.in_app_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.in_app_notifications TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.in_app_notifications;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
