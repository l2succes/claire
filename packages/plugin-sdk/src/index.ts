export type JsonSchema = Record<string, unknown>;

export type PluginVerification = 'claire' | 'verified' | 'community' | 'private';
export type PluginRuntimeKind = 'claire_adapter' | 'remote_mcp' | 'private_mcp';
export type PluginAuthType = 'oauth2' | 'api_key' | 'none';
export type PluginCapabilityKind = 'context' | 'action';
export type PluginRisk = 'read' | 'low_write' | 'external_write' | 'destructive';
export type PluginApproval = 'never' | 'configurable' | 'always';
export type PluginTriggerEvent =
  | 'message.received'
  | 'message.sent'
  | 'promise.detected'
  | 'schedule.detected'
  | 'manual';

export type ClairePluginManifest = {
  schemaVersion: '1';
  id: string;
  version: string;
  name: string;
  description: string;
  publisher: {
    id: string;
    name: string;
    verification: PluginVerification;
    website: string;
    privacyPolicyUrl: string;
    supportUrl: string;
  };
  icon: { lightUrl: string; darkUrl?: string; sha256: string };
  runtime: {
    kind: PluginRuntimeKind;
    endpointRef?: string;
    minimumClaireVersion?: string;
  };
  auth: Array<{
    id: string;
    type: PluginAuthType;
    provider: string;
    requestedScopes: string[];
  }>;
  capabilities: Array<{
    id: string;
    kind: PluginCapabilityKind;
    title: string;
    description: string;
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
    risk: PluginRisk;
    approval: PluginApproval;
    reversible: boolean;
    idempotency: boolean;
  }>;
  triggers: Array<{
    id: string;
    event: PluginTriggerEvent;
    supportedActions: string[];
  }>;
  dataHandling: {
    receivesRawMessages: boolean;
    retention: 'none' | 'transient' | 'provider_policy';
    regions?: string[];
  };
};

export type PluginActionRequest<TInput = Record<string, unknown>> = {
  actionId: string;
  input: TInput;
  conversationId?: string;
  sourceMessageIds?: string[];
  dryRun?: boolean;
};

export type PluginActionResult<TOutput = Record<string, unknown>> = {
  ok: boolean;
  output?: TOutput;
  error?: string;
  receiptId: string;
};

export type PluginHandler<TInput = Record<string, unknown>, TOutput = Record<string, unknown>> = (
  request: PluginActionRequest<TInput>,
) => Promise<PluginActionResult<TOutput>>;

export type ClairePlugin = {
  manifest: ClairePluginManifest;
  handlers: Record<string, PluginHandler>;
};

export function definePlugin(plugin: ClairePlugin): ClairePlugin {
  if (!plugin.manifest.id || !plugin.manifest.version) {
    throw new Error('Plugin manifest requires id and version');
  }
  for (const capability of plugin.manifest.capabilities) {
    if (capability.kind === 'action' && !plugin.handlers[capability.id]) {
      throw new Error(`Missing handler for action ${capability.id}`);
    }
  }
  return plugin;
}

export function createReceiptId(prefix = 'receipt'): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
