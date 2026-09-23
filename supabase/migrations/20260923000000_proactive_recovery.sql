-- Recovery foundation. Apply before deploying the new workers. No historical
-- messages are replayed and no existing loop is closed by this migration.
ALTER TABLE public.loops
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN evidence_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN corrected_fields jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN next_review_at timestamptz,
  ADD COLUMN attention_reason text,
  ADD COLUMN reminder_quiet_reason text;
UPDATE public.loops SET corrected_fields = '{"owner":true,"requester":true,"deadline":true,"deadline_precision":true}' WHERE user_edited;
ALTER TABLE public.loop_events ADD COLUMN operation_key text;
CREATE UNIQUE INDEX loop_events_operation_key ON public.loop_events(user_id, operation_key)
  WHERE operation_key IS NOT NULL;

CREATE FUNCTION public.guard_loop_lifecycle() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IN ('done','dropped') AND NEW.status IS DISTINCT FROM OLD.status
    AND current_setting('claire.loop_actor', true) IS DISTINCT FROM 'user' THEN
    RAISE EXCEPTION 'Use the reviewed loop transition endpoint' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.resolution IS DISTINCT FROM OLD.resolution
    OR (OLD.thread_state = 'resolved' AND NEW.thread_state <> 'resolved') THEN
    IF NEW.status IN ('done','dropped') THEN
      IF NEW.status = 'dropped' AND NEW.resolution = 'fulfilled' THEN NEW.resolution := 'user_dismissed'; END IF;
      NEW.thread_state := 'resolved';
      NEW.resolution := coalesce(NEW.resolution, CASE WHEN NEW.status = 'done' THEN 'fulfilled' ELSE 'user_dismissed' END);
      IF NEW.resolution <> 'fulfilled' THEN NEW.status := 'dropped'; END IF;
      NEW.resolved_at := coalesce(NEW.resolved_at, now());
      NEW.completed_at := CASE WHEN NEW.status = 'done' THEN coalesce(NEW.completed_at, now()) ELSE NULL END;
      NEW.snoozed_until := NULL;
    ELSE
      NEW.resolved_at := NULL; NEW.completed_at := NULL; NEW.resolution := NULL;
      IF NEW.thread_state = 'resolved' THEN NEW.thread_state := 'agreed'; END IF;
      IF NEW.status <> 'snoozed' THEN NEW.snoozed_until := NULL; END IF;
    END IF;
  ELSIF NEW.thread_state = 'resolved' AND NEW.status IN ('open','waiting','snoozed')
    AND NEW.thread_state IS DISTINCT FROM OLD.thread_state THEN
    RAISE EXCEPTION 'Close a loop using a resolution, not a thread-state update' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    (to_jsonb(NEW) - ARRAY['updated_at','row_version','last_detected_at','detector_version','evidence_count',
       'priority_score','priority_updated_at','priority_breakdown','reminder_plan_state','reminder_reason','next_reminder_at',
       'reminder_sent_at','reminder_count','reminder_revision','next_review_at','attention_reason','reminder_quiet_reason'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['updated_at','row_version','last_detected_at','detector_version','evidence_count',
       'priority_score','priority_updated_at','priority_breakdown','reminder_plan_state','reminder_reason','next_reminder_at',
       'reminder_sent_at','reminder_count','reminder_revision','next_review_at','attention_reason','reminder_quiet_reason'])
  ) THEN
    NEW.row_version := OLD.row_version + 1;
    NEW.next_review_at := NULL;
    NEW.reminder_plan_state := 'pending';
    NEW.reminder_revision := OLD.reminder_revision + 1;
    NEW.next_reminder_at := NULL;
  END IF;
  RETURN NEW;
END $$;
-- Run before the existing reminder invalidation trigger.
CREATE TRIGGER loops_guard_lifecycle BEFORE INSERT OR UPDATE ON public.loops
  FOR EACH ROW EXECUTE FUNCTION public.guard_loop_lifecycle();

