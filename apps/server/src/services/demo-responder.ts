/**
 * Demo persona responder
 *
 * When a demo account sends a message, the fake person on the other side
 * answers in character. The reply is injected through the same ingestion path
 * as a real bridge event, so everything downstream — unread badges, push,
 * suggestions, loop detection, the Ask Claire index — reacts exactly as it
 * would to a real message. That is the whole point: what gets filmed is the
 * product, not a mock of it.
 *
 * Three things this module takes seriously:
 *
 *  - **It never runs for a real account.** The caller resolves the demo gate
 *    before reaching here, and `respondTo` re-checks the chat is a scripted one.
 *  - **It never stalls a take.** Model failure falls back to an in-voice line;
 *    a slow provider is abandoned rather than left hanging.
 *  - **It answers a burst once.** Three quick messages get one reply to the
 *    last of them, the way a person would, instead of three replies racing.
 */

import { generateText } from 'ai';

import { Platform, MessageContentType, UnifiedMessage } from '../adapters/types';
import {
  DEMO_FALLBACK_REPLIES,
  DEMO_GENERIC_FALLBACK,
  DEMO_PERSONAS_BY_KEY,
  DemoChat,
  DemoPersona,
} from '../demo/personas';
import { demoGhostId, findDemoChat, demoSessionId } from '../demo/fixtures';
import { hasAnyProvider, resolveRole } from './ai/provider-registry';
import { supabase } from './supabase';
import { logger } from '../utils/logger';

// ─── Tuning ────────────────────────────────────────────────────────────────

/** How long to wait for more messages before the persona starts "typing". */
const BURST_DEBOUNCE_MS = 1_800;

/** Think time floor and ceiling, before the first bubble lands. */
const THINK_MIN_MS = 1_800;
const THINK_MAX_MS = 6_500;

/** Gap between a persona's first and second bubble. */
const BUBBLE_GAP_MIN_MS = 900;
const BUBBLE_GAP_MAX_MS = 2_100;

/** A persona never sends more than this many bubbles per turn. */
const MAX_BUBBLES = 2;

/** Model calls are abandoned rather than allowed to hang mid-demo. */
const GENERATION_TIMEOUT_MS = 12_000;

/** Rate cap per account, so a stuck client cannot run up a provider bill. */
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_MAX_REPLIES = 24;

/** How much conversation the model sees. Enough for voice, not the whole thread. */
const HISTORY_LIMIT = 24;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DemoOutgoingMessage {
  userId: string;
  platform: Platform;
  chatId: string;
  content: string;
}

/** Injects a message into the normal ingestion path. */
export type DemoIngestFn = (message: UnifiedMessage) => Promise<void>;

export interface HistoryLine {
  fromMe: boolean;
  senderName: string | null;
  content: string;
}

/**
 * Reply pacing. Overridable because the right pacing is a judgement call about
 * how a demo reads on camera, and because tests should not spend seconds
 * waiting for a persona to finish "typing".
 */
export interface DemoResponderDelays {
  burstDebounceMs: number;
  thinkMinMs: number;
  thinkMaxMs: number;
  bubbleGapMinMs: number;
  bubbleGapMaxMs: number;
}

export const DEFAULT_DEMO_DELAYS: DemoResponderDelays = {
  burstDebounceMs: BURST_DEBOUNCE_MS,
  thinkMinMs: THINK_MIN_MS,
  thinkMaxMs: THINK_MAX_MS,
  bubbleGapMinMs: BUBBLE_GAP_MIN_MS,
  bubbleGapMaxMs: BUBBLE_GAP_MAX_MS,
};

export interface DemoResponderDeps {
  /**
   * Override the conversation history source. Production reads the database;
   * tests inject a transcript so the responder's turn logic can be exercised
   * without a live Supabase.
   */
  loadHistory?: (request: DemoOutgoingMessage) => Promise<HistoryLine[]>;
  delays?: Partial<DemoResponderDelays>;
}

interface PendingTurn {
  timer: ReturnType<typeof setTimeout>;
  request: DemoOutgoingMessage;
}

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Pure helpers ──────────────────────────────────────────────────────────

/**
 * Who answers.
 *
 * A 1:1 chat has exactly one candidate. In a group, an explicit first-name
 * mention wins, then whoever spoke most recently, then the most talkative
 * member — `replyChance` breaks the tie rather than gating the reply, because
 * silence in front of a camera reads as a broken build, not as realism.
 */
