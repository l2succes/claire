import { isPlayableAudio, normalizeMediaUrl, parseMediaCaption } from '../src/media';

const API = 'https://api.example.com';

describe('normalizeMediaUrl', () => {
  it('proxies an mxc URI', () => {
    expect(normalizeMediaUrl('mxc://synapse.example/abc123', API)).toBe(
      `${API}/media/synapse.example/abc123`,
    );
  });

  it('prefixes an already-proxied path', () => {
    expect(normalizeMediaUrl('/media/server/id', API)).toBe(`${API}/media/server/id`);
  });

  it('rewrites a raw Matrix download URL', () => {
    expect(
      normalizeMediaUrl('https://synapse.example/_matrix/media/v3/download/serv/xyz', API),
    ).toBe(`${API}/media/serv/xyz`);
  });

  it('rewrites a thumbnail URL and drops the query', () => {
    expect(
      normalizeMediaUrl('https://s.example/_matrix/client/v1/media/thumbnail/serv/xyz?width=64', API),
    ).toBe(`${API}/media/serv/xyz`);
  });

  it('tolerates a trailing slash on the base URL', () => {
    expect(normalizeMediaUrl('/media/a/b', 'https://api.example.com/')).toBe(`${API}/media/a/b`);
  });

  it('passes an ordinary URL through', () => {
    expect(normalizeMediaUrl('https://cdn.example/pic.jpg', API)).toBe('https://cdn.example/pic.jpg');
  });

  it.each([null, undefined, ''])('returns null for %s', (value) => {
    expect(normalizeMediaUrl(value as string | null | undefined, API)).toBeNull();
  });
});

describe('isPlayableAudio', () => {
  it.each([
    ['audio/mp4', true],
    ['audio/aac', true],
    ['audio/ogg', false],
    ['audio/ogg; codecs=opus', false],
    ['audio/OPUS', false],
    [undefined, false],
    [null, false],
  ])('%s -> %s', (mime, expected) => {
    expect(isPlayableAudio(mime as string | null | undefined)).toBe(expected);
  });
});

describe('parseMediaCaption', () => {
  it('turns an Instagram story share into a badge and hides the self-link', () => {
    const raw =
      '> Shared your story\n\n[https://www.instagram.com/stories/l2succes/396](https://www.instagram.com/stories/l2succes/396?reel_id=1)';
    expect(parseMediaCaption(raw)).toEqual({
      badge: 'Shared your story',
      text: undefined,
      hint: undefined,
    });
  });

  it('badges a forward while keeping the human text', () => {
    expect(parseMediaCaption('↷ Forwarded\n\n\nLos esperamos 🙏💕')).toMatchObject({
      badge: 'Forwarded',
      text: 'Los esperamos 🙏💕',
    });
  });

  it('keeps the reply text alongside the badge', () => {
    expect(parseMediaCaption("> Replied to @Luc's story\n\nthat looks amazing")).toMatchObject({
      badge: "Replied to @Luc's story",
      text: 'that looks amazing',
    });
  });

  it('hides a caption that is only a link', () => {
    expect(parseMediaCaption('[https://insta.gram/reel/x](https://insta.gram/reel/x?igsh=1)').text)
      .toBeUndefined();
  });

  it('keeps a bare link when dropSelfLinks is off, for plain text messages', () => {
    expect(parseMediaCaption('https://insta.gram/reel/x', { dropSelfLinks: false }).text).toBe(
      'https://insta.gram/reel/x',
    );
  });

  it('separates the bridge hint from the body', () => {
    const parsed = parseMediaCaption('Tap to see more\nUse the WhatsApp app to click buttons', {
      dropSelfLinks: false,
    });
    expect(parsed.text).toBe('Tap to see more');
    expect(parsed.hint).toBe('Use the WhatsApp app to click buttons');
  });

  it('strips an unresolved bridge placeholder', () => {
    expect(parseMediaCaption('Open <cta_url> now', { dropSelfLinks: false }).text).toBe('Open now');
  });

  it('renders a markdown link by its label, not its href', () => {
    expect(parseMediaCaption('see [the menu](https://x.example/menu)', { dropSelfLinks: false }).text)
      .toBe('see the menu');
  });

  it('leaves a plain caption untouched', () => {
    expect(parseMediaCaption('Just a normal caption').text).toBe('Just a normal caption');
  });

  it.each([null, undefined, ''])('returns an empty result for %s', (raw) => {
    expect(parseMediaCaption(raw as string | null | undefined)).toEqual({});
  });
});
