/**
 * The inbox's platform filter chips are built from connectedSessions, which was
 * refetched from scratch on every launch -- so the chips appeared a beat after
 * the conversation list they belong to. Persisting them fixes the paint, but
 * only some of this state is safe to write to disk.
 */
import { PlatformStatus, type PlatformSession } from '../types/platform';
import { usePlatformStore } from '../stores/platformStore';

type Persisted = {
  availablePlatforms: unknown[];
  activePlatformFilter: unknown;
  connectedSessions: PlatformSession[];
};

const session = (over: Partial<PlatformSession>): PlatformSession => ({
  id: 'session-1',
  platform: 'whatsapp',
  status: PlatformStatus.CONNECTED,
  ...over,
} as PlatformSession);

function persistedState(): Persisted {
  const options = usePlatformStore.persist.getOptions();
  return options.partialize!(usePlatformStore.getState()) as Persisted;
}

describe('platform store persistence', () => {
  it('never writes live QR or pairing codes to disk', () => {
    usePlatformStore.setState({
      connectedSessions: [session({ authData: { qrCode: 'secret-qr', pairingCode: '123456' } } as never)],
    } as never);

    const stored = persistedState();
    expect(stored.connectedSessions).toHaveLength(1);
    expect(stored.connectedSessions[0]).not.toHaveProperty('authData');
    expect(JSON.stringify(stored)).not.toContain('secret-qr');
  });

  it('stores only connected sessions, so a dead auth flow is never offered on launch', () => {
    usePlatformStore.setState({
      connectedSessions: [
        session({ id: 'a', status: PlatformStatus.CONNECTED }),
        session({ id: 'b', platform: 'telegram', status: PlatformStatus.AWAITING_AUTH } as never),
        session({ id: 'c', platform: 'instagram', status: PlatformStatus.AUTHENTICATING } as never),
      ],
    } as never);

    expect(persistedState().connectedSessions.map((entry) => entry.id)).toEqual(['a']);
  });

  it('does not persist the initialized flag, so every launch still refetches', () => {
    usePlatformStore.setState({ isInitialized: true } as never);
    expect(persistedState()).not.toHaveProperty('isInitialized');
  });
});
