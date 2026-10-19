-- Opted-in group conversations should get follow-up detection sooner. The
-- previous 45 second quiet window and 3 minute active-chat cap made group
-- follow-ups feel stale even though they were already enabled by the user.
CREATE OR REPLACE FUNCTION public.mark_chat_loop_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq bigint;
  is_group_chat boolean := false;
  quiet_window interval;
  max_wait interval;
BEGIN
  IF NEW.chat_id IS NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.content,NEW.is_deleted,NEW.from_me,NEW.timestamp) IS NOT DISTINCT FROM ROW(OLD.content,OLD.is_deleted,OLD.from_me,OLD.timestamp) THEN RETURN NEW; END IF;

  SELECT coalesce(is_group, false) INTO is_group_chat
  FROM public.chats
  WHERE id = NEW.chat_id AND user_id = NEW.user_id;

  quiet_window := CASE WHEN is_group_chat THEN interval '10 seconds' ELSE interval '45 seconds' END;
  max_wait := CASE WHEN is_group_chat THEN interval '1 minute' ELSE interval '3 minutes' END;

  INSERT INTO public.chat_loop_work(user_id,chat_id,generation,next_run_at)
    VALUES(NEW.user_id,NEW.chat_id,1,now() + quiet_window)
    ON CONFLICT(user_id,chat_id) DO UPDATE SET
      generation = chat_loop_work.generation + 1,
      first_dirty_at = CASE WHEN chat_loop_work.generation = chat_loop_work.processed_generation THEN now() ELSE chat_loop_work.first_dirty_at END,
      next_run_at = least(
        now() + quiet_window,
        CASE WHEN chat_loop_work.generation = chat_loop_work.processed_generation THEN now() ELSE chat_loop_work.first_dirty_at END + max_wait
      )
    RETURNING generation INTO seq;

  -- AFTER excludes attempted inserts that resolve to an unchanged upsert.
  -- Updating only the sequence does not recursively fire this column trigger.
  UPDATE public.messages SET loop_ingest_seq = seq WHERE id = NEW.id;
  RETURN NEW;
END $$;
