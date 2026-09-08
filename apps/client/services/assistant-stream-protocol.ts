export interface AssistantWireChunk {
  type?: string;
  delta?: string;
  data?: unknown;
  errorText?: string;
}

/** Parse one AI SDK UI-stream SSE event. `[DONE]` and keep-alives are ignored. */
export function parseAssistantSseEvent(event: string): AssistantWireChunk | null {
  const data = event.split('\n').filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart()).join('\n');
  if (!data || data === '[DONE]') return null;
  return JSON.parse(data) as AssistantWireChunk;
}
