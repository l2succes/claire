/**
 * Resolve whatever the bridge stored on a message into a URL a client can load.
 *
 * Media lives behind the server's `/media/:server/:mediaId` proxy. The stored
 * value can be an `mxc://` URI, an already-proxied `/media/...` path, a raw
 * Matrix download/thumbnail URL, or an ordinary link — this collapses all of
 * them. The base URL is a parameter rather than an import so both clients can
 * share it: mobile passes `API_BASE_URL`, desktop passes its `apiBaseUrl`.
 */
export function normalizeMediaUrl(value: string | null | undefined, apiBaseUrl: string): string | null {
  if (!value) return null;
  const base = apiBaseUrl.replace(/\/$/, '');
  if (value.startsWith('/media/')) return `${base}${value}`;
  const mxc =
    value.match(/^mxc:\/\/([^/]+)\/(.+)$/) ||
    value.match(/\/_matrix\/(?:client\/v1\/media|media\/v3)\/(?:thumbnail|download)\/([^/]+)\/([^?]+)/);
  if (mxc) return `${base}/media/${encodeURIComponent(mxc[1])}/${encodeURIComponent(mxc[2])}`;
  return value;
}

/**
 * iOS and macOS have no Ogg/Opus decoder, and that is what the bridges deliver
 * for voice notes today. Detecting it lets the UI offer an honest state instead
 * of a play button that fails on every tap. Playback becomes possible once the
 * media proxy transcodes to AAC.
 */
export function isPlayableAudio(mime?: string | null): boolean {
  if (!mime) return false;
  return /^audio\//i.test(mime);
}

/** Resolve an audio source and request the iOS-compatible derivative for Ogg/Opus Matrix media. */
export function normalizeAudioPlaybackUrl(
  value: string | null | undefined,
  mime: string | null | undefined,
  apiBaseUrl: string,
): string | null {
  const normalized = normalizeMediaUrl(value, apiBaseUrl);
  if (!normalized || !/ogg|opus/i.test(mime || '')) return normalized;
  const mediaBase = `${apiBaseUrl.replace(/\/$/, '')}/media/`;
  if (!normalized.startsWith(mediaBase)) return normalized;
  return `${normalized}${normalized.includes('?') ? '&' : '?'}format=m4a`;
}

const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)]*)\)/g;
const BARE_URL = /https?:\/\/\S+/g;
// The bridge substitutes a token when it cannot resolve an interactive button's
// target, e.g. "<cta_url>". Rendering it verbatim shows a broken variable name.
const UNRESOLVED_PLACEHOLDER = /<[a-z_]+>/gi;
// Trailing instruction the bridge appends when a message has affordances it
// cannot carry ("Use the WhatsApp app to click buttons"). It is guidance about
// the message rather than part of it, so it is returned separately.
const NATIVE_APP_HINT = /\buse the \w+ app\b/i;

export interface MediaCaption {
  /** Short label from a bridge marker line, rendered as a badge. */
  badge?: string;
  /** The human-written remainder of the caption. */
  text?: string;
  /** Bridge guidance about the message, styled apart from the body. */
  hint?: string;
}

/**
 * Split a bridged caption into a badge, the human text, and any bridge hint.
 *
 * Bridged media arrives with a caption that is mostly metadata. An Instagram
 * story share looks like:
 *
 *     > Shared your story
 *
 *     [https://instagram.com/stories/x/123](https://instagram.com/stories/x/123?…)
 *
 * The blockquote is a label and the link points at the very media rendered
 * above it, so printing the caption raw gives a wall of URL and no meaning.
 *
 * `dropSelfLinks` defaults to true, which suits media. Pass false for plain
 * text messages: there the link is not redundant with an attachment — a message
 * that is only a URL is the whole message.
 */
export function parseMediaCaption(
  raw?: string | null,
  options: { dropSelfLinks?: boolean } = {},
): MediaCaption {
  if (!raw) return {};
  const dropSelfLinks = options.dropSelfLinks ?? true;
  const lines = raw.split('\n');
  let badge: string | undefined;
  let hint: string | undefined;
  const kept: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(UNRESOLVED_PLACEHOLDER, ' ');
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!hint && NATIVE_APP_HINT.test(trimmed)) {
      hint = trimmed;
      continue;
    }
    // Bridges prefix a label line describing what the media is: a blockquote for
    // Instagram story activity ("Shared your story", "Replied to …", "Reacted
    // to …", "Mentioned you …") and "↷" for a forward.
    if (!badge && (trimmed.startsWith('>') || trimmed.startsWith('↷'))) {
      const label = trimmed.replace(/^[>↷]+\s*/, '').trim();
      if (label) {
        badge = label;
        continue;
      }
    }
    if (dropSelfLinks) {
      const withoutLinks = trimmed.replace(MARKDOWN_LINK, '').replace(BARE_URL, '').trim();
      if (!withoutLinks) continue;
    }
    // Keep the human words, but render a markdown link by its label rather than
    // dumping the href.
    kept.push(
      trimmed
        .replace(MARKDOWN_LINK, (_match, label: string, href: string) => {
          const text = label.trim();
          return !text || /^https?:\/\//i.test(text) ? '' : text || href;
        })
        .replace(/\s+/g, ' ')
        .trim(),
    );
  }

  const text = kept.filter(Boolean).join('\n').trim();
  return { badge, text: text || undefined, hint };
}
