export type ChatCategory = 'personal' | 'friend' | 'business' | 'trip' | 'romantic';

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
