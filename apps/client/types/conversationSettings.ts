export type ChatCategory = 'personal' | 'friend' | 'business' | 'trip' | 'romantic';

/**
 * What kind of group this is, inferred server-side. Distinct from ChatCategory,
 * which is a relationship taxonomy that does not describe a room (a group is
 * never 'romantic'). This never controls whether AI runs — it selects the copy
 * that helps the user decide.
 */
export type GroupCategory =
  | 'work'
  | 'planning'
  | 'family'
  | 'friends'
  | 'community'
  | 'announcement'
  | 'unknown';

/** Below this we show no label rather than a guess. Mirrors the server. */
export const CATEGORY_DISPLAY_THRESHOLD = 0.6;

/** Categories where turning Claire on is worth actively suggesting. */
export const RECOMMENDED_GROUP_CATEGORIES: readonly GroupCategory[] = ['work', 'planning'];

export type SmartCardType = 'maps' | 'flight' | 'datetime' | 'reminder' | 'action';

export interface SmartCard {
  id: string;
  user_id: string;
  chat_id: string;
  card_type: SmartCardType;
  title: string;
  subtitle: string | null;
  payload: Record<string, unknown>;
  priority: number;
  dismissed: boolean;
  acted_on: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface ContactProfile {
  id: string;
  user_id: string;
  contact_id: string | null;
  chat_id: string | null;
  display_name: string | null;
  email: string | null;
  phone_number: string | null;
  location: string | null;
  key_facts: Array<{ fact: string; confidence: number; source: string }>;
  relationship_context: string | null;
  ai_instruction: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatCategoryRow {
  id: string;
  user_id: string;
  chat_id: string;
  category: ChatCategory;
  created_at: string;
  updated_at: string;
}
