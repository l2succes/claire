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
