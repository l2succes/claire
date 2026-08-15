import { createHash } from 'crypto';
import OpenAI from 'openai';
import { openaiConfig } from '../config';
import { logger } from '../utils/logger';
import { supabase } from './supabase';

const RETRIEVAL_LIMIT = 12;
const BACKFILL_BATCH_SIZE = 100;
const MAX_BACKGROUND_BATCHES = 10;

export interface AssistantCitation {
  messageId: string;
  chatId: string;
  excerpt: string;
  senderName: string;
  fromMe: boolean;
  timestamp: string;
  platform: string;
  chatName: string | null;
  isGroup: boolean;
  /** Present when an Ask Claire question targeted one or more conversations. */
  isPreferredScope?: boolean;
}

interface RetrievedMessage extends AssistantCitation {
  score: number;
}

export interface AssistantIndexStatus {
  status: 'idle' | 'indexing' | 'ready' | 'failed';
  indexedCount: number;
  totalCount: number;
  lastIndexedAt: string | null;
  lastError: string | null;
}

export interface AssistantAnswer {
  answer: string;
  citations: AssistantCitation[];
  indexing: AssistantIndexStatus;
}

export interface AssistantThread {
  id: string;
  title: string;
  chat_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: AssistantCitation[];
  scope_chat_ids: string[];
  created_at: string;
}

export interface AssistantThreadHistory {
  thread: AssistantThread;
  turns: AssistantTurn[];
}

interface MessageToIndex {
  id: string;
  user_id: string;
  content: string | null;
  contact_name: string | null;
  from_me: boolean;
  timestamp: string;
  platform: string | null;
}

class ConversationAssistantService {
  private openai: OpenAI | null = openaiConfig.apiKey ? new OpenAI({ apiKey: openaiConfig.apiKey }) : null;
  private activeBackfills = new Set<string>();

  get isConfigured(): boolean {
    return !!this.openai;
  }

  async createThread(userId: string, title = 'New conversation'): Promise<AssistantThread> {
    const { data, error } = await supabase
      .from('conversation_assistant_threads')
      .insert({ user_id: userId, title })
      .select('id, title, chat_id, created_at, updated_at')
      .single();
    if (error) throw error;
    return data as AssistantThread;
  }

