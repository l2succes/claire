-- Queue creation alerts in the same transaction as the loop. This covers both
-- detector and user-authored loops, without replaying pre-existing rows.
CREATE FUNCTION public.enqueue_loop_created_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.visibility <> 'surfaced' OR NEW.status NOT IN ('open', 'waiting') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_preferences
    WHERE user_id = NEW.user_id
      AND (notification_enabled = false OR preferences->>'notify_loops' = 'false')
  ) THEN
    RETURN NEW;
  END IF;

  -- Revision zero is reserved for creation. Reminder revisions start at one,
  -- so acceptance recovery cannot mistake this alert for a due reminder.
  INSERT INTO notification_deliveries (
    user_id, device_id, loop_id, notification_type, subject_revision,
    state, outbox_payload
  )
  SELECT NEW.user_id, device.id, NEW.id, 'loop_created', 0, 'queued',
    jsonb_build_object(
      'title', 'New loop created',
      'body', left(coalesce(nullif(btrim(NEW.title), ''), NEW.content), 180),
      'collapseId', 'loop-created:' || NEW.id,
      'channelId', 'loops',
      'categoryId', 'claire_loop',
      'threadId', 'loops',
      'tag', 'loop-created:' || NEW.id,
      'data', jsonb_build_object(
        'version', 1,
        'type', 'loop_created',
        'loopId', NEW.id,
        'url', 'claire://loops/' || NEW.id
      )
    )
  FROM notification_devices device
  WHERE device.user_id = NEW.user_id AND device.enabled
  ON CONFLICT (loop_id, device_id, notification_type, subject_revision) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_loop_created_notification() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER loops_notify_created
AFTER INSERT ON public.loops
FOR EACH ROW EXECUTE FUNCTION public.enqueue_loop_created_notification();

NOTIFY pgrst, 'reload schema';
