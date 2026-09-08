import { createHash, randomUUID } from 'crypto';
import {
  createUIMessageStream,
  embed,
  embedMany,
  generateText,
  streamText,
  type LanguageModelUsage,
  type UIMessageChunk,
} from 'ai';
import { logger } from '../utils/logger';
import { supabase, type DbRow } from './supabase';
import { selectAssistantActions, type AssistantAction } from './conversation-assistant-actions';
import { selectCitedSources } from './conversation-assistant-citations';
import { hasAnyProvider, resolveEmbeddingRole, resolveRole, type RoleResolution } from './ai/provider-registry';
import { planAssistantQuery, type AssistantQueryPlan } from './conversation-assistant-query';

const RETRIEVAL_CANDIDATES = 24;
const RETRIEVAL_LIMIT = 6;
const BACKFILL_BATCH_SIZE = 128;
const MAX_BACKGROUND_BATCHES = 80;
const PROMPT_VERSION = 'ask-claire-v2.0';

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
  isPreferredScope?: boolean;
}

interface RetrievedMessage extends AssistantCitation { score: number }

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
  actions: AssistantAction[];
  indexing: AssistantIndexStatus;
  requestId: string;
  assistantTurn?: AssistantTurn;
  thread?: AssistantThread;
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
  actions?: AssistantAction[];
  scope_chat_ids: string[];
  status: 'pending' | 'streaming' | 'completed' | 'failed' | 'cancelled';
  request_id?: string | null;
  created_at: string;
}

export interface AssistantThreadHistory { thread: AssistantThread; turns: AssistantTurn[] }

interface MessageToIndex {
  id: string;
  user_id: string;
  content: string | null;
  contact_name: string | null;
  from_me: boolean;
  timestamp: string;
  platform: string | null;
  stored_content_hash?: string | null;
}

interface PreparedRequest {
  userId: string;
  thread: AssistantThread;
  question: string;
  requestId: string;
  assistantTurnId: string;
  preferredChatIds: string[];
  queryPlan: AssistantQueryPlan;
  citations: AssistantCitation[];
  indexing: AssistantIndexStatus;
  prompt: string;
  hasEvidence: boolean;
  replay?: AssistantAnswer;
}

interface GeneratedAnswer {
  answer: string;
  citations: AssistantCitation[];
  actions: AssistantAction[];
  provider: string;
  model: string;
  finishReason: string;
  usage: LanguageModelUsage;
}

const ZERO_USAGE: LanguageModelUsage = {
  inputTokens: 0,
  inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokens: 0,
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
  totalTokens: 0,
};

function writeChunk(writer: { write(part: UIMessageChunk): void }, part: UIMessageChunk): void {
  writer.write(part);
}

class ConversationAssistantService {
  private activeBackfills = new Set<string>();

  get isConfigured(): boolean { return hasAnyProvider(); }

  async createThread(userId: string, title = 'New conversation'): Promise<AssistantThread> {
    const { data, error } = await supabase.from('conversation_assistant_threads')
      .insert({ user_id: userId, title }).select('id, title, chat_id, created_at, updated_at').single();
    if (error) throw error;
    return data as AssistantThread;
  }

