const TRAILING_PUNCTUATION = /[,.!?;:'"]/;
const URL_PATTERN = /https?:\/\/[^\s<>]+/gi;

export interface MessageLink {
  url: string;
  host: string;
  label: string;
}

function linkLabel(url: URL): string {
  const normalized = url.hostname.replace(/^www\./, '');
  if (normalized === 'maps.app.goo.gl' || normalized === 'maps.google.com' ||
    (normalized === 'google.com' && /^\/maps(?:\/|$)/.test(url.pathname))) return 'Google Maps';
  if (normalized === 'youtu.be' || normalized === 'youtube.com' || normalized.endsWith('.youtube.com')) return 'YouTube';
  return normalized;
}

function trimLinkPunctuation(match: string): string {
  // Closing brackets can belong to the URL (Wikipedia paths, for example).
  // Remove only surplus closers introduced by surrounding message punctuation.
  const opening: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const balance: Record<string, number> = { ')': 0, ']': 0, '}': 0 };
  for (const char of match) {
    if (opening[char]) balance[opening[char]] -= 1;
    else if (char in balance) balance[char] += 1;
  }
  let end = match.length;
  while (end > 0) {
    const char = match[end - 1];
    if (TRAILING_PUNCTUATION.test(char)) end -= 1;
    else if (balance[char] > 0) {
      balance[char] -= 1;
      end -= 1;
    } else break;
  }
  return match.slice(0, end);
}

export function extractMessageLinks(text: string): MessageLink[] {
  const seen = new Set<string>();
  return (text.match(URL_PATTERN) || []).flatMap((match) => {
    const url = trimLinkPunctuation(match);
    if (seen.has(url)) return [];
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];
      seen.add(url);
      return [{ url, host: parsed.hostname, label: linkLabel(parsed) }];
    } catch {
      return [];
    }
  });
}

