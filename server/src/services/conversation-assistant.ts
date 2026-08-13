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

interface AssistantThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface AssistantTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: AssistantCitation[];
  created_at: string;
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
      .select('id, title, created_at, updated_at')
      .single();
    if (error) throw error;
    return data as AssistantThread;
  }

  async listThreads(userId: string): Promise<AssistantThread[]> {
    const { data, error } = await supabase
      .from('conversation_assistant_threads')
      .select('id, title, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []) as AssistantThread[];
  }

  async getThread(userId: string, threadId: string): Promise<{ thread: AssistantThread; turns: AssistantTurn[] }> {
    const [{ data: thread, error: threadError }, { data: turns, error: turnsError }] = await Promise.all([
      supabase
        .from('conversation_assistant_threads')
        .select('id, title, created_at, updated_at')
        .eq('id', threadId)
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('conversation_assistant_turns')
        .select('id, role, content, citations, created_at')
        .eq('thread_id', threadId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    ]);
    if (threadError) throw threadError;
    if (turnsError) throw turnsError;
    if (!thread) throw new Error('ASSISTANT_THREAD_NOT_FOUND');
    return { thread: thread as AssistantThread, turns: (turns || []) as AssistantTurn[] };
  }

  async deleteThread(userId: string, threadId: string): Promise<void> {
    const { error } = await supabase
      .from('conversation_assistant_threads')
      .delete()
      .eq('id', threadId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  async getIndexStatus(userId: string): Promise<AssistantIndexStatus> {
    const [{ count: totalCount, error: totalError }, { count: indexedCount, error: indexedError }, { data: state, error: stateError }] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_deleted', false).not('content', 'is', null),
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

  async ask(userId: string, threadId: string, question: string): Promise<AssistantAnswer> {
    if (!this.openai) throw new Error('NO_AI_PROVIDER');
    const { thread, turns } = await this.getThread(userId, threadId);
    const cleanQuestion = question.trim();
    if (!cleanQuestion) throw new Error('QUESTION_REQUIRED');

    const [citations, indexing] = await Promise.all([
      this.retrieve(userId, cleanQuestion),
      this.getIndexStatus(userId),
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
          content: 'You are Claire, a private conversation research assistant. Answer only from the supplied sources. Never claim to have read a message that is not quoted. Be concise, state uncertainty when sources are insufficient, and do not suggest that you will send or edit messages. Return JSON only: {"answer":"..."}.',
        },
        {
          role: 'user',
          content: `Question: ${cleanQuestion}\n\nPrevious assistant thread:\n${previousTurns || '(none)'}\n\nRetrieved sources:\n${sourceText || '(no matching messages found)'}`,
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
      { thread_id: thread.id, user_id: userId, role: 'user', content: cleanQuestion },
      { thread_id: thread.id, user_id: userId, role: 'assistant', content: answer, citations },
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

  private async retrieve(userId: string, query: string): Promise<AssistantCitation[]> {
    const exactPromise = supabase.rpc('search_conversation_messages', {
      query_text: query,
      target_user_id: userId,
      result_limit: RETRIEVAL_LIMIT,
    });
    const semanticPromise = this.embed(query)
      .then(embedding => supabase.rpc('match_conversation_messages', {
        query_embedding: embedding,
        target_user_id: userId,
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
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, RETRIEVAL_LIMIT).map(({ score: _score, ...citation }) => citation);
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
