/**
 * Loop shapes, shared by the API client and the pure display helpers.
 *
 * Types only, no imports — so neither consumer drags the other's dependencies
 * into a test.
 */

export type LoopStatus = 'open' | 'waiting' | 'snoozed' | 'done' | 'dropped' | 'superseded';
export type LoopOwner = 'me' | 'them' | 'shared' | 'unknown';

/**
 * How settled the plan is, as distinct from the workflow status. Only `agreed`
 * and later are actionable — a merely `proposed` loop sits out of the Open count
 * so the list stays trustworthy.
 */
export type LoopThreadState =
  | 'proposed'
  | 'negotiating'
  | 'pending_confirmation'
  | 'agreed'
  | 'resolved';

export type DeadlinePrecision = 'exact' | 'day' | 'week' | 'month' | 'none';

export interface LoopConversationRef {
  name?: string | null;
  is_group?: boolean | null;
  platform?: string | null;
  contact?: { name?: string | null; inferred_name?: string | null; avatar_url?: string | null } | null;
}

export interface LoopItem {
  id: string;
  content: string;
  title?: string | null;
  state_summary?: string | null;
  thread_state?: LoopThreadState | null;
  kind?: string | null;
  deadline?: string | null;
  deadline_precision?: DeadlinePrecision | null;
  priority: 'low' | 'medium' | 'high';
  status: LoopStatus;
  owner?: LoopOwner;
  snoozed_until?: string | null;
  from_me: boolean;
  chat_id?: string | null;
  platform?: string | null;
  contact_name?: string | null;
  notes?: string | null;
  relevance?: number | null;
  relevance_signals?: RelevanceSignals | null;
  suppressed_reason?: string | null;
  evidence_count?: number | null;
  source?: string | null;
  chat?: LoopConversationRef | null;
  contact?: { name?: string | null; inferred_name?: string | null; avatar_url?: string | null } | null;
}

export interface RelevanceSignals {
  signals?: Array<{ id: string; hit: boolean; weight: number; note?: string }>;
  reasons?: string[];
  threshold?: number;
  hardPass?: string | null;
  addressed?: boolean;
}

export type LoopEventKind =
  | 'created'
  | 'evidence'
  | 'state_change'
  | 'deadline_change'
  | 'owner_change'
  | 'merged'
  | 'user_edit'
  | 'reminder_sent'
  | 'plugin_proposed'
  | 'plugin_executed'
  | 'agent_note'
  | 'resolved'
  | 'reopened'
  | 'suppressed';

export interface LoopEvent {
  id: string;
  kind: LoopEventKind;
  actor: 'detector' | 'user' | 'agent' | 'plugin' | 'system';
  message_id?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown> | null;
  confidence?: number | null;
  occurred_at: string;
}

export interface LoopParticipant {
  id: string;
  display_name: string;
  contact_id?: string | null;
  is_self: boolean;
  role: 'owner' | 'counterparty' | 'mentioned' | 'observer';
  evidence?: string | null;
}

export interface LoopDetail extends LoopItem {
  events?: LoopEvent[];
  participants?: LoopParticipant[];
}
