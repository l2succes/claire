/**
 * One message as both clients hold it. The mobile client reads these rows
 * straight from Supabase; the desktop client receives them from the server's
 * REST API. The shape is identical, so it is defined once here.
 */
export interface ChatMessage {
  id: string;
  content: string;
  timestamp: string;
  from_me: boolean;
  contact_name?: string;
  contact_phone?: string;
  content_type?: string;
  media_url?: string;
  media_mime_type?: string;
  platform_message_id?: string;
  /** The local source row when the quoted message is already synced. */
  reply_to_message_id?: string | null;
  /** Source-platform/Matrix event identifier used until the row is resolvable. */
  reply_to_platform_message_id?: string | null;
}

/**
 * A single reaction as stored in `message_reactions`. Several rows with the
 * same emoji on the same message collapse into one chip — see `groupReactions`.
 */
export interface ReactionRow {
  id: string;
  message_id: string;
  emoji: string;
  from_me: boolean;
  reactor_id?: string | null;
  reactor_name?: string | null;
  reacted_at?: string;
}

/**
 * What the UI actually renders: one entry per distinct emoji on a message.
 */
export interface ReactionChip {
  emoji: string;
  count: number;
  /** True when the signed-in user is one of the reactors. */
  mine: boolean;
  /** Display names of the reactors, for the accessibility label. */
  reactors: string[];
}
