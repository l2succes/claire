import { describe, expect, it } from 'bun:test';
import { MatrixBridgeAdapter } from './index';
import { AuthMethod, MessageContentType, Platform, PlatformStatus } from '../types';

function adapterHarness() {
  const adapter = new MatrixBridgeAdapter({ homeserverUrl: 'http://matrix.test', serverName: 'test' });
  const events: Array<Record<string, unknown>> = [];
  const uploads: Array<{ data: Buffer; options: { type?: string } }> = [];
  const client = {
    uploadContent: async (data: Buffer, options: { type?: string }) => {
      uploads.push({ data, options });
      return { content_uri: 'mxc://test/uploaded' };
    },
    sendEvent: async (_roomId: string, _eventType: string, content: Record<string, unknown>) => {
      events.push(content);
      return { event_id: '$sent-media' };
    },
  };
  const internals = adapter as unknown as {
    matrixClient: typeof client;
    sessions: Map<string, Record<string, unknown>>;
    sessionPlatforms: Map<string, Platform>;
  };
  internals.matrixClient = client;
  internals.sessions.set('session-1', {
    id: 'session-1', platform: Platform.WHATSAPP, userId: 'user-1', status: PlatformStatus.CONNECTED,
    authMethod: AuthMethod.QR_CODE, createdAt: new Date(),
  });
  internals.sessionPlatforms.set('session-1', Platform.WHATSAPP);
  return { adapter, events, uploads };
}

describe('Matrix outbound media', () => {
  it('uploads and emits captioned video metadata', async () => {
    const { adapter, events, uploads } = adapterHarness();
    const message = await adapter.sendMessage('session-1', '!room:test', {
      content: 'Launch walkthrough',
      contentType: MessageContentType.VIDEO,
      media: [{
        type: MessageContentType.VIDEO,
        data: Buffer.from('video'),
        mimeType: 'video/mp4',
        fileName: 'launch.mp4',
        fileSize: 5,
        width: 1280,
        height: 720,
        durationMs: 18_000,
      }],
    });

    expect(uploads[0].options.type).toBe('video/mp4');
    expect(events[0]).toMatchObject({
      msgtype: 'm.video', body: 'Launch walkthrough', filename: 'launch.mp4', url: 'mxc://test/uploaded',
      info: { mimetype: 'video/mp4', size: 5, w: 1280, h: 720, duration: 18_000 },
      format: 'org.matrix.custom.html', formatted_body: 'Launch walkthrough',
    });
    expect(message.platformMessageId).toBe('$sent-media');
    expect(message.platformMetadata?.mediaUrl).toBe('mxc://test/uploaded');
  });

  it('marks a recording as a native Matrix voice message', async () => {
    const { adapter, events } = adapterHarness();
    await adapter.sendMessage('session-1', '!room:test', {
      content: '',
      contentType: MessageContentType.VOICE,
      media: [{
        type: MessageContentType.VOICE,
        data: Buffer.from('voice'),
        mimeType: 'audio/mp4',
        fileName: 'voice.m4a',
        fileSize: 5,
        durationMs: 9_000,
        isVoice: true,
      }],
    });

    expect(events[0]).toMatchObject({
      msgtype: 'm.audio', body: 'voice.m4a', filename: 'voice.m4a',
      'org.matrix.msc3245.voice': {},
      info: { mimetype: 'audio/mp4', size: 5, duration: 9_000 },
    });
  });
});
