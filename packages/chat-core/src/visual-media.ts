import type { ChatMessage } from './types';
import { normalizeMediaUrl } from './media';

export interface VisualMedia {
  messageId: string;
  kind: 'image' | 'video';
  uri: string;
  thumbnailUri?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function visualMediaForMessage(message: ChatMessage, apiBaseUrl: string): VisualMedia | null {
  if (message.content_type !== 'image' && message.content_type !== 'video') return null;
  const uri = normalizeMediaUrl(message.media_url, apiBaseUrl);
  if (!uri) return null;
  const raw = message.metadata?.mediaInfo;
  const info = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    messageId: message.id,
    kind: message.content_type,
    uri,
    thumbnailUri: typeof info.thumbnail_url === 'string'
      ? normalizeMediaUrl(info.thumbnail_url, apiBaseUrl) || undefined : undefined,
    width: positive(info.w),
    height: positive(info.h),
    durationMs: positive(info.duration),
  };
}

/** Fit inside both bounds without cropping, including very tall attachments. */
export function fitMediaSize(width: number | undefined, height: number | undefined, maxWidth: number, maxHeight: number) {
  const aspect = positive(width) && positive(height) ? width! / height! : 4 / 3;
  const fittedWidth = Math.min(Math.max(1, maxWidth), Math.max(1, maxHeight) * aspect);
  return { width: fittedWidth, height: fittedWidth / aspect };
}