export function chooseResponder(
  chat: DemoChat,
  outgoing: string,
  history: HistoryLine[]
): DemoPersona | null {
  const candidates = chat.participants
    .map((participantKey) => DEMO_PERSONAS_BY_KEY[participantKey])
    .filter((persona): persona is DemoPersona => Boolean(persona));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const lowered = outgoing.toLowerCase();
  const named = candidates.find((persona) => {
    const firstName = persona.displayName.split(' ')[0].toLowerCase();
    return new RegExp(`\\b${firstName}\\b`).test(lowered);
  });
  if (named) return named;

  for (const line of [...history].reverse()) {
    if (line.fromMe || !line.senderName) continue;
    const match = candidates.find((persona) => persona.displayName === line.senderName);
    if (match) return match;
  }

  return candidates.reduce((most, persona) =>
    persona.sheet.replyStyle.replyChance > most.sheet.replyStyle.replyChance ? persona : most
  );
}

/**
 * Strip the ways a model dresses up a line it was asked to write plainly:
 * a "Name:" prefix, wrapping quotes, markdown emphasis. Bubbles are separated
 * by a line containing only `---`.
 */
export function parseReplyBubbles(raw: string, persona: DemoPersona): string[] {
  const firstName = persona.displayName.split(' ')[0];
  return raw
    .split(/^\s*---\s*$/m)
    .map((part) =>
      part
        .trim()
        .replace(new RegExp(`^(?:${persona.displayName}|${firstName})\\s*:\\s*`, 'i'), '')
        .replace(/^["'\u201c](.*)["'\u201d]$/s, '$1')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .trim()
    )
    .filter((part) => part.length > 0)
    .slice(0, MAX_BUBBLES);
}

// ─── Responder ─────────────────────────────────────────────────────────────

class DemoResponder {
  private readonly delays: DemoResponderDelays;

  constructor(private readonly deps: DemoResponderDeps = {}) {
    this.delays = { ...DEFAULT_DEMO_DELAYS, ...(deps.delays || {}) };
  }

  private ingest: DemoIngestFn | null = null;

  /** Debounced turns, keyed by account + chat. */
  private pending = new Map<string, PendingTurn>();

  /** Chats with a reply in flight, so a slow generation cannot overlap itself. */
  private inFlight = new Set<string>();

  /** Reply timestamps per account, for the rate cap. */
  private recentReplies = new Map<string, number[]>();

  /**
   * Wire the responder to the ingestion path.
   *
   * Injected rather than imported: the adapter layer owns ingestion, and
   * importing it here would close an import cycle through PlatformManager.
   */
  configure(ingest: DemoIngestFn): void {
    this.ingest = ingest;
  }

  get isConfigured(): boolean {
    return this.ingest !== null;
  }

  /** True when a model is available; false means fallback lines only. */
  get hasModel(): boolean {
    return hasAnyProvider();
  }

  /**
   * Schedule an in-character reply to an outgoing demo message.
   *
   * Returns immediately — the reply lands on its own timer, which is what makes
   * it look like a person rather than an echo.
   */
  respondTo(request: DemoOutgoingMessage): void {
    if (!this.ingest) {
      logger.warn('[demo] Responder not configured; no reply will be generated');
      return;
    }
    if (!findDemoChat(request.chatId)) {
      // The demo user wrote to something outside the scripted cast. Nobody is
      // there to answer, which is the honest outcome.
      logger.debug('[demo] No persona chat for outgoing message; not replying');
      return;
    }

    const key = `${request.userId}:${request.chatId}`;
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
      this.pending.delete(key);
      void this.runTurn(key, request).catch((error) => {
        logger.error('[demo] Persona reply failed', { error: (error as Error).message });
      });
    }, this.delays.burstDebounceMs);

    this.pending.set(key, { timer, request });
  }

  /** Cancel every scheduled reply. Used on shutdown and by tests. */
  reset(): void {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.inFlight.clear();
    this.recentReplies.clear();
  }

  // ── Turn execution ──────────────────────────────────────────────────────

  private async runTurn(key: string, request: DemoOutgoingMessage): Promise<void> {
    if (this.inFlight.has(key)) {
      logger.debug('[demo] Reply already in flight for this chat; skipping');
      return;
    }
    if (!this.withinRateLimit(request.userId)) {
      logger.warn('[demo] Persona reply rate cap reached for account');
      return;
    }

    const chat = findDemoChat(request.chatId);
    if (!chat) return;

    this.inFlight.add(key);
    try {
      const history = this.deps.loadHistory
        ? await this.deps.loadHistory(request)
        : await this.loadHistoryFromDatabase(request);
      const persona = chooseResponder(chat, request.content, history);
      if (!persona) return;

      const bubbles = await this.generateBubbles(persona, chat, history, request.content);

      const words = bubbles.join(' ').split(/\s+/).length;
      await sleep(
        Math.min(this.delays.thinkMaxMs, Math.max(this.delays.thinkMinMs, 1_400 + words * 95))
      );

      for (const [index, bubble] of bubbles.entries()) {
        if (index > 0) {
          await sleep(randomBetween(this.delays.bubbleGapMinMs, this.delays.bubbleGapMaxMs));
        }
        await this.deliver(persona, chat, request, bubble, index);
      }
      this.recordReply(request.userId, bubbles.length);
    } finally {
      this.inFlight.delete(key);
    }
  }

  /**
   * Inject one bubble as an inbound message.
   *
   * `isRead: false` is deliberate — a live reply should raise a badge and a
   * push notification, because those are worth filming too.
   */
  private async deliver(
    persona: DemoPersona,
    chat: DemoChat,
    request: DemoOutgoingMessage,
    content: string,
    index: number
  ): Promise<void> {
    const platformMessageId = `demo-live-${chat.key}-${Date.now()}-${index}`;
    const message: UnifiedMessage = {
      id: platformMessageId,
      platformMessageId,
      platform: chat.platform,
      sessionId: demoSessionId(chat.platform, request.userId),
      userId: request.userId,
      content,
      contentType: MessageContentType.TEXT,
      senderId: demoGhostId(chat.platform, persona.platformContactId),
      senderName: persona.displayName,
      chatId: chat.platformChatId,
      chatType: chat.isGroup ? 'group' : 'individual',
      chatName: chat.name,
      timestamp: new Date(),
      isFromMe: false,
      isRead: false,
      hasMedia: false,
      memberCount: chat.isGroup ? chat.participants.length + 1 : 2,
      platformMetadata: { demo: true, demoChatKey: chat.key, demoPersona: persona.key },
    };

    await this.ingest!(message);
    logger.info('[demo] Persona replied', { persona: persona.key, chat: chat.key });
  }

  // ── Generation ──────────────────────────────────────────────────────────

  private async generateBubbles(
    persona: DemoPersona,
    chat: DemoChat,
    history: HistoryLine[],
    outgoing: string
  ): Promise<string[]> {
    if (!this.hasModel) {
      logger.warn('[demo] No AI provider configured; using fallback reply');
      return [this.fallbackFor(persona)];
    }

    const system = this.systemPrompt(persona, chat);
    const prompt = this.userPrompt(persona, chat, history, outgoing);

    for (const candidate of resolveRole('assistant')) {
      try {
        const result = await Promise.race([
          generateText({
            model: candidate.model,
            system,
            prompt,
            // High: this is a person being chatty, not a grounded answer. Low
            // temperature here produces uncannily flat, samey replies.
            temperature: 0.95,
            maxOutputTokens: 220,
          }),
          sleep(GENERATION_TIMEOUT_MS).then(() => {
            throw new Error('demo_generation_timeout');
          }),
        ]);
        const bubbles = parseReplyBubbles(result.text, persona);
        if (bubbles.length > 0) return bubbles;
        logger.warn('[demo] Model returned no usable text; trying fallback model');
      } catch (error) {
        logger.warn('[demo] Persona model failed; trying next candidate', {
          provider: candidate.provider,
          model: candidate.modelId,
          error: (error as Error).message,
        });
      }
    }

    return [this.fallbackFor(persona)];
  }

  private systemPrompt(persona: DemoPersona, chat: DemoChat): string {
    const { sheet } = persona;
    const emojiRule = {
      none: 'Never use emoji.',
      sparse: 'Use an emoji rarely — at most one, and only when it genuinely fits.',
      frequent: 'Use emoji freely, one or two per message.',
    }[sheet.replyStyle.emoji];

    return [
      `You are writing as ${persona.displayName} in a private text conversation. You are not an assistant and you are not helping anyone — you are this person, texting a friend or colleague back.`,
      '',
      `WHO YOU ARE: ${sheet.relationship}`,
      `HOW YOU TEXT: ${sheet.voice}`,
      `WHAT YOU TALK ABOUT: ${sheet.topics.join('; ')}`,
      '',
      'WHAT IS CURRENTLY GOING ON BETWEEN YOU:',
      ...sheet.openThreads.map((thread) => `- ${thread}`),
      chat.isGroup && chat.groupContext ? `\nTHIS IS A GROUP CHAT: ${chat.groupContext}` : '',
      '',
      'RULES:',
      `- Length: usually ${sheet.replyStyle.words[0]}–${sheet.replyStyle.words[1]} words. Never write a paragraph unless this person genuinely would.`,
      `- ${emojiRule}`,
      '- Write only what this person would type. No narration, no stage directions, no quotation marks around the message.',
      '- Never offer assistance, never summarise what the other person said, never ask "how can I help".',
      '- Never mention being an AI, a model, a persona, or a demo. You are a person with a life.',
      '- No markdown, no bullet points, no sign-off with your own name.',
      '- Stay consistent with what is going on above. If you owe them something, you know it.',
      '- It is fine to be brief, distracted, or to answer with a question.',
      `- If this person would naturally send two short bubbles instead of one, separate them with a line containing only ---. At most ${MAX_BUBBLES} bubbles.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private userPrompt(
    persona: DemoPersona,
    chat: DemoChat,
    history: HistoryLine[],
    outgoing: string
  ): string {
    const transcript = history
      .map((line) => {
        const who = line.fromMe ? 'Them' : line.senderName || persona.displayName;
        return `${who}: ${line.content}`;
      })
      .join('\n');

    return [
      `Recent conversation${chat.isGroup ? ` in "${chat.name}"` : ''} (most recent last). "Them" is the person you are texting with:`,
      '',
      transcript || '(no earlier messages)',
      '',
      `They just sent: ${outgoing}`,
      '',
      `Reply as ${persona.displayName}. Output only the message text.`,
    ].join('\n');
  }

  private fallbackFor(persona: DemoPersona): string {
    const options = DEMO_FALLBACK_REPLIES[persona.key];
    if (!options?.length) return DEMO_GENERIC_FALLBACK;
    return options[Math.floor(Math.random() * options.length)];
  }

  // ── History ─────────────────────────────────────────────────────────────

  /**
   * Read history from the database rather than the script, so a reply accounts
   * for whatever was said during the demo itself, not just the seeded past.
   */
  private async loadHistoryFromDatabase(request: DemoOutgoingMessage): Promise<HistoryLine[]> {
    const { data: chat, error: chatError } = await supabase
      .from('chats')
      .select('id')
      .eq('user_id', request.userId)
      .eq('platform', request.platform)
      .eq('platform_chat_id', request.chatId)
      .maybeSingle();
    if (chatError || !chat?.id) {
      logger.debug('[demo] No stored chat for persona history; replying without it');
      return [];
    }

    const { data: rows, error } = await supabase
      .from('messages')
      .select('content, from_me, contact_name, timestamp')
      .eq('user_id', request.userId)
      .eq('chat_id', chat.id)
      .order('timestamp', { ascending: false })
      .limit(HISTORY_LIMIT);
    if (error || !rows) return [];

    return rows
      .reverse()
      .filter((row: { content?: string | null }) => Boolean(row.content?.trim()))
      .map((row: { content: string; from_me: boolean; contact_name: string | null }) => ({
        fromMe: row.from_me,
        senderName: row.contact_name,
        content: row.content,
      }));
  }

  // ── Rate cap ────────────────────────────────────────────────────────────

  private withinRateLimit(userId: string): boolean {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    const recent = (this.recentReplies.get(userId) || []).filter((at) => at > cutoff);
    this.recentReplies.set(userId, recent);
    return recent.length < RATE_LIMIT_MAX_REPLIES;
  }

  private recordReply(userId: string, count: number): void {
    const recent = this.recentReplies.get(userId) || [];
    const now = Date.now();
    for (let index = 0; index < count; index += 1) recent.push(now);
    this.recentReplies.set(userId, recent);
  }
}

export const demoResponder = new DemoResponder();

/** Exported for tests, which need a fresh instance per case. */
export { DemoResponder };