  async listThreads(userId: string): Promise<AssistantThread[]> {
    const { data, error } = await supabase.from('conversation_assistant_threads')
      .select('id, title, chat_id, created_at, updated_at')
      .eq('user_id', userId).is('chat_id', null).order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []) as AssistantThread[];
  }

  async getThread(userId: string, threadId: string, allowConversationThread = false): Promise<AssistantThreadHistory> {
    const threadQuery = supabase.from('conversation_assistant_threads')
      .select('id, title, chat_id, created_at, updated_at').eq('id', threadId).eq('user_id', userId);
    if (!allowConversationThread) threadQuery.is('chat_id', null);
    const [{ data: thread, error: threadError }, { data: turns, error: turnsError }] = await Promise.all([
      threadQuery.maybeSingle(),
      supabase.from('conversation_assistant_turns')
        .select('id, role, content, citations, actions, scope_chat_ids, status, request_id, created_at')
        .eq('thread_id', threadId).eq('user_id', userId).order('created_at', { ascending: true }),
    ]);
    if (threadError) throw threadError;
    if (turnsError) throw turnsError;
    if (!thread) throw new Error('ASSISTANT_THREAD_NOT_FOUND');
    return { thread: thread as AssistantThread, turns: (turns || []) as AssistantTurn[] };
  }

  async getConversationThread(userId: string, chatId: string): Promise<AssistantThreadHistory> {
    await this.assertChatOwnership(userId, chatId);
    const { data, error } = await supabase.from('conversation_assistant_threads')
      .select('id').eq('user_id', userId).eq('chat_id', chatId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ASSISTANT_THREAD_NOT_FOUND');
    return this.getThread(userId, data.id, true);
  }

  async clearConversationThread(userId: string, chatId: string): Promise<void> {
    await this.assertChatOwnership(userId, chatId);
    const { error } = await supabase.from('conversation_assistant_threads').delete()
      .eq('user_id', userId).eq('chat_id', chatId);
    if (error) throw error;
  }

  async deleteThread(userId: string, threadId: string): Promise<void> {
    const { error } = await supabase.from('conversation_assistant_threads').delete()
      .eq('id', threadId).eq('user_id', userId).is('chat_id', null);
    if (error) throw error;
  }

  async findThreadByRequestId(userId: string, requestId?: string): Promise<AssistantThread | null> {
    if (!requestId) return null;
    const { data: turn, error: turnError } = await supabase.from('conversation_assistant_turns')
      .select('thread_id').eq('user_id', userId).eq('role', 'assistant').eq('request_id', requestId).maybeSingle();
    if (turnError) throw turnError;
    if (!turn) return null;
    const { data, error } = await supabase.from('conversation_assistant_threads')
      .select('id, title, chat_id, created_at, updated_at').eq('user_id', userId).eq('id', turn.thread_id).single();
    if (error) throw error;
    return data as AssistantThread;
  }

  async askConversation(userId: string, chatId: string, question: string, requestId = randomUUID()): Promise<AssistantAnswer & AssistantThreadHistory> {
    const thread = await this.ensureConversationThread(userId, chatId);
    const answer = await this.ask(userId, thread.id, question, [chatId], true, requestId);
    return { ...answer, ...(await this.getThread(userId, thread.id, true)) };
  }

  async ask(
    userId: string,
    threadId: string,
    question: string,
    preferredChatIds: string[] = [],
    strictScope = false,
    requestId = randomUUID(),
  ): Promise<AssistantAnswer> {
    const prepared = await this.prepareRequest(userId, threadId, question, preferredChatIds, strictScope, requestId);
    if (prepared.replay) return prepared.replay;
    try {
      const generated = await this.generate(prepared);
      const turn = await this.finishRequest(prepared, generated, 'completed');
      return { ...generated, indexing: prepared.indexing, requestId, assistantTurn: turn };
    } catch (error) {
      await this.failRequest(prepared, error);
      throw error;
    }
  }

  createAnswerStream(
    userId: string,
    threadId: string,
    question: string,
    preferredChatIds: string[] = [],
    strictScope = false,
    requestId = randomUUID(),
    abortSignal?: AbortSignal,
  ): ReadableStream<UIMessageChunk> {
    return createUIMessageStream({
      execute: async ({ writer }) => {
        writeChunk(writer, { type: 'start', messageId: requestId });
        writeChunk(writer, { type: 'data-claire-status', data: { phase: 'planning', requestId }, transient: true } as UIMessageChunk);
        let prepared: PreparedRequest | null = null;
        try {
          prepared = await this.prepareRequest(userId, threadId, question, preferredChatIds, strictScope, requestId);
          if (prepared.replay) {
            const id = prepared.assistantTurnId;
            writeChunk(writer, { type: 'text-start', id });
            writeChunk(writer, { type: 'text-delta', id, delta: prepared.replay.answer });
            writeChunk(writer, { type: 'text-end', id });
            writeChunk(writer, { type: 'data-claire-result', data: prepared.replay } as UIMessageChunk);
            writeChunk(writer, { type: 'finish', finishReason: 'stop' });
            return;
          }

          writeChunk(writer, { type: 'data-claire-status', data: { phase: 'reading', requestId }, transient: true } as UIMessageChunk);
          const textId = prepared.assistantTurnId;
          writeChunk(writer, { type: 'text-start', id: textId });
          const generated = await this.generateStream(prepared, (delta) => {
            writeChunk(writer, { type: 'text-delta', id: textId, delta });
          }, abortSignal);
          writeChunk(writer, { type: 'text-end', id: textId });
          writeChunk(writer, { type: 'data-claire-status', data: { phase: 'saving', requestId }, transient: true } as UIMessageChunk);
          const turn = await this.finishRequest(prepared, generated, 'completed');
          const result: AssistantAnswer = { ...generated, indexing: prepared.indexing, requestId, assistantTurn: turn, thread: prepared.thread };
          writeChunk(writer, { type: 'data-claire-result', data: result } as UIMessageChunk);
          writeChunk(writer, { type: 'finish', finishReason: generated.finishReason as 'stop' });
        } catch (error) {
          if (prepared) await this.failRequest(prepared, error, abortSignal?.aborted ? 'cancelled' : 'failed');
          if (abortSignal?.aborted) writeChunk(writer, { type: 'abort', reason: 'cancelled' });
          else writeChunk(writer, { type: 'error', errorText: 'Claire could not finish that answer.' });
        }
      },
      onError: (error) => {
        logger.error('Ask Claire stream failed:', error);
        return 'Claire could not finish that answer.';
      },
    });
  }

  async createConversationAnswerStream(
    userId: string,
    chatId: string,
    question: string,
    requestId = randomUUID(),
    abortSignal?: AbortSignal,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const thread = await this.ensureConversationThread(userId, chatId);
    return this.createAnswerStream(userId, thread.id, question, [chatId], true, requestId, abortSignal);
  }

  async createThreadAnswerStream(
    userId: string,
    question: string,
    preferredChatIds: string[] = [],
    requestId = randomUUID(),
    abortSignal?: AbortSignal,
  ): Promise<ReadableStream<UIMessageChunk>> {
    const thread = await this.createThread(userId);
    return this.createAnswerStream(userId, thread.id, question, preferredChatIds, false, requestId, abortSignal);
  }

  async getIndexStatus(userId: string): Promise<AssistantIndexStatus> {
    const [{ count: totalCount, error: totalError }, { count: indexedCount, error: indexedError }, { data: state, error: stateError }] = await Promise.all([
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId)
        .eq('is_deleted', false).not('content', 'is', null).neq('content', ''),
      supabase.from('conversation_message_embeddings').select('message_id', { count: 'exact', head: true }).eq('user_id', userId),
      supabase.from('conversation_assistant_index_state')
        .select('status, indexed_count, total_count, last_indexed_at, last_error').eq('user_id', userId).maybeSingle(),
    ]);
    if (totalError) throw totalError;
    if (indexedError) throw indexedError;
    if (stateError) throw stateError;
    const total = totalCount || 0;
    const indexed = indexedCount || 0;
    return {
      status: state?.status || (total === indexed ? 'ready' : 'idle'), indexedCount: indexed, totalCount: total,
      lastIndexedAt: state?.last_indexed_at || null, lastError: state?.last_error || null,
    };
  }

  async startBackfill(userId: string): Promise<AssistantIndexStatus> {
    if (!resolveEmbeddingRole().length) throw new Error('NO_EMBEDDING_PROVIDER');
    if (!this.activeBackfills.has(userId)) {
      this.activeBackfills.add(userId);
      void this.runBackfill(userId).finally(() => this.activeBackfills.delete(userId));
    }
    return this.getIndexStatus(userId);
  }

  async indexMessage(message: MessageToIndex): Promise<void> { await this.indexMessages([message]); }

  /** One-shot cited search answer. Unlike Ask Claire, this does not mutate a thread. */
  async search(userId: string, question: string): Promise<AssistantAnswer> {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) throw new Error('QUESTION_REQUIRED');
    const queryPlan = planAssistantQuery(cleanQuestion);
    const [citations, indexing, memory] = await Promise.all([
      this.retrieve(userId, queryPlan), this.getIndexStatus(userId), this.getMemoryContext(userId, queryPlan),
    ]);
    if (!citations.length && !memory) {
      return { answer: 'I could not find a message that answers that confidently.', citations: [], actions: [], indexing, requestId: randomUUID() };
    }
    const prepared = {
      userId, thread: { id: '', title: '', created_at: '', updated_at: '' }, question: cleanQuestion,
      requestId: randomUUID(), assistantTurnId: '', preferredChatIds: [], queryPlan, citations, indexing,
      prompt: this.buildPrompt(cleanQuestion, '', citations, memory, queryPlan), hasEvidence: Boolean(citations.length || memory),
    } satisfies PreparedRequest;
    const generated = await this.generate(prepared);
    return { ...generated, indexing, requestId: prepared.requestId };
  }

  private async prepareRequest(
    userId: string, threadId: string, question: string, preferredChatIds: string[], strictScope: boolean, requestId: string,
  ): Promise<PreparedRequest> {
    const cleanQuestion = question.trim();
    if (!cleanQuestion) throw new Error('QUESTION_REQUIRED');
    // Conversation threads are intentionally allowed only for the strict scoped path.
    const { thread, turns } = await this.getThread(userId, threadId, strictScope);
    if (strictScope && thread.chat_id !== preferredChatIds[0]) throw new Error('CHAT_SCOPE_REQUIRED');
    const queryPlan = planAssistantQuery(cleanQuestion);
    const { data: begun, error: beginError } = await supabase.rpc('begin_conversation_assistant_request', {
      target_user_id: userId, target_thread_id: threadId, target_request_id: requestId,
      question_text: cleanQuestion, scope_ids: preferredChatIds, planned_query: queryPlan,
    });
    if (beginError) throw beginError;
    const begin = (begun?.[0] || begun) as { assistant_turn_id: string; replayed: boolean };
    if (!begin?.assistant_turn_id) throw new Error('ASSISTANT_REQUEST_NOT_CREATED');
    if (begin.replayed) {
      const replay = await this.loadReplay(userId, threadId, requestId);
      return {
        userId, thread, question: cleanQuestion, requestId, assistantTurnId: begin.assistant_turn_id,
        preferredChatIds, queryPlan, citations: replay.citations, indexing: replay.indexing, prompt: '', hasEvidence: true, replay,
      };
    }

    const [citations, indexing, instructions, memory] = await Promise.all([
      this.retrieve(userId, queryPlan, preferredChatIds, strictScope), this.getIndexStatus(userId),
      this.getConversationInstructions(userId, preferredChatIds), this.getMemoryContext(userId, queryPlan),
    ]);
    const previousTurns = turns.slice(-6).map((turn) => `${turn.role === 'user' ? 'User' : 'Claire'}: ${turn.content}`).join('\n');
    const { error: statusError } = await supabase.from('conversation_assistant_turns').update({ status: 'streaming' })
      .eq('id', begin.assistant_turn_id).eq('user_id', userId);
    if (statusError) throw statusError;
    return {
      userId, thread, question: cleanQuestion, requestId, assistantTurnId: begin.assistant_turn_id,
      preferredChatIds, queryPlan, citations, indexing,
      prompt: this.buildPrompt(cleanQuestion, previousTurns, citations, [instructions, memory].filter(Boolean).join('\n'), queryPlan),
      hasEvidence: Boolean(citations.length || memory),
    };
  }

  private async loadReplay(userId: string, threadId: string, requestId: string): Promise<AssistantAnswer> {
    const [{ data, error }, indexing] = await Promise.all([
      supabase.from('conversation_assistant_turns')
        .select('id, role, content, citations, actions, scope_chat_ids, status, request_id, created_at')
        .eq('user_id', userId).eq('thread_id', threadId).eq('role', 'assistant').eq('request_id', requestId).single(),
      this.getIndexStatus(userId),
    ]);
    if (error) throw error;
    const turn = data as AssistantTurn;
    return { answer: turn.content, citations: turn.citations || [], actions: turn.actions || [], indexing, requestId, assistantTurn: turn };
  }

  private async generate(prepared: PreparedRequest): Promise<GeneratedAnswer> {
    if (!prepared.hasEvidence) return this.noEvidenceAnswer();
    let lastError: unknown = new Error('NO_AI_PROVIDER');
    for (const candidate of resolveRole('grounded')) {
      try {
        const result = await generateText({
          model: candidate.model, system: this.systemPrompt(), prompt: prepared.prompt,
          temperature: 0.15, maxOutputTokens: 700,
        });
        return this.finalizeGenerated(prepared, result.text, candidate, result.finishReason, result.usage);
      } catch (error) {
        lastError = error;
        logger.warn('[Ask Claire] answer model failed; trying fallback', { provider: candidate.provider, model: candidate.modelId, error });
      }
    }
    throw lastError;
  }

  private async generateStream(prepared: PreparedRequest, onDelta: (delta: string) => void, abortSignal?: AbortSignal): Promise<GeneratedAnswer> {
    if (!prepared.hasEvidence) {
      const generated = this.noEvidenceAnswer();
      onDelta(generated.answer);
      return generated;
    }
    let lastError: unknown = new Error('NO_AI_PROVIDER');
    for (const candidate of resolveRole('grounded')) {
      let answer = '';
      try {
        const result = streamText({
          model: candidate.model, system: this.systemPrompt(), prompt: prepared.prompt,
          temperature: 0.15, maxOutputTokens: 700, abortSignal,
        });
        for await (const delta of result.textStream) { answer += delta; onDelta(delta); }
        return this.finalizeGenerated(prepared, answer, candidate, await result.finishReason, await result.usage);
      } catch (error) {
        lastError = error;
        if (abortSignal?.aborted || answer) throw error;
        logger.warn('[Ask Claire] streaming model failed before output; trying fallback', { provider: candidate.provider, model: candidate.modelId, error });
      }
    }
    throw lastError;
  }

  private noEvidenceAnswer(): GeneratedAnswer {
    return {
      answer: 'I could not find enough relevant messages to answer that confidently.',
      citations: [],
      actions: [],
      provider: 'deterministic',
      model: 'none',
      finishReason: 'stop',
      usage: ZERO_USAGE,
    };
  }

  private finalizeGenerated(
    prepared: PreparedRequest, rawAnswer: string, candidate: RoleResolution, finishReason: string, usage: LanguageModelUsage,
  ): GeneratedAnswer {
    const answer = rawAnswer.trim() || 'I could not find enough relevant messages to answer that confidently.';
    const indices = [...answer.matchAll(/\[S(\d{1,2})\]/gi)]
      .map((match) => Number(match[1])).filter((index) => index >= 1 && index <= prepared.citations.length);
    const citations = selectCitedSources(prepared.citations, indices);
    const sourceIndex = citations.length ? Math.max(1, prepared.citations.findIndex((item) => item.messageId === citations[0].messageId) + 1) : 0;
    const rawActions: Array<Record<string, unknown>> = sourceIndex
      ? [{ type: 'open_conversation', sourceIndex, label: 'Open conversation' }] : [];
    if (sourceIndex && prepared.queryPlan.intent === 'plans') {
      rawActions.push({ type: 'open_calendar', sourceIndex, label: 'Add to calendar', title: 'Plan from Claire' });
    }
    return {
      answer, citations,
      actions: selectAssistantActions(prepared.citations, rawActions, indices.length ? indices : [sourceIndex]),
      provider: candidate.provider, model: candidate.modelId, finishReason, usage,
    };
  }

  private async finishRequest(prepared: PreparedRequest, generated: GeneratedAnswer, status: 'completed' | 'cancelled'): Promise<AssistantTurn> {
    const { error } = await supabase.rpc('finish_conversation_assistant_request', {
      target_user_id: prepared.userId, target_thread_id: prepared.thread.id, target_request_id: prepared.requestId,
      answer_text: generated.answer, answer_citations: generated.citations, answer_actions: generated.actions,
      final_status: status, prompt_name: PROMPT_VERSION, provider_name: generated.provider, model_name: generated.model,
      stop_reason: generated.finishReason, prompt_tokens: generated.usage.inputTokens ?? null,
      completion_tokens: generated.usage.outputTokens ?? null, failure_code: null,
    });
    if (error) throw error;
    const replay = await this.loadReplay(prepared.userId, prepared.thread.id, prepared.requestId);
    if (!replay.assistantTurn) throw new Error('ASSISTANT_TURN_NOT_FOUND');
    return replay.assistantTurn;
  }

  private async failRequest(prepared: PreparedRequest, error: unknown, status: 'failed' | 'cancelled' = 'failed'): Promise<void> {
    const { error: persistError } = await supabase.rpc('finish_conversation_assistant_request', {
      target_user_id: prepared.userId, target_thread_id: prepared.thread.id, target_request_id: prepared.requestId,
      answer_text: status === 'cancelled' ? 'Answer stopped.' : 'Claire could not finish this answer.',
      answer_citations: [], answer_actions: [], final_status: status, prompt_name: PROMPT_VERSION,
      provider_name: null, model_name: null, stop_reason: status, prompt_tokens: null, completion_tokens: null,
      failure_code: error instanceof Error ? error.name : 'UNKNOWN',
    });
    if (persistError) logger.error('Could not persist failed Ask Claire request:', persistError);
  }

  private systemPrompt(): string {
    return 'You are Claire, a private conversation research assistant. Answer only from the supplied evidence and memory. Cite every factual claim from a message with its stable source label like [S1]. Never claim you read a message that is not supplied. Clearly distinguish observation from inference. If evidence is incomplete or ambiguous, say what you found and what remains uncertain. Be concise and warm. Do not claim to send messages, contact people, book meetings, or change a calendar. You may suggest a next step, but execution always requires a separate user-approved action.';
  }

  private buildPrompt(question: string, previousTurns: string, citations: AssistantCitation[], memory: string, plan: AssistantQueryPlan): string {
    const sources = citations.map((citation, index) =>
      `[S${index + 1}] ${citation.timestamp} · ${citation.platform} · ${citation.chatName || citation.senderName}\n${citation.excerpt}`,
    ).join('\n\n');
    return `Question: ${question}\n\nQuery intent: ${plan.intent}\nTime range: ${plan.rangeStart || 'open'} to ${plan.rangeEnd || 'open'}\n\nSaved relationship/plan context:\n${memory || '(none)'}\n\nPrevious Ask Claire turns:\n${previousTurns || '(none)'}\n\nConversation evidence:\n${sources || '(no matching messages found)'}`;
  }

  private async retrieve(userId: string, plan: AssistantQueryPlan, preferredChatIds: string[] = [], strictScope = false): Promise<AssistantCitation[]> {
    const strictChatId = strictScope ? preferredChatIds[0] : null;
    if (strictScope && !strictChatId) throw new Error('CHAT_SCOPE_REQUIRED');
    const exactPromise = supabase.rpc('search_conversation_messages_v2', {
      query_text: plan.lexicalQuery, target_user_id: userId, preferred_chat_ids: preferredChatIds,
      strict_chat_id: strictChatId, range_start: plan.messageRangeStart, range_end: plan.messageRangeEnd,
      result_limit: RETRIEVAL_CANDIDATES,
    });
    const semanticPromise = this.embedOne(plan.searchQuery).then((embedding) => supabase.rpc('match_conversation_messages_v2', {
      query_embedding: embedding, target_user_id: userId, preferred_chat_ids: preferredChatIds,
      strict_chat_id: strictChatId, range_start: plan.messageRangeStart, range_end: plan.messageRangeEnd,
      minimum_similarity: 0.22, result_limit: RETRIEVAL_CANDIDATES,
    })).catch((error) => {
      logger.warn('Semantic conversation search unavailable; using lexical search:', error);
      return { data: [], error: null };
    });
    const [exact, semantic] = await Promise.all([exactPromise, semanticPromise]);
    if (exact.error) throw exact.error;
    if (semantic.error) throw semantic.error;

    const merged = new Map<string, RetrievedMessage>();
    const add = (row: Record<string, unknown>, rank: number, kind: 'lexical' | 'semantic') => {
      const messageId = String(row.message_id);
      const previous = merged.get(messageId);
      const score = (previous?.score || 0) + 1 / (60 + rank + 1);
      merged.set(messageId, {
        messageId, chatId: String(row.chat_id), excerpt: String(row.content || '').slice(0, 700),
        senderName: String(row.sender_name || 'Unknown'), fromMe: Boolean(row.from_me), timestamp: String(row.timestamp),
        platform: String(row.platform || 'unknown'), chatName: typeof row.chat_name === 'string' ? row.chat_name : null,
        isGroup: Boolean(row.is_group), score: score + (kind === 'semantic' && Number(row.similarity || 0) > 0.65 ? 0.004 : 0),
      });
    };
    (exact.data || []).forEach((row: Record<string, unknown>, rank: number) => add(row, rank, 'lexical'));
    (semantic.data || []).forEach((row: Record<string, unknown>, rank: number) => add(row, rank, 'semantic'));
    const anchors = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, RETRIEVAL_LIMIT);
    const expanded = await Promise.all(anchors.map((anchor) => this.expandEvidenceWindow(userId, anchor)));
    return expanded.map(({ score: _score, ...citation }) => ({
      ...citation, ...(preferredChatIds.length ? { isPreferredScope: preferredChatIds.includes(citation.chatId) } : {}),
    }));
  }

  private async expandEvidenceWindow(userId: string, anchor: RetrievedMessage): Promise<RetrievedMessage> {
    const timestamp = new Date(anchor.timestamp).getTime();
    const { data, error } = await supabase.from('messages')
      .select('id, content, contact_name, from_me, timestamp').eq('user_id', userId).eq('chat_id', anchor.chatId)
      .eq('is_deleted', false).gte('timestamp', new Date(timestamp - 43_200_000).toISOString())
      .lte('timestamp', new Date(timestamp + 43_200_000).toISOString()).not('content', 'is', null)
      .order('timestamp', { ascending: true }).limit(9);
    if (error || !data?.length) return anchor;
    const excerpt = data.map((row: DbRow) => {
      const marker = row.id === anchor.messageId ? '→ ' : '';
      return `${marker}${row.from_me ? 'You' : row.contact_name || anchor.senderName}: ${String(row.content || '').slice(0, 280)}`;
    }).join('\n').slice(0, 1_600);
    return { ...anchor, excerpt };
  }

  private async getMemoryContext(userId: string, plan: AssistantQueryPlan): Promise<string> {
    const sections: string[] = [];
    if (plan.needsPeopleMemory) {
      await this.refreshRelationshipMetricsIfStale(userId);
      const [{ data: metrics }, { data: profiles }, { data: chats }] = await Promise.all([
        supabase.from('assistant_relationship_metrics')
          .select('chat_id, interaction_count_30d, interaction_count_90d, sent_count_90d, received_count_90d, last_interaction_at')
          .eq('user_id', userId).order('interaction_count_90d', { ascending: false }).limit(40),
        supabase.from('contact_profiles').select('chat_id, display_name, location, key_facts, relationship_context')
          .eq('user_id', userId).limit(100),
        supabase.from('chats').select('id, name, platform').eq('user_id', userId).eq('is_group', false).limit(100),
      ]);
      const profilesByChat = new Map<string, DbRow>((profiles || []).map((row: DbRow) => [String(row.chat_id), row]));
      const chatsById = new Map<string, DbRow>((chats || []).map((row: DbRow) => [String(row.id), row]));
      const people = (metrics || []).slice(0, 40).map((row: DbRow) => {
        const profile = profilesByChat.get(String(row.chat_id));
        const chat = chatsById.get(String(row.chat_id));
        return `- ${profile?.display_name || chat?.name || 'Unknown'} (${chat?.platform || 'unknown'}): ${row.interaction_count_30d} messages/30d, ${row.interaction_count_90d} messages/90d; location=${profile?.location || 'unknown'}; relationship=${profile?.relationship_context || 'unknown'}; facts=${JSON.stringify(profile?.key_facts || [])}`;
      });
      if (people.length) sections.push(`Relationship ranking (interaction count is a signal, not proof of closeness):\n${people.join('\n')}`);
    }
    if (plan.needsPlanMemory) {
      let query = supabase.from('promises').select('content, deadline, status, chat_id, confidence')
        .eq('user_id', userId).in('status', ['pending', 'overdue']).order('deadline', { ascending: true }).limit(20);
      if (plan.rangeStart) query = query.gte('deadline', plan.rangeStart);
      if (plan.rangeEnd) query = query.lt('deadline', plan.rangeEnd);
      const { data } = await query;
      if (data?.length) sections.push(`Saved commitments:\n${data.map((row: DbRow) => `- ${row.deadline || 'no date'}: ${row.content}`).join('\n')}`);
    }
    return sections.join('\n\n').slice(0, 8_000);
  }

  private async refreshRelationshipMetricsIfStale(userId: string): Promise<void> {
    const { data } = await supabase.from('assistant_relationship_metrics').select('updated_at')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const updatedAt = data?.updated_at ? new Date(data.updated_at).getTime() : 0;
    if (Date.now() - updatedAt < 6 * 60 * 60 * 1000) return;
    const { error } = await supabase.rpc('refresh_assistant_relationship_metrics', { target_user_id: userId });
    if (error) logger.warn('[Ask Claire] relationship metrics refresh unavailable', error);
  }

  private async runBackfill(userId: string): Promise<void> {
    await this.writeIndexState(userId, { status: 'indexing', last_error: null });
    try {
      for (let batch = 0; batch < MAX_BACKGROUND_BATCHES; batch += 1) {
        const { data, error } = await supabase.rpc('get_stale_conversation_messages', {
          target_user_id: userId, result_limit: BACKFILL_BATCH_SIZE,
        });
        if (error) throw error;
        const rows = (data || []) as MessageToIndex[];
        if (!rows.length) break;
        await this.indexMessages(rows);
      }
      const status = await this.getIndexStatus(userId);
      await this.writeIndexState(userId, {
        status: status.indexedCount >= status.totalCount ? 'ready' : 'idle', indexed_count: status.indexedCount,
        total_count: status.totalCount, last_indexed_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Conversation assistant backfill failed:', error);
      await this.writeIndexState(userId, { status: 'failed', last_error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async indexMessages(messages: MessageToIndex[]): Promise<void> {
    const stale = messages.map((message) => {
      const input = this.embeddingText(message);
      return { message, input, hash: this.hash(input) };
    }).filter((item) => item.message.content?.trim() && item.message.stored_content_hash !== item.hash);
    if (!stale.length) return;
    const { embeddings, provider, modelId } = await this.embedBatch(stale.map((item) => item.input));
    const indexedAt = new Date().toISOString();
    const rows = stale.map((item, index) => ({
      message_id: item.message.id, user_id: item.message.user_id, content_hash: item.hash,
      embedding: embeddings[index], embedding_model: `${provider}:${modelId}`,
      embedding_dimensions: embeddings[index]?.length || 1536, indexed_at: indexedAt,
    }));
    const { error } = await supabase.from('conversation_message_embeddings').upsert(rows, { onConflict: 'message_id' });
    if (error) throw error;
  }

  private async embedOne(input: string): Promise<number[]> {
    let lastError: unknown = new Error('NO_EMBEDDING_PROVIDER');
    for (const candidate of resolveEmbeddingRole()) {
      try {
        const result = await embed({ model: candidate.model, value: input.slice(0, 12_000) });
        if (result.embedding.length !== 1536) throw new Error(`EMBEDDING_DIMENSION_${result.embedding.length}`);
        return result.embedding;
      } catch (error) {
        lastError = error;
        logger.warn('[Ask Claire] embedding provider failed; trying fallback', { provider: candidate.provider, model: candidate.modelId, error });
      }
    }
    throw lastError;
  }

  private async embedBatch(inputs: string[]): Promise<{ embeddings: number[][]; provider: string; modelId: string }> {
    let lastError: unknown = new Error('NO_EMBEDDING_PROVIDER');
    for (const candidate of resolveEmbeddingRole()) {
      try {
        const result = await embedMany({ model: candidate.model, values: inputs.map((input) => input.slice(0, 12_000)) });
        if (result.embeddings.some((value) => value.length !== 1536)) throw new Error('EMBEDDING_DIMENSION_MISMATCH');
        return { embeddings: result.embeddings, provider: candidate.provider, modelId: candidate.modelId };
      } catch (error) {
        lastError = error;
        logger.warn('[Ask Claire] embedding batch failed; trying fallback', { provider: candidate.provider, model: candidate.modelId, error });
      }
    }
    throw lastError;
  }

  private async getConversationInstructions(userId: string, chatIds: string[]): Promise<string> {
    if (!chatIds.length) return '';
    const { data, error } = await supabase.from('contact_profiles')
      .select('chat_id, ai_instruction').eq('user_id', userId).in('chat_id', chatIds).not('ai_instruction', 'is', null);
    if (error) throw error;
    return (data || []).map((row: DbRow) => `Chat ${row.chat_id}: ${row.ai_instruction}`).join('\n');
  }

  private async ensureConversationThread(userId: string, chatId: string): Promise<AssistantThread> {
    await this.assertChatOwnership(userId, chatId);
    const { data: existing, error: existingError } = await supabase.from('conversation_assistant_threads')
      .select('id, title, chat_id, created_at, updated_at').eq('user_id', userId).eq('chat_id', chatId).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing as AssistantThread;
    const { data: chat, error: chatError } = await supabase.from('chats').select('name')
      .eq('id', chatId).eq('user_id', userId).single();
    if (chatError) throw chatError;
    const { data, error } = await supabase.from('conversation_assistant_threads')
      .insert({ user_id: userId, chat_id: chatId, title: `Claire · ${chat.name || 'Conversation'}` })
      .select('id, title, chat_id, created_at, updated_at').single();
    if (!error && data) return data as AssistantThread;
    const { data: concurrent, error: concurrentError } = await supabase.from('conversation_assistant_threads')
      .select('id, title, chat_id, created_at, updated_at').eq('user_id', userId).eq('chat_id', chatId).maybeSingle();
    if (concurrentError) throw concurrentError;
    if (concurrent) return concurrent as AssistantThread;
    throw error || new Error('Unable to create conversation assistant thread');
  }

  private async assertChatOwnership(userId: string, chatId: string): Promise<void> {
    const { data, error } = await supabase.from('chats').select('id').eq('id', chatId).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('CHAT_NOT_FOUND');
  }

  private embeddingText(message: MessageToIndex): string {
    return `Platform: ${message.platform || 'unknown'}\nSender: ${message.from_me ? 'You' : message.contact_name || 'Contact'}\nMessage: ${message.content || ''}`;
  }

  private hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

  private async writeIndexState(userId: string, updates: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('conversation_assistant_index_state').upsert({
      user_id: userId, ...updates, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
  }
}

export const conversationAssistant = new ConversationAssistantService();
