/**
 * The declarative UI vocabulary a plugin may render inside a loop.
 *
 * The plugin spec excludes "plugins drawing *unrestricted* custom UI inside a
 * message thread". This is deliberately the opposite of unrestricted: a fixed,
 * server-validated, typed JSON vocabulary with no styling, no nesting, no
 * markup, and no code. **The plugin supplies data; Claire owns rendering.**
 * A calendar plugin can say "here is an event and three things you might do
 * about it"; it cannot draw anything, run anything, or phone anywhere.
 *
 * Every constraint here is enforced server-side before persistence, not at
 * render time — see validateLoopBlocks. A renderer that trusted this shape
 * would be trusting the plugin.
 */

export type LoopBlockIcon =
  | 'calendar'
  | 'clock'
  | 'person'
  | 'link'
  | 'check'
  | 'warning'
  | 'document';

export type LoopBlockTone = 'neutral' | 'positive' | 'warning';

/** A short narrative line. */
export interface SummaryBlock {
  kind: 'summary';
  title: string;
  body: string;
  tone?: LoopBlockTone;
}

/** Label/value pairs. The only "table" a plugin gets. */
export interface FactsBlock {
  kind: 'facts';
  title?: string;
  items: Array<{ label: string; value: string; icon?: LoopBlockIcon }>;
}

/** A proposed time. Rendered by Claire in the user's own locale and timezone. */
export interface DateTimeBlock {
  kind: 'datetime';
  label: string;
  start: string;
  end?: string;
  timezone: string;
  allDay?: boolean;
  conflicts?: string[];
}

/** A small set of alternatives, each mapping to a capability call. */
export interface ChoiceBlock {
  kind: 'choice';
  prompt: string;
  options: Array<{ id: string; label: string; capabilityId: string; input: Record<string, unknown> }>;
}

/** A single action the user can take. */
export interface ActionBlock {
  kind: 'action';
  actionId: string;
  label: string;
  capabilityId: string;
  style: 'primary' | 'secondary' | 'destructive';
  /** Exactly what will be sent, shown to the user before they approve. */
  inputPreview: Array<{ label: string; value: string }>;
  /**
   * Computed by Claire from the installation's manifest risk. A value supplied
   * by the plugin is always overwritten — a plugin cannot de-escalate itself.
   */
  requiresApproval: boolean;
  /** Where the action sends data, e.g. "calendar.google.com". */
  destination?: string;
}

/** The outcome of an action already taken. */
export interface StatusBlock {
  kind: 'status';
  state: 'pending' | 'awaiting_approval' | 'running' | 'succeeded' | 'failed';
  label: string;
  detail?: string;
  receiptId?: string;
  undoActionId?: string;
}

/** An outbound link. The renderer shows `host`, never a naked URL. */
export interface LinkBlock {
  kind: 'link';
  label: string;
  url: string;
  host: string;
}

export type LoopBlock =
  | SummaryBlock
  | FactsBlock
  | DateTimeBlock
  | ChoiceBlock
  | ActionBlock
  | StatusBlock
  | LinkBlock;

export const LOOP_BLOCK_KINDS = [
  'summary',
  'facts',
  'datetime',
  'choice',
  'action',
  'status',
  'link',
] as const;

/**
 * Limits. Deliberately small: a loop is a follow-up, not a plugin's canvas.
 */
export const LOOP_BLOCK_LIMITS = {
  maxBlocksPerRow: 6,
  maxRowsPerLoop: 3,
  maxRowBytes: 16_384,
  maxStringLength: 500,
  maxFactItems: 8,
  maxChoiceOptions: 5,
  maxInputPreviewItems: 10,
  maxConflicts: 5,
} as const;