  async listThreads(userId: string): Promise<AssistantThread[]> {
    const { data, error } = await supabase
      .from('conversation_assistant_threads')
      .select('id, title, chat_id, created_at, updated_at')
      .eq('user_id', userId)
      .is('chat_id', null)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []) as AssistantThread[];
  }

  async getThread(userId: string, threadId: string, allowConversationThread = false): Promise<AssistantThreadHistory> {
    const threadQuery = supabase
      .from('conversation_assistant_threads')
      .select('id, title, chat_id, created_at, updated_at')
      .eq('id', threadId)
      .eq('user_id', userId);

    if (!allowConversationThread) threadQuery.is('chat_id', null);

    const [{ data: thread, error: threadError }, { data: turns, error: turnsError }] = await Promise.all([
      threadQuery.maybeSingle(),
      supabase
        .from('conversation_assistant_turns')
        .select('id, role, content, citations, scope_chat_ids, created_at')
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    ]);
    if (threadError) throw threadError;
    if (turnsError) throw turnsError;
    if (!thread) throw new Error('ASSISTANT_THREAD_NOT_FOUND');
    return { thread: thread as AssistantThread, turns: (turns || []) as AssistantTurn[] };
  }

  async getConversationThread(userId: string, chatId: string): Promise<AssistantThreadHistory> {
    await this.assertChatOwnership(userId, chatId);
    const { data, error } = await supabase
      .from('conversation_assistant_threads')
      .select('id')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ASSISTANT_THREAD_NOT_FOUND');
    return this.getThread(userId, data.id, true);
  }

  async clearConversationThread(userId: string, chatId: string): Promise<void> {
    await this.assertChatOwnership(userId, chatId);
    const { error } = await supabase
      .from('conversation_assistant_threads')
      .delete()
      .eq('user_id', userId)
      .eq('chat_id', chatId);
    if (error) throw error;
  }

  async askConversation(userId: string, chatId: string, question: string): Promise<AssistantAnswer & AssistantThreadHistory> {
    const thread = await this.ensureConversationThread(userId, chatId);
    const answer = await this.ask(userId, thread.id, question, [chatId], true);
    return { ...answer, ...(await this.getThread(userId, thread.id, true)) };
  }

  async deleteThread(userId: string, threadId: string): Promise<void> {
    const { error } = await supabase
      .from('conversation_assistant_threads')
      .delete()
      .eq('id', threadId)
      .eq('user_id', userId)
      .is('chat_id', null);
    if (error) throw error;
  }

  async getIndexStatus(userId: string): Promise<AssistantIndexStatus> {
    const [{ count: totalCount, error: totalError }, { count: indexedCount, error: indexedError }, { data: state, error: stateError }] = await Promise.all([
      // Only text/caption rows are eligible in v1. Empty media/system rows must not keep
      // the resumable backfill permanently marked as incomplete.
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_deleted', false).not('content', 'is', null).neq('content', ''),
      supabase.from('conversation_message_embeddings').select('message_id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('conversation_assistant_index_state').select('status, indexed_count, total_count, last_indexed_at, last_error').eq('user_id', userId).maybeSingle(),
    ]);
    if (totalError) throw totalError;
    if (indexedError) throw indexedError;
    if (stateError) throw stateError;
    const total = totalCount || 0;
    const indexed = indexedCount || 0;
    return {
      status: state?.status || (total === indexed ? 'ready' : 'idle'),
      indexedCount: indexed,
      totalCount: total,
      lastIndexedAt: state?.last_indexed_at || null,
      lastError: state?.last_error || null,
    };
  }

  async startBackfill(userId: string): Promise<AssistantIndexStatus> {
    if (!this.isConfigured) throw new Error('NO_AI_PROVIDER');
    if (!this.activeBackfills.has(userId)) {
      this.activeBackfills.add(userId);
      void this.runBackfill(userId).finally(() => this.activeBackfills.delete(userId));
    }
    return this.getIndexStatus(userId);
  }

  async indexMessage(message: MessageToIndex): Promise<void> {
    if (!this.openai || !message.content?.trim()) return;
    const content = this.embeddingText(message);
    const contentHash = this.hash(content);
    const { data: existing } = await supabase
      .from('conversation_message_embeddings')
      .select('content_hash')
      .eq('message_id', message.id)
      .eq('user_id', message.user_id)
      .maybeSingle();
    if (existing?.content_hash === contentHash) return;

    const embedding = await this.embed(content);
    const { error } = await supabase.from('conversation_message_embeddings').upsert({
      message_id: message.id,
      user_id: message.user_id,
      content_hash: contentHash,
      embedding,
      indexed_at: new Date().toISOString(),
    }, { onConflict: 'message_id' });
    if (error) throw error;
  }

  async ask(userId: string, threadId: string, question: string, preferredChatIds: string[] = [], strictScope = false): Promise<AssistantAnswer> {
    if (!this.openai) throw new Error('NO_AI_PROVIDER');
    const { thread, turns } = await this.getThread(userId, threadId);
    const cleanQuestion = question.trim();
    if (!cleanQuestion) throw new Error('QUESTION_REQUIRED');

    const [citations, indexing, conversationInstructions] = await Promise.all([
      this.retrieve(userId, cleanQuestion, preferredChatIds, strictScope),
      this.getIndexStatus(userId),
      this.getConversationInstructions(userId, preferredChatIds),
    ]);
    const previousTurns = turns.slice(-6).map(turn => `${turn.role === 'user' ? 'User' : 'Claire'}: ${turn.content}`).join('\n');
    const sourceText = citations.map((citation, index) =>
      `[${index + 1}] ${citation.timestamp} · ${citation.platform} · ${citation.fromMe ? 'You' : citation.senderName}: ${citation.excerpt}`
    ).join('\n');
    const completion = await this.openai.chat.completions.create({
      model: openaiConfig.model,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content: 'You are Claire, a private conversation research assistant. Answer only from the supplied sources. Never claim to have read a message that is not quoted. Be concise, state uncertainty when sources are insufficient, and do not suggest that you will send or edit messages. Interpret clear everyday and colloquial equivalents (for example, "link up", "see you", or "hang out" can mean meeting), but say so when the wording is an interpretation rather than an exact quote. For relationship or communication questions, give a warm practical read grounded in the excerpts, clearly distinguish observation from inference, and suggest a constructive next step. Return JSON only: {"answer":"..."}.',
        },
        {
          role: 'user',
          content: `Question: ${cleanQuestion}\n\nSelected conversation instructions:\n${conversationInstructions || '(none)'}\n\nPrevious assistant thread:\n${previousTurns || '(none)'}\n\nRetrieved sources:\n${sourceText || '(no matching messages found)'}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message.content || '{}';
    let answer = 'I could not find enough relevant messages to answer that confidently.';
    try {
      const parsed = JSON.parse(raw) as { answer?: unknown };
      if (typeof parsed.answer === 'string' && parsed.answer.trim()) answer = parsed.answer.trim();
    } catch {
      logger.warn('Assistant returned invalid JSON');
    }

    const now = new Date().toISOString();
    const { error: turnsError } = await supabase.from('conversation_assistant_turns').insert([
      // The column is deliberately NOT NULL so every persisted turn has a stable shape.
      { thread_id: thread.id, user_id: userId, role: 'user', content: cleanQuestion, citations: [], scope_chat_ids: preferredChatIds },
      { thread_id: thread.id, user_id: userId, role: 'assistant', content: answer, citations, scope_chat_ids: preferredChatIds },
    ]);
    if (turnsError) throw turnsError;

    const title = thread.title === 'New conversation' ? cleanQuestion.slice(0, 72) : thread.title;
    const { error: threadError } = await supabase
      .from('conversation_assistant_threads')
      .update({ title, updated_at: now })
      .eq('id', thread.id)
      .eq('user_id', userId);
    if (threadError) throw threadError;

    return { answer, citations, indexing };
  }

  /** One-shot cited search answer. Unlike Ask Claire, this does not create or mutate a thread. */
  async search(userId: string, question: string): Promise<AssistantAnswer> {
    if (!this.openai) throw new Error('NO_AI_PROVIDER');
    const cleanQuestion = question.trim();
    if (!cleanQuestion) throw new Error('QUESTION_REQUIRED');
    const [citations, indexing] = await Promise.all([
      this.retrieve(userId, cleanQuestion),
      this.getIndexStatus(userId),
    ]);
    if (!citations.length) {
      return { answer: 'I could not find a message that answers that confidently.', citations: [], indexing };
    }
    const sources = citations.map((citation, index) =>
      `[${index + 1}] ${citation.timestamp} · ${citation.platform} · ${citation.fromMe ? 'You' : citation.senderName}: ${citation.excerpt}`
    ).join('\n');
    const completion = await this.openai.chat.completions.create({
      model: openaiConfig.model,
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 450,
      messages: [
        { role: 'system', content: 'Answer the search question only from the supplied conversation excerpts. Be concise, distinguish inference from exact wording, state uncertainty, and return JSON only: {"answer":"..."}.' },
        { role: 'user', content: `Question: ${cleanQuestion}\n\nSources:\n${sources}` },
      ],
    });
    let answer = 'I found related messages, but could not summarize them confidently.';
    try {
      const parsed = JSON.parse(completion.choices[0]?.message.content || '{}') as { answer?: unknown };
      if (typeof parsed.answer === 'string' && parsed.answer.trim()) answer = parsed.answer.trim();
    } catch {
      logger.warn('Search answer returned invalid JSON');
    }
    return { answer, citations, indexing };
  }

  private async runBackfill(userId: string): Promise<void> {
    await this.writeIndexState(userId, { status: 'indexing', last_error: null });
    try {
      for (let batch = 0; batch < MAX_BACKGROUND_BATCHES; batch += 1) {
        const { data: messages, error } = await supabase.rpc('get_unembedded_conversation_messages', {
          target_user_id: userId,
          result_limit: BACKFILL_BATCH_SIZE,
        });
        if (error) throw error;
        const rows = (messages || []) as MessageToIndex[];
        if (rows.length === 0) break;
        for (const message of rows) await this.indexMessage(message);
      }
      const status = await this.getIndexStatus(userId);
      await this.writeIndexState(userId, {
        status: status.indexedCount >= status.totalCount ? 'ready' : 'idle',
        indexed_count: status.indexedCount,
        total_count: status.totalCount,
        last_indexed_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Conversation assistant backfill failed:', error);
      await this.writeIndexState(userId, { status: 'failed', last_error: (error as Error).message });
    }
  }

  private async retrieve(userId: string, query: string, preferredChatIds: string[] = [], strictScope = false): Promise<AssistantCitation[]> {
    const strictChatId = strictScope ? preferredChatIds[0] : null;
    if (strictScope && !strictChatId) throw new Error('CHAT_SCOPE_REQUIRED');
    const exactPromise = strictChatId
      ? supabase.rpc('search_conversation_messages_in_chat', {
        query_text: query,
        target_user_id: userId,
        target_chat_id: strictChatId,
        result_limit: RETRIEVAL_LIMIT,
      })
      : supabase.rpc('search_scoped_conversation_messages', {
        query_text: query,
        target_user_id: userId,
        preferred_chat_ids: preferredChatIds,
        result_limit: RETRIEVAL_LIMIT,
      });
    const semanticPromise = this.embed(query)
      .then(embedding => strictChatId
        ? supabase.rpc('match_conversation_messages_in_chat', {
          query_embedding: embedding,
          target_user_id: userId,
          target_chat_id: strictChatId,
          result_limit: RETRIEVAL_LIMIT,
        })
        : supabase.rpc('match_scoped_conversation_messages', {
          query_embedding: embedding,
          target_user_id: userId,
          preferred_chat_ids: preferredChatIds,
          result_limit: RETRIEVAL_LIMIT,
        }))
      .catch(error => {
        logger.warn('Semantic conversation search unavailable; using exact search:', error);
        return { data: [], error: null };
      });
    const [exact, semantic] = await Promise.all([exactPromise, semanticPromise]);
    if (exact.error) throw exact.error;
    if (semantic.error) throw semantic.error;
    const merged = new Map<string, RetrievedMessage>();
    for (const row of [...(exact.data || []), ...(semantic.data || [])] as Array<Record<string, unknown>>) {
      const messageId = String(row.message_id);
      const previous = merged.get(messageId);
      const score = Number(row.rank ?? row.similarity ?? 0);
      if (previous && previous.score >= score) continue;
      merged.set(messageId, {
        messageId,
        chatId: String(row.chat_id),
        excerpt: String(row.content || '').slice(0, 500),
        senderName: String(row.sender_name || 'Unknown'),
        fromMe: Boolean(row.from_me),
        timestamp: String(row.timestamp),
        platform: String(row.platform || 'unknown'),
        chatName: typeof row.chat_name === 'string' ? row.chat_name : null,
        isGroup: Boolean(row.is_group),
        score,
      });
    }
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, RETRIEVAL_LIMIT).map(({ score: _score, ...citation }) => ({
      ...citation,
      ...(preferredChatIds.length ? { isPreferredScope: preferredChatIds.includes(citation.chatId) } : {}),
    }));
  }

  private async getConversationInstructions(userId: string, chatIds: string[]): Promise<string> {
    if (!chatIds.length) return '';
    const { data, error } = await supabase.from('contact_profiles')
      .select('chat_id, ai_instruction').eq('user_id', userId).in('chat_id', chatIds).not('ai_instruction', 'is', null);
    if (error) throw error;
    return (data || []).map(row => `Chat ${row.chat_id}: ${row.ai_instruction}`).join('\n');
  }

  private async ensureConversationThread(userId: string, chatId: string): Promise<AssistantThread> {
    await this.assertChatOwnership(userId, chatId);
    const { data: existing, error: existingError } = await supabase
      .from('conversation_assistant_threads')
      .select('id, title, chat_id, created_at, updated_at')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing as AssistantThread;

    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('name')
      .eq('id', chatId)
      .eq('user_id', userId)
      .single();
    if (chatError) throw chatError;
    const { data, error } = await supabase
      .from('conversation_assistant_threads')
      .insert({ user_id: userId, chat_id: chatId, title: `Claire · ${chat.name || 'Conversation'}` })
      .select('id, title, chat_id, created_at, updated_at')
      .single();
    if (!error && data) return data as AssistantThread;
    // A second signed-in desktop may have created the thread concurrently.
    const { data: concurrent, error: concurrentError } = await supabase
      .from('conversation_assistant_threads')
      .select('id, title, chat_id, created_at, updated_at')
      .eq('user_id', userId)
      .eq('chat_id', chatId)
      .maybeSingle();
    if (concurrentError) throw concurrentError;
    if (concurrent) return concurrent as AssistantThread;
    throw error || new Error('Unable to create conversation assistant thread');
  }

  private async assertChatOwnership(userId: string, chatId: string): Promise<void> {
    const { data, error } = await supabase.from('chats').select('id').eq('id', chatId).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('CHAT_NOT_FOUND');
  }

  private async embed(input: string): Promise<number[]> {
    if (!this.openai) throw new Error('NO_AI_PROVIDER');
    const response = await this.openai.embeddings.create({
      model: openaiConfig.embeddingModel,
      input: input.slice(0, 12_000),
    });
    return response.data[0].embedding;
  }

  private embeddingText(message: MessageToIndex): string {
    return `Platform: ${message.platform || 'unknown'}\nSender: ${message.from_me ? 'You' : message.contact_name || 'Contact'}\nMessage: ${message.content || ''}`;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async writeIndexState(userId: string, updates: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('conversation_assistant_index_state').upsert({
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
  }
}

export const conversationAssistant = new ConversationAssistantService();
