/**
 * Validate plugin-supplied loop blocks before they are stored.
 *
 * Enforcement happens here, on the way in — never at render time. A renderer
 * that trusted the shape would be trusting the plugin, and every client
 * (mobile, desktop, future web) would have to re-implement the same checks and
 * get them all right.
 *
 * Three rules carry real weight:
 *
 *  1. `requiresApproval` is COMPUTED, never accepted. A plugin declaring its own
 *     action low-risk is the whole attack.
 *  2. `link.url` must be https and its host must be in the manifest's egress
 *     allowlist, so a block cannot become an exfiltration channel or a
 *     phishing surface.
 *  3. Unknown block kinds are rejected rather than ignored, so a newer plugin
 *     cannot smuggle a payload past an older server.
 *
 * See /docs/plans/loops-revamp §8.
 */

import {
  LOOP_BLOCK_KINDS,
  LOOP_BLOCK_LIMITS,
  type LoopBlock,
  type LoopBlockIcon,
} from '@claire/plugin-sdk';

export interface BlockValidationContext {
  /** Capability ids the installation actually declares AND has a grant for. */
  grantedCapabilityIds: Set<string>;
  /** Hosts the manifest declares for egress. */
  egressAllowlist: Set<string>;
  /** Risk per capability, from the installation snapshot — never from the response. */
  capabilityRisk: Map<string, 'read' | 'low_write' | 'external_write' | 'destructive'>;
}

export interface BlockValidationResult {
  blocks: LoopBlock[];
  errors: string[];
}

const ICONS: LoopBlockIcon[] = ['calendar', 'clock', 'person', 'link', 'check', 'warning', 'document'];

/** Risks that can never be executed without the user seeing and approving. */
const ALWAYS_APPROVE: ReadonlySet<string> = new Set(['external_write', 'destructive']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, max: number = LOOP_BLOCK_LIMITS.maxStringLength): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  // No markup: the renderer prints text, and this keeps it that way even if a
  // future renderer is careless.
  if (/[<>]/.test(trimmed)) return null;
  return trimmed;
}

function icon(value: unknown): LoopBlockIcon | undefined {
  return typeof value === 'string' && (ICONS as string[]).includes(value)
    ? (value as LoopBlockIcon)
    : undefined;
}

/** An ISO instant. Rejects anything unparseable rather than storing it. */
function instant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Validate one row of blocks.
 *
 * Invalid blocks are dropped individually and reported: one malformed block
 * should not cost the user the rest of a plugin's output.
 */
export function validateLoopBlocks(
  input: unknown,
  context: BlockValidationContext,
): BlockValidationResult {
  const errors: string[] = [];
  const blocks: LoopBlock[] = [];

  if (!Array.isArray(input)) {
    return { blocks: [], errors: ['blocks must be an array'] };
  }

  if (input.length > LOOP_BLOCK_LIMITS.maxBlocksPerRow) {
    errors.push(
      `too many blocks: ${input.length} > ${LOOP_BLOCK_LIMITS.maxBlocksPerRow}; extra blocks dropped`,
    );
  }

  for (const [index, raw] of input.slice(0, LOOP_BLOCK_LIMITS.maxBlocksPerRow).entries()) {
    const block = validateOne(raw, context, index, errors);
    if (block) blocks.push(block);
  }

  // Second line of defence behind the database CHECK.
  const size = Buffer.byteLength(JSON.stringify(blocks), 'utf8');
  if (size > LOOP_BLOCK_LIMITS.maxRowBytes) {
    return { blocks: [], errors: [...errors, `row too large: ${size} bytes`] };
  }

  return { blocks, errors };
}