CREATE FUNCTION public.apply_loop_transition(
  p_user_id uuid, p_loop_id uuid, p_expected_version bigint, p_patch jsonb,
  p_actor text, p_kind text, p_summary text, p_payload jsonb DEFAULT '{}',
  p_operation_key text DEFAULT NULL
) RETURNS public.loops LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_row public.loops; candidate public.loops; k text; suggestion public.loop_events;
BEGIN
  SELECT * INTO current_row FROM public.loops WHERE id = p_loop_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Loop not found' USING ERRCODE = 'P0002'; END IF;
  IF p_operation_key IS NOT NULL AND EXISTS (SELECT 1 FROM loop_events WHERE user_id = p_user_id AND operation_key = p_operation_key AND loop_id = p_loop_id) THEN RETURN current_row; END IF;
  IF p_expected_version IS NULL OR current_row.row_version <> p_expected_version THEN RAISE EXCEPTION 'Loop changed; refresh before applying' USING ERRCODE = '40001'; END IF;
  IF p_actor NOT IN ('user','detector','system') THEN RAISE EXCEPTION 'Invalid actor'; END IF;
  IF p_actor <> 'user' AND (current_row.status IN ('done','dropped') OR p_patch->>'status' IN ('done','dropped') OR p_patch->>'thread_state' = 'resolved') THEN
    RAISE EXCEPTION 'Autonomous closure requires user review' USING ERRCODE = '23514';
  END IF;
  IF p_patch->>'status' = 'snoozed' AND current_row.status IN ('done','dropped') THEN
    RAISE EXCEPTION 'Reopen before snoozing' USING ERRCODE = '23514';
  END IF;
  IF p_payload ? 'reviewedSuggestionEventId' THEN
    SELECT * INTO suggestion FROM loop_events WHERE id = (p_payload->>'reviewedSuggestionEventId')::uuid AND loop_id = p_loop_id AND user_id = p_user_id AND kind = 'agent_note';
    IF NOT FOUND OR NOT (suggestion.payload ? 'suggestedResolution') OR (suggestion.payload->>'expectedVersion')::bigint IS DISTINCT FROM current_row.row_version THEN
      RAISE EXCEPTION 'Suggestion is stale; refresh the loop' USING ERRCODE = '40001';
    END IF;
    IF (suggestion.payload->>'expectedChatGeneration')::bigint IS DISTINCT FROM coalesce((SELECT generation FROM chat_loop_work WHERE user_id=p_user_id AND chat_id=current_row.chat_id),0) THEN RAISE EXCEPTION 'Conversation changed; review new evidence first' USING ERRCODE='40001'; END IF;
    IF p_patch ? 'resolution' AND p_patch->>'resolution' <> suggestion.payload->>'suggestedResolution' THEN RAISE EXCEPTION 'Suggestion resolution mismatch' USING ERRCODE = '23514'; END IF;
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF k <> ALL(ARRAY['status','thread_state','owner','requester','title','content','notes','deadline','deadline_precision','priority','state_summary','latest_message_id','last_evidence_at','confidence','reviewed_at','snoozed_until','resolution','last_detected_at','detector_version','evidence_generation','visibility']) THEN RAISE EXCEPTION 'Unsupported loop field: %', k; END IF;
    IF p_actor = 'detector' AND (current_row.corrected_fields ? k ) THEN p_patch := p_patch - k; END IF;
  END LOOP;
  PERFORM set_config('claire.loop_actor',p_actor,true);
  IF p_patch <> '{}' THEN
    candidate := jsonb_populate_record(current_row, p_patch);
    UPDATE loops SET status = candidate.status, thread_state = candidate.thread_state,
      owner = candidate.owner, requester = candidate.requester, title = candidate.title,
      content = candidate.content, notes = candidate.notes, deadline = candidate.deadline,
      deadline_precision = candidate.deadline_precision, priority = candidate.priority,
      state_summary = candidate.state_summary, latest_message_id = candidate.latest_message_id,
      last_evidence_at = candidate.last_evidence_at, confidence = candidate.confidence,
      reviewed_at = candidate.reviewed_at, snoozed_until = candidate.snoozed_until,
      resolution = candidate.resolution, last_detected_at = candidate.last_detected_at,
      visibility = candidate.visibility, detector_version = candidate.detector_version, evidence_generation = candidate.evidence_generation,
      user_edited = current_row.user_edited OR p_actor = 'user',
      corrected_fields = CASE WHEN p_actor = 'user' THEN current_row.corrected_fields ||
        (SELECT coalesce(jsonb_object_agg(key, true),'{}') FROM jsonb_each(p_patch) WHERE key IN ('owner','requester','deadline','deadline_precision','title','content','thread_state')) ELSE current_row.corrected_fields END
    WHERE id = p_loop_id RETURNING * INTO current_row;
  END IF;
  INSERT INTO loop_events(loop_id,user_id,kind,actor,summary,payload,operation_key)
    VALUES(p_loop_id,p_user_id,p_kind,p_actor,p_summary,p_payload,p_operation_key);
  IF p_kind = 'agent_note' AND p_payload ? 'suggestedResolution' THEN
    INSERT INTO loop_attention(user_id,loop_id,row_version,reason,next_action,due_at)
      VALUES(p_user_id,p_loop_id,current_row.row_version,'closure_suggestion','Review Claire’s suggested resolution',now())
      ON CONFLICT(loop_id) DO UPDATE SET row_version=excluded.row_version,reason=excluded.reason,next_action=excluded.next_action,due_at=excluded.due_at;
  END IF;
  RETURN current_row;
