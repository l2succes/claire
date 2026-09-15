const MAX_CITED_SOURCES = 4;

export function selectSourceIndices(sourceCount: number, sourceIndices: unknown): number[] {
  const requested = Array.isArray(sourceIndices) ? sourceIndices : [];
  return [...new Set(requested)]
    .filter((index): index is number => Number.isInteger(index) && index >= 1 && index <= sourceCount)
    .slice(0, MAX_CITED_SOURCES);
}

/**
 * The search layer returns candidate evidence. Only show the subset that the
 * answer actually relies on, rather than presenting a noisy retrieval tail.
 */
export function selectCitedSources<T>(citations: T[], sourceIndices: unknown): T[] {
  const selected = selectSourceIndices(citations.length, sourceIndices).map((index) => citations[index - 1]);

  return selected.length ? selected : citations.slice(0, Math.min(MAX_CITED_SOURCES, citations.length));
}

/** Keep answer labels aligned with the capped source cards the client receives. */
export function normalizeAssistantCitationLabels(answer: string, sourceCount: number): { answer: string; sourceIndices: number[] } {
  const mentioned = [...answer.matchAll(/\[S(\d{1,3})\]/gi)].map((match) => Number(match[1]));
  const sourceIndices = selectSourceIndices(sourceCount, mentioned);
  const visibleLabels = new Map(sourceIndices.map((sourceIndex, index) => [sourceIndex, index + 1]));
  const normalized = answer
    .replace(/\[([SR])(\d{1,3})\]/gi, (_label, kind: string, rawIndex: string) => {
      if (kind.toUpperCase() !== 'S') return '';
      const visibleIndex = visibleLabels.get(Number(rawIndex));
      return visibleIndex ? `[S${visibleIndex}]` : '';
    })
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { answer: normalized, sourceIndices };
}
