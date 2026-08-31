/**
 * Schema-validated model output with provider failover.
 *
 * Replaces the hand-rolled fence-stripping and `as unknown as` private-method
 * cast in the detector this replaces: `generateObject` constrains the model at
 * the provider level, so malformed JSON stops being a case the caller handles.
 *
 * Two properties the loop pipeline depends on:
 *
 *  1. **Partial results beat no results.** A response with one bad op among ten
 *     should yield nine ops, not an exception. `callStructuredList` drops
 *     individual invalid entries and reports them.
 *  2. **Failover is per-provider, not per-request.** A 429 on Azure must fall
 *     through to OpenAI rather than losing the detection pass.
 */

import { generateObject, NoObjectGeneratedError } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import { logger } from '../../utils/logger';
import { resolveRole, hasAnyProvider, type ModelRole } from './provider-registry';

export interface StructuredRequest {
  role: ModelRole;
  system: string;
  prompt: string;
  /**
   * Typed as ZodTypeAny rather than ZodType<T>: schemas using `.default()` have
   * an input type that differs from their output type, which makes the stricter
   * signature reject exactly the schemas the pipeline relies on.
   */
  schema: z.ZodTypeAny;
  /** Short identifier used in logs and metrics, e.g. "loop.extract". */
  label: string;
  maxOutputTokens?: number;
  temperature?: number;
  schemaName?: string;
  schemaDescription?: string;
}

export interface StructuredResult<T> {
  object: T;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}

interface GenerateOneOptions {
  model: LanguageModel;
  schema: z.ZodTypeAny;
  schemaName?: string;
  schemaDescription?: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  temperature?: number;
  providerOptions?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}

interface GenerateOneResult {
  object: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/**
 * The single untyped boundary in this module.
 *
 * `generateObject` derives its result type from the schema generic, and with a
 * schema whose concrete shape is only known at runtime TypeScript cannot bound
 * that recursion (TS2589). Everything the caller sees is still typed: the schema
 * validates the payload at runtime, and callStructured re-narrows the result.
 * Confining the escape hatch to one three-line function keeps it honest.
 */
async function generateOne(options: GenerateOneOptions): Promise<GenerateOneResult> {
  const generate = generateObject as unknown as (opts: unknown) => Promise<GenerateOneResult>;
  return generate(options);
}

export class NoProviderError extends Error {
  constructor() {
    super('NO_AI_PROVIDER');
    this.name = 'NoProviderError';
  }
}

function isReasoningModel(modelId: string): boolean {
  return modelId.startsWith('gpt-5') || /^(o1|o3|o4)(?:-|$)/.test(modelId);
}

function structuredProviderOptions(candidate: { provider: string; modelId: string }): Record<string, unknown> | undefined {
  if (candidate.provider !== 'openai' || !isReasoningModel(candidate.modelId)) return undefined;
  return { openai: { reasoningEffort: 'low', strictJsonSchema: true } };
}

/**
 * Call a model and get a schema-valid object back.
 *
 * Throws NoProviderError when nothing is configured, so callers can distinguish
 * "not set up" from "the model failed" — the old detector conflated the two and
 * silently fell back to regex.
 */
export async function callStructured<T>(request: StructuredRequest): Promise<StructuredResult<T>> {
  if (!hasAnyProvider()) throw new NoProviderError();

  const candidates = resolveRole(request.role);
  if (!candidates.length) throw new NoProviderError();

  const failures: string[] = [];

  for (const candidate of candidates) {
    try {
      const result = await generateOne({
        model: candidate.model,
        schema: request.schema,
        schemaName: request.schemaName,
        schemaDescription: request.schemaDescription,
        system: request.system,
        prompt: request.prompt,
        maxOutputTokens: request.maxOutputTokens ?? 1500,
        // OpenAI reasoning models do not accept temperature. Their output is
        // constrained by strict JSON Schema, so omit it for those models.
        temperature: isReasoningModel(candidate.modelId) ? undefined : request.temperature ?? 0,
        providerOptions: structuredProviderOptions(candidate),
        // A stalled call should try the fallback instead of holding a whole
        // backfill indefinitely.
        abortSignal: AbortSignal.timeout(60_000),
      });

      return {
        object: result.object as T,
        provider: candidate.provider,
        modelId: candidate.modelId,
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`${candidate.provider}(${candidate.modelId}): ${detail}`);

      const noObject = NoObjectGeneratedError.isInstance(error) ? error : null;
      logger.warn('[ai] structured call failed, trying next provider', {
        label: request.label,
        provider: candidate.provider,
        modelId: candidate.modelId,
        noObjectGenerated: !!noObject,
        finishReason: noObject?.finishReason,
        responseId: noObject?.response?.id,
        outputChars: noObject?.text?.length ?? 0,
        error: detail,
      });
    }
  }

  throw new Error(`STRUCTURED_CALL_FAILED ${request.label}: ${failures.join(' | ')}`);
}

export interface StructuredListResult<T> extends Omit<StructuredResult<T[]>, 'object'> {
  items: T[];
  /** Entries the model returned that did not satisfy the item schema. */
  dropped: Array<{ index: number; reason: string }>;
}

/**
 * Call a model for a list of items, validating each independently.
 *
 * The provider-facing wrapper must use the item schema. OpenAI structured
 * output rejects `items: {}` (the JSON Schema emitted by `z.unknown()`), and
 * a strict item schema gives the model a useful contract instead of accepting
 * arbitrary JSON. We still validate each entry below as a defensive boundary
 * for providers that return a compatible but imperfect payload.
 */
export async function callStructuredList<T>(
  request: Omit<StructuredRequest, 'schema'> & { itemSchema: z.ZodTypeAny; listKey: string },
): Promise<StructuredListResult<T>> {
  const wrapper = z.object({ [request.listKey]: z.array(request.itemSchema) });

  const result = await callStructured<Record<string, unknown[]>>({
    role: request.role,
    system: request.system,
    prompt: request.prompt,
    schema: wrapper,
    label: request.label,
    maxOutputTokens: request.maxOutputTokens,
    temperature: request.temperature,
    schemaName: request.schemaName,
    schemaDescription: request.schemaDescription,
  });

  const raw = result.object[request.listKey] ?? [];
  const items: T[] = [];
  const dropped: Array<{ index: number; reason: string }> = [];

  raw.forEach((entry, index) => {
    const parsed = request.itemSchema.safeParse(entry);
    if (parsed.success) {
      items.push(parsed.data as T);
    } else {
      dropped.push({ index, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
  });

  if (dropped.length) {
    logger.warn('[ai] dropped invalid items from structured list', {
      label: request.label,
      kept: items.length,
      dropped: dropped.length,
      reasons: dropped.slice(0, 3),
    });
  }

  return {
    items,
    dropped,
    provider: result.provider,
    modelId: result.modelId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}
