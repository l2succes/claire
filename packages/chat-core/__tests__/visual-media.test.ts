import { fitMediaSize, visualMediaForMessage } from '../src/visual-media';
import type { ChatMessage } from '../src/types';

const message: ChatMessage = { id: 'photo', content: '', timestamp: '2026-09-24', from_me: false, content_type: 'image', media_url: 'mxc://matrix/abc' };
describe('visual media', () => {
  it('supports older cached messages without metadata', () => {
    expect(visualMediaForMessage(message, 'https://api.example')).toMatchObject({ kind: 'image', uri: 'https://api.example/media/matrix/abc', width: undefined });
  });
  it('reads bridge dimensions, duration and poster without trusting invalid values', () => {
    const media = visualMediaForMessage({ ...message, content_type: 'video', metadata: { mediaInfo: { w: -1, h: Infinity, duration: 5000, thumbnail_url: 'mxc://matrix/poster' } } }, 'https://api.example');
    expect(media).toMatchObject({ width: undefined, height: undefined, durationMs: 5000, thumbnailUri: 'https://api.example/media/matrix/poster' });
  });
  it('does not open text or missing attachments', () => {
    expect(visualMediaForMessage({ ...message, media_url: '' }, '')).toBeNull();
    expect(visualMediaForMessage({ ...message, content_type: 'text' }, '')).toBeNull();
  });
  it('fits portrait and landscape content without a surrounding strip', () => {
    expect(fitMediaSize(100, 200, 300, 420)).toEqual({ width: 210, height: 420 });
    expect(fitMediaSize(200, 100, 300, 420)).toEqual({ width: 300, height: 150 });
    expect(fitMediaSize(undefined, undefined, 300, 420)).toEqual({ width: 300, height: 225 });
  });
});
