-- Minimal pre-recovery schema for testing real Postgres triggers/RPCs without
-- credentials or a running Supabase stack. Only use in a disposable database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE TABLE users(id uuid PRIMARY KEY);
CREATE TABLE chats(id uuid PRIMARY KEY, user_id uuid, ai_enabled boolean, is_group boolean);
CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, chat_id uuid, content text, timestamp timestamptz DEFAULT now(), from_me boolean DEFAULT false, is_deleted boolean DEFAULT false);
CREATE TABLE user_preferences(user_id uuid, preferences jsonb DEFAULT '{}', timezone text DEFAULT 'UTC', loop_detection_enabled boolean DEFAULT true, notification_enabled boolean DEFAULT true);
CREATE TABLE loops(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users, chat_id uuid REFERENCES chats,
 source text DEFAULT 'detector', status text DEFAULT 'open', thread_state text DEFAULT 'agreed', owner text DEFAULT 'me', requester text DEFAULT 'unknown',
 title text DEFAULT 'Synthetic recovery task', content text DEFAULT 'Synthetic recovery task', notes text, deadline timestamptz,
 deadline_precision text DEFAULT 'none', priority text DEFAULT 'medium', state_summary text,
 latest_message_id uuid, last_evidence_at timestamptz, confidence real, snoozed_until timestamptz,
 resolution text, resolved_at timestamptz, completed_at timestamptz, last_detected_at timestamptz, detector_version text,
 user_edited boolean DEFAULT false, visibility text DEFAULT 'surfaced', priority_score real DEFAULT 50,
 priority_override real, evidence_count integer DEFAULT 0, reminder_sent_at timestamptz,
 created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE loop_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),loop_id uuid REFERENCES loops,user_id uuid,kind text,actor text,summary text,payload jsonb DEFAULT '{}',occurred_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now());
CREATE TABLE chat_loop_cursors(user_id uuid, chat_id uuid, last_message_timestamp timestamptz, last_message_id uuid, last_run_at timestamptz, last_gate_result text, consecutive_empty integer DEFAULT 0, PRIMARY KEY(user_id,chat_id));
CREATE TABLE notification_devices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid,enabled boolean DEFAULT true,token text,timezone text DEFAULT 'UTC');
CREATE TABLE notification_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid, device_id uuid, notification_type text,state text,attempts integer DEFAULT 0,queued_at timestamptz DEFAULT now(),submitted_at timestamptz,delivered_at timestamptz,provider_receipt_id text,error_code text);