END $$;
REVOKE ALL ON FUNCTION public.apply_loop_transition(uuid,uuid,bigint,jsonb,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_loop_transition(uuid,uuid,bigint,jsonb,text,text,text,jsonb,text) TO service_role;

-- A per-chat generation is allocated while holding the chat work row lock.
-- Unlike a global sequence, it cannot commit out of order within a chat.
CREATE TABLE public.chat_loop_work (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  generation bigint NOT NULL DEFAULT 0, processed_generation bigint NOT NULL DEFAULT 0,
  first_dirty_at timestamptz NOT NULL DEFAULT now(), next_run_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
  last_error text, last_success_at timestamptz,
  PRIMARY KEY(user_id,chat_id)
);
ALTER TABLE public.chat_loop_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ADD COLUMN loop_ingest_seq bigint NOT NULL DEFAULT 0;
ALTER TABLE public.chat_loop_cursors ADD COLUMN last_ingest_seq bigint NOT NULL DEFAULT 0;
CREATE INDEX messages_loop_ingest ON public.messages(user_id,chat_id,loop_ingest_seq) WHERE loop_ingest_seq > 0;
CREATE FUNCTION public.mark_chat_loop_dirty() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE seq bigint;
BEGIN
  IF NEW.chat_id IS NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.content,NEW.is_deleted,NEW.from_me,NEW.timestamp) IS NOT DISTINCT FROM ROW(OLD.content,OLD.is_deleted,OLD.from_me,OLD.timestamp) THEN RETURN NEW; END IF;
  INSERT INTO chat_loop_work(user_id,chat_id,generation,next_run_at) VALUES(NEW.user_id,NEW.chat_id,1,now() + interval '45 seconds')
    ON CONFLICT(user_id,chat_id) DO UPDATE SET generation = chat_loop_work.generation + 1,
      first_dirty_at = CASE WHEN chat_loop_work.generation = chat_loop_work.processed_generation THEN now() ELSE chat_loop_work.first_dirty_at END,
      next_run_at = least(now() + interval '45 seconds', CASE WHEN chat_loop_work.generation = chat_loop_work.processed_generation THEN now() ELSE chat_loop_work.first_dirty_at END + interval '3 minutes')
    RETURNING generation INTO seq;
  -- AFTER excludes attempted inserts that resolve to an unchanged upsert.
  -- Updating only the sequence does not recursively fire this column trigger.
  UPDATE messages SET loop_ingest_seq = seq WHERE id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER messages_mark_loop_dirty AFTER INSERT OR UPDATE OF content,is_deleted,from_me,timestamp ON public.messages FOR EACH ROW EXECUTE FUNCTION public.mark_chat_loop_dirty();
CREATE FUNCTION public.claim_chat_loop_work() RETURNS SETOF public.chat_loop_work LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE chat_loop_work w SET lease_token = gen_random_uuid(), lease_until = now() + interval '5 minutes', attempts = attempts + 1
  WHERE (w.user_id,w.chat_id) IN (
    SELECT q.user_id,q.chat_id FROM chat_loop_work q
    WHERE q.generation > q.processed_generation AND q.next_run_at <= now() AND coalesce(q.lease_until,'-infinity') < now()
    ORDER BY q.next_run_at LIMIT 4 FOR UPDATE SKIP LOCKED
  ) RETURNING w.*;
$$;
REVOKE ALL ON FUNCTION public.claim_chat_loop_work() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_chat_loop_work() TO service_role;

-- Durable loop push payloads bridge the database/Redis commit gap.
ALTER TABLE public.notification_deliveries
  ADD COLUMN outbox_payload jsonb,
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_until timestamptz;
CREATE INDEX notification_outbox_due ON public.notification_deliveries(next_attempt_at)
  WHERE outbox_payload IS NOT NULL AND state = 'queued';
