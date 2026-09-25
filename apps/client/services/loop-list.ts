import { supabase } from './supabase';
import type { LoopItem } from './loop-types';

const LOOP_SELECT = `
  *,
  contact:contacts!loops_contact_id_fkey(name, inferred_name, avatar_url),
  chat:chats!loops_chat_id_fkey(
    name, is_group, platform,
    contact:contacts!chats_contact_id_fkey(name, inferred_name, avatar_url)
  )
`;

/** Counts and filters must cover all loops, including new low-priority rows. */
export async function fetchLoopList(userId: string): Promise<LoopItem[]> {
  const items: LoopItem[] = [];
  const pageSize = 200;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('loops')
      .select(LOOP_SELECT)
      .eq('user_id', userId)
      .order('priority_score', { ascending: false, nullsFirst: false })
      .order('last_evidence_at', { ascending: false, nullsFirst: false })
      .order('id')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as LoopItem[];
    items.push(...page);
    if (page.length < pageSize) return items;
  }
}
