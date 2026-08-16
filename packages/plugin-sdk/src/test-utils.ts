import type { ClairePlugin, PluginActionRequest, PluginActionResult } from './index';

export type PluginFixture = {
  conversationId: string;
  sourceMessageIds: string[];
  input: Record<string, unknown>;
};

export async function runPluginAction(
  plugin: ClairePlugin,
  actionId: string,
  fixture: PluginFixture,
): Promise<PluginActionResult> {
  const handler = plugin.handlers[actionId];
  if (!handler) {
    throw new Error(`Unknown action ${actionId}`);
  }
  const request: PluginActionRequest = {
    actionId,
    input: fixture.input,
    conversationId: fixture.conversationId,
    sourceMessageIds: fixture.sourceMessageIds,
    dryRun: true,
  };
  return handler(request);
}