CREATE FUNCTION public.claim_loop_delivery(p_id uuid) RETURNS SETOF public.notification_deliveries LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE notification_deliveries SET lease_token = gen_random_uuid(), lease_until = now() + interval '2 minutes', attempts = attempts + 1
  WHERE id = p_id AND state = 'queued' AND next_attempt_at <= now() AND coalesce(lease_until,'-infinity') < now() RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_loop_delivery(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_loop_delivery(uuid) TO service_role;

-- Reserve once per episode, shared across devices and concurrent workers.
CREATE TABLE public.loop_notification_budget (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  local_day date NOT NULL, episode text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,episode)
);
ALTER TABLE public.loop_notification_budget ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.reserve_loop_notification(p_user_id uuid,p_episode text,p_timezone text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE today date; selected_channel text := CASE WHEN p_episode LIKE 'digest:%' THEN 'digest' ELSE 'standalone' END;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,20260923));
 today := loop_local_day(p_user_id);
 IF selected_channel='standalone' AND EXISTS(SELECT 1 FROM loop_push_episodes WHERE user_id=p_user_id AND episode=p_episode AND channel='digest') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM loop_notification_budget WHERE user_id=p_user_id AND episode=p_episode AND local_day=today) THEN RETURN true; END IF;
 IF (SELECT count(*) FROM loop_notification_budget WHERE user_id=p_user_id AND local_day=today AND channel=selected_channel) >= (CASE WHEN selected_channel='digest' THEN 1 ELSE 2 END) THEN RETURN false; END IF;
 INSERT INTO loop_notification_budget(user_id,local_day,episode,channel) VALUES(p_user_id,today,p_episode,selected_channel)
 ON CONFLICT(user_id,episode) DO UPDATE SET local_day=excluded.local_day;
 INSERT INTO loop_push_episodes(user_id,episode,channel) VALUES(p_user_id,p_episode,selected_channel) ON CONFLICT DO NOTHING;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reserve_loop_notification(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_loop_notification(uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';

ALTER TABLE public.loops DROP CONSTRAINT loops_reminder_plan_state_check,
  ADD CONSTRAINT loops_reminder_plan_state_check CHECK(reminder_plan_state IN ('pending','scheduled','quiet','enqueued','sent'));
CREATE TABLE public.loop_attention (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  loop_id uuid PRIMARY KEY REFERENCES public.loops(id) ON DELETE CASCADE,
  row_version bigint NOT NULL, reason text NOT NULL, next_action text NOT NULL,
  due_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loop_attention ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own loop attention" ON public.loop_attention FOR SELECT USING (auth.uid() = user_id);

CREATE FUNCTION public.accept_loop_reminder(p_loop_id uuid,p_user_id uuid,p_revision integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE accepted public.loops;
BEGIN
  UPDATE loops SET reminder_plan_state = 'sent', reminder_sent_at = now(), reminder_count = reminder_count + 1,
    next_reminder_at = NULL, next_review_at = now() + interval '48 hours'
  WHERE id = p_loop_id AND user_id = p_user_id AND reminder_revision = p_revision
    AND reminder_plan_state <> 'sent' AND status IN ('open','waiting','snoozed')
    AND NOT EXISTS(SELECT 1 FROM loop_events WHERE user_id=p_user_id AND operation_key='reminder-accepted:' || p_loop_id || ':' || p_revision)
    RETURNING * INTO accepted;
  IF FOUND THEN
    INSERT INTO loop_events(loop_id,user_id,kind,actor,summary,payload,operation_key)
      VALUES(p_loop_id,p_user_id,'reminder_sent','system','Reminder accepted by push provider',jsonb_build_object('revision',p_revision),'reminder-accepted:' || p_loop_id || ':' || p_revision)
      ON CONFLICT DO NOTHING;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.accept_loop_reminder(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_loop_reminder(uuid,uuid,integer) TO service_role;

CREATE FUNCTION public.refresh_loop_reviews() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Heal the acceptance/loop-update commit gap from the durable delivery ledger.
  PERFORM accept_loop_digest(d.digest_id,d.user_id) FROM notification_deliveries d
    WHERE d.digest_id IS NOT NULL AND d.state IN ('submitted','delivered')
      AND EXISTS(SELECT 1 FROM loop_digest_items i JOIN loops l ON l.id=i.loop_id WHERE i.digest_id=d.digest_id AND i.revision=l.reminder_revision AND l.reminder_plan_state <> 'sent');
  PERFORM accept_loop_reminder(d.loop_id,d.user_id,d.subject_revision)
    FROM notification_deliveries d JOIN loops l ON l.id = d.loop_id
    WHERE d.state IN ('submitted','delivered') AND l.reminder_revision = d.subject_revision
      AND l.reminder_plan_state = 'enqueued';
  UPDATE loops SET reminder_plan_state = 'pending', reminder_revision = reminder_revision + 1
    WHERE status IN ('open','waiting') AND reminder_plan_state = 'sent' AND next_review_at <= now();
  -- Existing undated quiet loops need an initial plan, but this does not replay
  -- historical messages or infer a new deadline.
  UPDATE loops SET reminder_plan_state = 'pending'
    WHERE status IN ('open','waiting') AND visibility = 'surfaced' AND thread_state IN ('agreed','pending_confirmation')
      AND reminder_plan_state = 'quiet' AND reminder_quiet_reason IS NULL;
  INSERT INTO loop_attention(user_id,loop_id,row_version,reason,next_action,due_at)
    SELECT user_id,id,row_version,
      CASE WHEN thread_state IN ('proposed','negotiating') THEN 'stale_proposal' WHEN owner = 'them' THEN 'waiting_on_them' ELSE 'follow_up' END,
      CASE WHEN thread_state IN ('proposed','negotiating') THEN 'Review whether this is still relevant' WHEN owner = 'them' THEN 'Follow up with the other person' ELSE 'Review your next action' END,
      coalesce(next_review_at,last_evidence_at + interval '48 hours',created_at + interval '48 hours')
    FROM loops WHERE status IN ('open','waiting') AND visibility = 'surfaced'
      AND coalesce(reviewed_at, '-infinity') < now() - interval '48 hours'
      AND (next_review_at <= now() OR coalesce(last_evidence_at,created_at) <= now() - interval '7 days')
    ON CONFLICT(loop_id) DO UPDATE SET row_version = excluded.row_version, reason = excluded.reason,
      next_action = excluded.next_action, due_at = excluded.due_at, updated_at = now()
    WHERE (loop_attention.row_version,loop_attention.reason,loop_attention.next_action,loop_attention.due_at)
      IS DISTINCT FROM (excluded.row_version,excluded.reason,excluded.next_action,excluded.due_at)
      AND (loop_attention.reason <> 'closure_suggestion' OR loop_attention.row_version <> excluded.row_version);
  DELETE FROM loop_attention a USING loops l WHERE a.loop_id = l.id AND
    (l.status NOT IN ('open','waiting') OR l.visibility <> 'surfaced' OR l.row_version <> a.row_version OR l.reviewed_at > now() - interval '48 hours');
END $$;
REVOKE ALL ON FUNCTION public.refresh_loop_reviews() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_loop_reviews() TO service_role;
NOTIFY pgrst, 'reload schema';


GRANT ALL ON public.chat_loop_work, public.loop_attention, public.loop_notification_budget TO service_role;
GRANT SELECT ON public.loop_attention TO authenticated;
NOTIFY pgrst, 'reload schema';

CREATE FUNCTION public.advance_chat_loop_cursor(p_user_id uuid,p_chat_id uuid,p_timestamp timestamptz,p_message_id uuid,p_produced boolean,p_result text,p_ingest_seq bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO chat_loop_cursors(user_id,chat_id,last_message_timestamp,last_message_id,last_run_at,last_gate_result,consecutive_empty,last_ingest_seq)
 VALUES(p_user_id,p_chat_id,p_timestamp,p_message_id,now(),p_result,CASE WHEN p_produced THEN 0 ELSE 1 END,p_ingest_seq)
 ON CONFLICT(user_id,chat_id) DO UPDATE SET last_message_timestamp=excluded.last_message_timestamp,last_message_id=excluded.last_message_id,
   last_run_at=now(),last_gate_result=excluded.last_gate_result,last_ingest_seq=excluded.last_ingest_seq,
   consecutive_empty=CASE WHEN p_produced THEN 0 ELSE chat_loop_cursors.consecutive_empty+1 END
 WHERE chat_loop_cursors.last_ingest_seq <= excluded.last_ingest_seq;
END $$;
REVOKE ALL ON FUNCTION public.advance_chat_loop_cursor(uuid,uuid,timestamptz,uuid,boolean,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.advance_chat_loop_cursor(uuid,uuid,timestamptz,uuid,boolean,text,bigint) TO service_role;

CREATE TABLE public.loop_recovery_runs (
  plan_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.users(id),
  scope jsonb NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.loop_recovery_runs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.loop_recovery_runs TO service_role;
CREATE FUNCTION public.apply_loop_recovery(p_user_id uuid,p_plan_hash text,p_scope jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c jsonb; work public.chat_loop_work; n integer; total integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,20260924));
  IF EXISTS(SELECT 1 FROM loop_recovery_runs WHERE plan_hash=p_plan_hash AND user_id=p_user_id AND scope=p_scope) THEN RETURN jsonb_build_object('alreadyApplied',true); END IF;
  IF jsonb_array_length(p_scope) > 20 THEN RAISE EXCEPTION 'Recovery is limited to 20 chats per plan'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(p_scope) LOOP
    IF jsonb_array_length(c->'messageIds') > 200 THEN RAISE EXCEPTION 'Recovery is limited to 200 messages per chat'; END IF;
    IF NOT EXISTS(SELECT 1 FROM chats WHERE id=(c->>'chatId')::uuid AND user_id=p_user_id) THEN RAISE EXCEPTION 'Conversation not owned'; END IF;
    INSERT INTO chat_loop_work(user_id,chat_id) VALUES(p_user_id,(c->>'chatId')::uuid) ON CONFLICT DO NOTHING;
    SELECT * INTO work FROM chat_loop_work WHERE user_id=p_user_id AND chat_id=(c->>'chatId')::uuid FOR UPDATE;
    IF work.generation <> (c->>'generation')::bigint OR work.lease_until > now() THEN RAISE EXCEPTION 'Conversation changed or is being processed; regenerate recovery plan' USING ERRCODE='40001'; END IF;
    WITH selected AS (
      SELECT id,row_number() OVER(ORDER BY timestamp,id) AS position FROM messages
      WHERE user_id=p_user_id AND chat_id=work.chat_id AND id IN (SELECT value::uuid FROM jsonb_array_elements_text(c->'messageIds'))
    ) UPDATE messages m SET loop_ingest_seq=work.generation+s.position FROM selected s WHERE m.id=s.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> jsonb_array_length(c->'messageIds') THEN RAISE EXCEPTION 'Recovery messages changed; regenerate plan'; END IF;
    UPDATE chat_loop_work SET generation=work.generation+n,first_dirty_at=now(),next_run_at=now()+interval '45 seconds',last_error=NULL WHERE user_id=p_user_id AND chat_id=work.chat_id;
    total := total+n;
  END LOOP;
  INSERT INTO loop_recovery_runs(plan_hash,user_id,scope) VALUES(p_plan_hash,p_user_id,p_scope);
  RETURN jsonb_build_object('alreadyApplied',false,'messagesQueued',total);
END $$;
REVOKE ALL ON FUNCTION public.apply_loop_recovery(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_loop_recovery(uuid,text,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';

CREATE FUNCTION public.replan_loop_push_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
   IF TG_TABLE_NAME = 'user_preferences' THEN
     IF NEW.notification_enabled IS NOT DISTINCT FROM OLD.notification_enabled AND NEW.preferences IS NOT DISTINCT FROM OLD.preferences THEN RETURN NEW; END IF;
   ELSE
     IF NEW.enabled IS NOT DISTINCT FROM OLD.enabled AND NEW.token IS NOT DISTINCT FROM OLD.token AND NEW.timezone IS NOT DISTINCT FROM OLD.timezone THEN RETURN NEW; END IF;
   END IF;
 END IF;
 UPDATE loops SET reminder_plan_state='pending',reminder_revision=reminder_revision+1,reminder_quiet_reason=NULL,next_reminder_at=NULL
 WHERE user_id=NEW.user_id AND status IN ('open','waiting','snoozed') AND reminder_plan_state <> 'sent';
 RETURN NEW;
END $$;
CREATE TRIGGER user_preferences_replan_loop_push AFTER INSERT OR UPDATE OF notification_enabled,preferences ON public.user_preferences FOR EACH ROW EXECUTE FUNCTION public.replan_loop_push_policy();
CREATE TRIGGER notification_devices_replan_loop_push AFTER INSERT OR UPDATE OF enabled,token,timezone ON public.notification_devices FOR EACH ROW EXECUTE FUNCTION public.replan_loop_push_policy();
NOTIFY pgrst, 'reload schema';

CREATE FUNCTION public.record_loop_creation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO loop_events(loop_id,user_id,kind,actor,summary,payload)
 VALUES(NEW.id,NEW.user_id,'created',CASE WHEN NEW.source='user' THEN 'user' ELSE 'detector' END,coalesce(NEW.state_summary,NEW.title),jsonb_build_object('threadState',NEW.thread_state,'visibility',NEW.visibility));
 RETURN NEW;
END $$;
CREATE TRIGGER loops_record_creation AFTER INSERT ON public.loops FOR EACH ROW EXECUTE FUNCTION public.record_loop_creation();
NOTIFY pgrst, 'reload schema';

-- One daily digest of up to three ordinary follow-ups, plus two standalone
-- interruptions. Claims prevent the same episode appearing in both channels.
CREATE TABLE public.loop_push_episodes (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  episode text NOT NULL, channel text NOT NULL, PRIMARY KEY(user_id,episode)
);
CREATE TABLE public.loop_daily_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  local_day date NOT NULL, UNIQUE(user_id,local_day)
);
CREATE TABLE public.loop_digest_items (
  digest_id uuid NOT NULL REFERENCES public.loop_daily_digests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  loop_id uuid NOT NULL REFERENCES public.loops(id) ON DELETE CASCADE,
  revision integer NOT NULL, title text NOT NULL, PRIMARY KEY(digest_id,loop_id)
);
ALTER TABLE public.loop_push_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loop_daily_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loop_digest_items ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.loop_push_episodes,public.loop_daily_digests,public.loop_digest_items TO service_role;
ALTER TABLE public.notification_deliveries ADD COLUMN digest_id uuid REFERENCES public.loop_daily_digests(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX notification_digest_device ON public.notification_deliveries(digest_id,device_id);
ALTER TABLE public.loop_notification_budget ADD COLUMN channel text NOT NULL DEFAULT 'standalone';

CREATE FUNCTION public.loop_local_day(p_user_id uuid) RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 RETURN (now() AT TIME ZONE coalesce((SELECT timezone FROM user_preferences WHERE user_id=p_user_id LIMIT 1),'UTC'))::date;
EXCEPTION WHEN invalid_parameter_value THEN RETURN (now() AT TIME ZONE 'UTC')::date;
END $$;
REVOKE ALL ON FUNCTION public.loop_local_day(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.loop_local_day(uuid) TO service_role;



CREATE FUNCTION public.prepare_loop_digests() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE person record; digest uuid; item record; today date; total integer := 0;
BEGIN
 FOR person IN SELECT DISTINCT a.user_id FROM loop_attention a
   LEFT JOIN user_preferences p ON p.user_id=a.user_id
   WHERE a.due_at <= now() AND coalesce(p.notification_enabled,true) AND coalesce((p.preferences->>'notify_loops')::boolean,true)
   AND EXISTS(SELECT 1 FROM notification_devices WHERE user_id=a.user_id AND enabled)
   AND NOT EXISTS(SELECT 1 FROM loop_daily_digests WHERE user_id=a.user_id AND local_day=loop_local_day(a.user_id)) LIMIT 100
 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended(person.user_id::text,20260923));
  today := loop_local_day(person.user_id);
  INSERT INTO loop_daily_digests(user_id,local_day) VALUES(person.user_id,today) ON CONFLICT DO NOTHING RETURNING id INTO digest;
  IF digest IS NULL THEN CONTINUE; END IF;
  FOR item IN SELECT l.* FROM loops l JOIN loop_attention a ON a.loop_id=l.id
    WHERE l.user_id=person.user_id AND l.status IN ('open','waiting') AND l.visibility='surfaced'
      AND l.reminder_plan_state IN ('scheduled','enqueued') AND l.next_reminder_at <= now()
      AND l.priority_score < 80 AND a.row_version=l.row_version AND a.due_at <= now()
      AND NOT EXISTS(SELECT 1 FROM loop_push_episodes e WHERE e.user_id=l.user_id AND e.episode=l.id::text || ':' || l.reminder_revision)
    ORDER BY l.priority_score DESC,a.due_at,l.id LIMIT 3 FOR UPDATE OF l SKIP LOCKED
  LOOP
    INSERT INTO loop_push_episodes(user_id,episode,channel) VALUES(person.user_id,item.id::text || ':' || item.reminder_revision,'digest') ON CONFLICT DO NOTHING;
    INSERT INTO loop_digest_items(digest_id,user_id,loop_id,revision,title) VALUES(digest,person.user_id,item.id,item.reminder_revision,coalesce(item.title,item.content));
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM loop_digest_items WHERE digest_id=digest) THEN DELETE FROM loop_daily_digests WHERE id=digest; CONTINUE; END IF;
  INSERT INTO notification_deliveries(user_id,device_id,digest_id,notification_type,state,outbox_payload)
    SELECT person.user_id,d.id,digest,'loop_digest','queued',jsonb_build_object('data',jsonb_build_object('type','loop_digest','digestId',digest))
    FROM notification_devices d WHERE d.user_id=person.user_id AND d.enabled;
  total := total+1;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.prepare_loop_digests() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_loop_digests() TO service_role;

CREATE FUNCTION public.accept_loop_digest(p_digest_id uuid,p_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM accept_loop_reminder(i.loop_id,i.user_id,i.revision) FROM loop_digest_items i JOIN loops l ON l.id=i.loop_id WHERE i.digest_id=p_digest_id AND i.user_id=p_user_id AND l.visibility='surfaced' AND (l.snoozed_until IS NULL OR l.snoozed_until <= now());
END $$;
REVOKE ALL ON FUNCTION public.accept_loop_digest(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.accept_loop_digest(uuid,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';

CREATE FUNCTION public.loop_recovery_health(p_user_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object(
  'preferences', (SELECT jsonb_build_object('detectionEnabled',loop_detection_enabled,'aiEnabled',coalesce((preferences->>'ai_enabled')::boolean,true),'notificationsEnabled',notification_enabled,'notifyLoops',coalesce((preferences->>'notify_loops')::boolean,true)) FROM user_preferences WHERE user_id = p_user_id),
  'enabledDevices',(SELECT count(*) FROM notification_devices WHERE user_id = p_user_id AND enabled),
  'dirtyChats',(SELECT count(*) FROM chat_loop_work WHERE user_id = p_user_id AND generation > processed_generation),
  'oldestDirtyAt',(SELECT min(first_dirty_at) FROM chat_loop_work WHERE user_id = p_user_id AND generation > processed_generation),
  'lastDetectionSuccess',(SELECT max(last_success_at) FROM chat_loop_work WHERE user_id = p_user_id),
  'detectionErrors',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT last_error,count(*) FROM chat_loop_work WHERE user_id = p_user_id AND last_error IS NOT NULL GROUP BY last_error) x),
  'deliveryStates',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT state,error_code,count(*) FROM notification_deliveries WHERE user_id = p_user_id AND (loop_id IS NOT NULL OR digest_id IS NOT NULL) AND queued_at > now() - interval '7 days' GROUP BY state,error_code) x),
  'attentionCount',(SELECT count(*) FROM loop_attention WHERE user_id = p_user_id AND due_at <= now()),
  'lastProviderAcceptance',(SELECT max(coalesce(submitted_at,delivered_at)) FROM notification_deliveries WHERE user_id = p_user_id AND (loop_id IS NOT NULL OR digest_id IS NOT NULL))
 );
$$;
REVOKE ALL ON FUNCTION public.loop_recovery_health(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.loop_recovery_health(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

CREATE INDEX loop_attention_due ON public.loop_attention(user_id,due_at);
CREATE INDEX loop_notification_budget_day ON public.loop_notification_budget(user_id,local_day,channel);
CREATE INDEX chat_loop_work_due ON public.chat_loop_work(next_run_at) WHERE generation > processed_generation;

-- Repair queued legacy loop deliveries whose Redis publication was lost.
UPDATE public.notification_deliveries d SET outbox_payload=jsonb_build_object(
  'title','Time to follow up','body',left(coalesce(l.title,l.content),180),
  'collapseId','loop:' || l.id || ':' || d.subject_revision,'channelId','loops','categoryId','claire_loop','threadId','loops',
  'data',jsonb_build_object('type','loop_reminder','loopId',l.id,'reason',l.reminder_reason,'url','claire://loops/' || l.id))
FROM public.loops l WHERE l.id=d.loop_id AND l.user_id=d.user_id AND d.state='queued' AND d.outbox_payload IS NULL;
NOTIFY pgrst, 'reload schema';