function validateOne(
  raw: unknown,
  context: BlockValidationContext,
  index: number,
  errors: string[],
): LoopBlock | null {
  const fail = (reason: string): null => {
    errors.push(`block[${index}]: ${reason}`);
    return null;
  };

  if (!isPlainObject(raw)) return fail('not an object');

  const kind = raw.kind;
  if (typeof kind !== 'string' || !(LOOP_BLOCK_KINDS as readonly string[]).includes(kind)) {
    return fail(`unknown kind ${JSON.stringify(kind)}`);
  }

  // No styling, ever. Layout belongs to Claire.
  //
  // `style` is exempt on action blocks only, where it selects one of three
  // named intents (primary/secondary/destructive) rather than carrying CSS.
  // Everything else is banned on every kind — unknown fields are dropped when
  // the block is rebuilt below, so this is a second line of defence that also
  // gives the plugin author a clear error instead of silent stripping.
  const banned = ['color', 'font', 'fontSize', 'spacing', 'width', 'height', 'css', 'html', 'script'];
  for (const field of kind === 'action' ? banned : ['style', ...banned]) {
    if (field in raw) return fail(`may not set ${field}`);
  }

  switch (kind) {
    case 'summary': {
      const title = str(raw.title);
      const body = str(raw.body);
      if (!title || !body) return fail('summary needs title and body');
      const tone = raw.tone;
      return {
        kind: 'summary',
        title,
        body,
        ...(tone === 'positive' || tone === 'warning' || tone === 'neutral' ? { tone } : {}),
      };
    }

    case 'facts': {
      if (!Array.isArray(raw.items)) return fail('facts needs items');
      const items = raw.items
        .slice(0, LOOP_BLOCK_LIMITS.maxFactItems)
        .map((item) => {
          if (!isPlainObject(item)) return null;
          const label = str(item.label, 120);
          const value = str(item.value);
          return label && value ? { label, value, ...(icon(item.icon) ? { icon: icon(item.icon)! } : {}) } : null;
        })
        .filter((item): item is { label: string; value: string; icon?: LoopBlockIcon } => !!item);

      if (!items.length) return fail('facts had no valid items');
      const title = str(raw.title, 120);
      return { kind: 'facts', ...(title ? { title } : {}), items };
    }

    case 'datetime': {
      const label = str(raw.label, 120);
      const start = instant(raw.start);
      const timezone = str(raw.timezone, 64);
      if (!label || !start || !timezone) return fail('datetime needs label, valid start, and timezone');
      const end = instant(raw.end);
      const conflicts = Array.isArray(raw.conflicts)
        ? raw.conflicts
            .slice(0, LOOP_BLOCK_LIMITS.maxConflicts)
            .map((c) => str(c))
            .filter((c): c is string => !!c)
        : [];
      return {
        kind: 'datetime',
        label,
        start,
        ...(end ? { end } : {}),
        timezone,
        ...(raw.allDay === true ? { allDay: true } : {}),
        ...(conflicts.length ? { conflicts } : {}),
      };
    }

    case 'choice': {
      const prompt = str(raw.prompt);
      if (!prompt || !Array.isArray(raw.options)) return fail('choice needs prompt and options');
      const options = raw.options
        .slice(0, LOOP_BLOCK_LIMITS.maxChoiceOptions)
        .map((option) => {
          if (!isPlainObject(option)) return null;
          const id = str(option.id, 64);
          const label = str(option.label, 120);
          const capabilityId = str(option.capabilityId, 120);
          if (!id || !label || !capabilityId) return null;
          // An option is an action in disguise, so it needs the same grant check.
          if (!context.grantedCapabilityIds.has(capabilityId)) return null;
          return { id, label, capabilityId, input: isPlainObject(option.input) ? option.input : {} };
        })
        .filter((o): o is { id: string; label: string; capabilityId: string; input: Record<string, unknown> } => !!o);

      if (!options.length) return fail('choice had no options with granted capabilities');
      return { kind: 'choice', prompt, options };
    }

    case 'action': {
      const actionId = str(raw.actionId, 64);
      const label = str(raw.label, 120);
      const capabilityId = str(raw.capabilityId, 120);
      if (!actionId || !label || !capabilityId) return fail('action needs actionId, label, capabilityId');

      if (!context.grantedCapabilityIds.has(capabilityId)) {
        return fail(`capability ${capabilityId} is not installed and granted`);
      }

      const style = raw.style;
      const inputPreview = Array.isArray(raw.inputPreview)
        ? raw.inputPreview
            .slice(0, LOOP_BLOCK_LIMITS.maxInputPreviewItems)
            .map((item) => {
              if (!isPlainObject(item)) return null;
              const l = str(item.label, 120);
              const v = str(item.value);
              return l && v ? { label: l, value: v } : null;
            })
            .filter((item): item is { label: string; value: string } => !!item)
        : [];

      // COMPUTED, never taken from the plugin. Risk comes from the installation
      // snapshot, so neither a tool description nor an adapter response can
      // lower it.
      const risk = context.capabilityRisk.get(capabilityId) ?? 'destructive';
      const requiresApproval = ALWAYS_APPROVE.has(risk) || risk === 'low_write';

      const destination = str(raw.destination, 200);
      if (destination && !context.egressAllowlist.has(destination)) {
        return fail(`destination ${destination} is not in the egress allowlist`);
      }

      return {
        kind: 'action',
        actionId,
        label,
        capabilityId,
        style: style === 'primary' || style === 'destructive' ? style : 'secondary',
        inputPreview,
        requiresApproval,
        ...(destination ? { destination } : {}),
      };
    }

    case 'status': {
      const state = raw.state;
      const valid = ['pending', 'awaiting_approval', 'running', 'succeeded', 'failed'];
      const label = str(raw.label, 120);
      if (typeof state !== 'string' || !valid.includes(state) || !label) {
        return fail('status needs a valid state and label');
      }
      const detail = str(raw.detail);
      const receiptId = str(raw.receiptId, 64);
      const undoActionId = str(raw.undoActionId, 64);
      return {
        kind: 'status',
        state: state as 'pending' | 'awaiting_approval' | 'running' | 'succeeded' | 'failed',
        label,
        ...(detail ? { detail } : {}),
        ...(receiptId ? { receiptId } : {}),
        ...(undoActionId ? { undoActionId } : {}),
      };
    }

    case 'link': {
      const label = str(raw.label, 120);
      const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
      if (!label || !rawUrl) return fail('link needs label and url');

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return fail('link url is not a valid URL');
      }

      // http:// would let a block downgrade a user onto a cleartext connection.
      if (parsed.protocol !== 'https:') return fail('link url must be https');
      if (!context.egressAllowlist.has(parsed.host)) {
        return fail(`link host ${parsed.host} is not in the egress allowlist`);
      }

      // The host is derived, not accepted: a plugin could otherwise label a
      // link with a host it does not point at.
      return { kind: 'link', label, url: parsed.toString(), host: parsed.host };
    }

    default:
      return fail(`unhandled kind ${kind}`);
  }
}
