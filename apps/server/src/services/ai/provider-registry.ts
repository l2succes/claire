/**
 * Model selection, by task role rather than by provider.
 *
 * Claire runs on credits: Azure first (usually time-boxed), then OpenAI, then
 * open-weight hosts. Which provider serves a role therefore changes on a
 * business timeline, not an engineering one — so callers ask for a *role*
 * ("extraction") and never for a provider.
 *
 * This is the only module in the loop pipeline allowed to import provider
 * packages, per AI_PLATFORM_AND_SELF_HOSTING_SPEC §7.1.
 *
 * See /docs/product/ai-model-costs.
 */

import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

import { aiConfig } from '../../config';
import { logger } from '../../utils/logger';

/**
 * Task roles. Roles are NOT equally portable: triage is trivially portable,
 * extraction needs schema retries on weaker models, and the agent should stay
 * on a strong model longest because tool calling is the leakiest part of the
 * abstraction. Migrate role by role, never all at once.
 */
export type ModelRole = 'triage' | 'extraction' | 'assistant';

export type ProviderId = 'azure' | 'openai' | 'kimi' | 'compatible';

export interface RoleResolution {
  model: LanguageModel;
  provider: ProviderId;
  modelId: string;
}

/**
 * Defaults per role. Deliberately conservative: the cheap model only ever
 * answers "is there anything here at all?", never "does this concern you?"
 * — that decision is deterministic code in relevance.ts and never a model.
 */
const DEFAULT_MODEL_IDS: Record<ProviderId, Record<ModelRole, string>> = {
  openai: {
    triage: process.env.LOOP_MODEL_TRIAGE_OPENAI || 'gpt-5-nano',
    extraction: process.env.LOOP_MODEL_EXTRACTION_OPENAI || 'gpt-5.6-luna',
    assistant: process.env.LOOP_MODEL_ASSISTANT_OPENAI || 'gpt-5.6-terra',
  },
  azure: {
    triage: process.env.LOOP_MODEL_TRIAGE_AZURE || 'phi-4-mini',
    extraction: process.env.LOOP_MODEL_EXTRACTION_AZURE || 'gpt-4.1',
    assistant: process.env.LOOP_MODEL_ASSISTANT_AZURE || 'gpt-4.1',
  },
  kimi: {
    triage: aiConfig.kimi.model,
    extraction: aiConfig.kimi.model,
    assistant: aiConfig.kimi.model,
  },
  compatible: {
    triage: process.env.LOOP_MODEL_TRIAGE_COMPATIBLE || '',
    extraction: process.env.LOOP_MODEL_EXTRACTION_COMPATIBLE || '',
    assistant: process.env.LOOP_MODEL_ASSISTANT_COMPATIBLE || '',
  },
};

/**
 * Preference order. Azure leads because those credits typically expire; OpenAI
 * is the large durable balance; Kimi and generic OpenAI-compatible hosts are
 * the post-credits path. Override with LOOP_PROVIDER_ORDER.
 */
function providerOrder(): ProviderId[] {
  const raw = process.env.LOOP_PROVIDER_ORDER;
  if (raw) {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry): entry is ProviderId =>
        entry === 'azure' || entry === 'openai' || entry === 'kimi' || entry === 'compatible',
      );
  }
  return ['azure', 'openai', 'kimi', 'compatible'];
}

let cachedProviders: Partial<Record<ProviderId, (modelId: string) => LanguageModel>> | null = null;

function buildProviders(): Partial<Record<ProviderId, (modelId: string) => LanguageModel>> {
  if (cachedProviders) return cachedProviders;

  const providers: Partial<Record<ProviderId, (modelId: string) => LanguageModel>> = {};

  const azureName = process.env.AZURE_OPENAI_RESOURCE_NAME;
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  if (azureName && azureKey) {
    const azure = createAzure({ resourceName: azureName, apiKey: azureKey });
    providers.azure = (modelId) => azure(modelId);
  }

  if (aiConfig.openai.apiKey) {
    const openai = createOpenAI({ apiKey: aiConfig.openai.apiKey });
    providers.openai = (modelId) => openai(modelId);
  }

  if (aiConfig.kimi.apiKey) {
    // Moonshot speaks the OpenAI wire format, so it needs no bespoke binding.
    const kimi = createOpenAICompatible({
      name: 'kimi',
      apiKey: aiConfig.kimi.apiKey,
      baseURL: aiConfig.kimi.baseUrl,
    });
    providers.kimi = (modelId) => kimi(modelId);
  }

  const compatibleUrl = process.env.LOOP_COMPATIBLE_BASE_URL;
  if (compatibleUrl) {
    const compatible = createOpenAICompatible({
      name: process.env.LOOP_COMPATIBLE_NAME || 'compatible',
      apiKey: process.env.LOOP_COMPATIBLE_API_KEY || 'unused',
      baseURL: compatibleUrl,
    });
    providers.compatible = (modelId) => compatible(modelId);
  }

  cachedProviders = providers;
  logger.info('[ai] loop provider registry', {
    configured: Object.keys(providers),
    order: providerOrder(),
  });
  return providers;
}

/** Reset memoized providers. Tests only. */
export function resetProviderRegistry(): void {
  cachedProviders = null;
}

/** True when at least one provider is usable, so callers can degrade rather than throw. */
export function hasAnyProvider(): boolean {
  return Object.keys(buildProviders()).length > 0;
}

/**
 * Resolve a role to a concrete model.
 *
 * Returns the ordered list of candidates rather than a single model so callers
 * can fail over. A provider with no model id configured for the role is skipped
 * rather than dispatched to a wrong model.
 */
export function resolveRole(role: ModelRole): RoleResolution[] {
  const providers = buildProviders();
  const resolutions: RoleResolution[] = [];

  for (const provider of providerOrder()) {
    const factory = providers[provider];
    if (!factory) continue;

    const override = process.env[`LOOP_MODEL_${role.toUpperCase()}`];
    const modelId = override || DEFAULT_MODEL_IDS[provider][role];
    if (!modelId) continue;

    resolutions.push({ model: factory(modelId), provider, modelId });
  }

  return resolutions;
}
