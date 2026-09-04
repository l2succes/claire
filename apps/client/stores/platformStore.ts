/**
 * Platform Store
 *
 * Zustand store for managing multi-platform messaging connections.
 * Handles platform state, authentication flows, and session management.
 */

import { create, type StoreApi } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { platformsApi, pollAuthStatus } from '../services/platforms';
import {
  Platform,
  PlatformStatus,
  AuthMethod,
  PlatformInfo,
  PlatformSession,
  AuthFlowState,
} from '../types/platform';

interface PlatformState {
  // State
  availablePlatforms: PlatformInfo[];
  connectedSessions: PlatformSession[];
  activePlatformFilter: Platform | 'all';
  activeAuthFlow: AuthFlowState | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Polling control
  _pollController: { stop: () => void } | null;

  // Actions
  initialize: () => Promise<void>;
  fetchAvailablePlatforms: () => Promise<void>;
  fetchConnectedSessions: () => Promise<PlatformSession[]>;
  connectPlatform: (platform: Platform, config?: Record<string, unknown>) => Promise<void>;
  resumeAuthFlow: (platform: Platform) => Promise<boolean>;
  refreshAuthFlow: () => Promise<PlatformSession | undefined>;
  disconnectPlatform: (platform: Platform, sessionId: string) => Promise<void>;
  reconnectPlatform: (platform: Platform, sessionId: string) => Promise<void>;
  submitVerificationCode: (code: string) => Promise<void>;
  setActivePlatformFilter: (filter: Platform | 'all') => void;
  clearAuthFlow: () => void;
  clearError: () => void;
  reset: () => void;
}

type SetPlatformState = StoreApi<PlatformState>['setState'];
type GetPlatformState = StoreApi<PlatformState>['getState'];

const PENDING_AUTH_STATUSES = new Set<PlatformStatus>([
  PlatformStatus.INITIALIZING,
  PlatformStatus.AWAITING_AUTH,
  PlatformStatus.AUTHENTICATING,
  PlatformStatus.RECONNECTING,
]);

export function isPendingPlatformStatus(status: PlatformStatus): boolean {
  return PENDING_AUTH_STATUSES.has(status);
}

function upsertSession(sessions: PlatformSession[], session: PlatformSession) {
  return [...sessions.filter((candidate) => candidate.id !== session.id), session];
}

function applyAuthSessionUpdate(
  set: SetPlatformState,
  get: GetPlatformState,
  session: PlatformSession,
) {
  const currentFlow = get().activeAuthFlow;
  if (!currentFlow || currentFlow.sessionId !== session.id) {
    set((state) => ({ connectedSessions: upsertSession(state.connectedSessions, session) }));
    return;
  }

  if (session.status === PlatformStatus.CONNECTED) {
    set((state) => ({
      connectedSessions: upsertSession(state.connectedSessions, session),
      activeAuthFlow: { ...currentFlow, step: 'success' },
      _pollController: null,
      error: null,
    }));
    return;
  }

  if (session.status === PlatformStatus.FAILED) {
    set((state) => ({
      connectedSessions: upsertSession(state.connectedSessions, session),
      activeAuthFlow: {
        ...currentFlow,
        step: 'error',
        error: session.error || 'Authentication failed',
      },
      _pollController: null,
    }));
    return;
  }

  set((state) => ({
    connectedSessions: upsertSession(state.connectedSessions, session),
    activeAuthFlow: {
      ...currentFlow,
      step: 'awaiting_input',
      authData: session.authData || currentFlow.authData,
    },
  }));
}

function startAuthPolling(
  set: SetPlatformState,
  get: GetPlatformState,
  platform: Platform,
  sessionId: string,
) {
  get()._pollController?.stop();
  const controller = pollAuthStatus(
    platform,
    sessionId,
    (session) => applyAuthSessionUpdate(set, get, session),
    2000,
    platform === Platform.WHATSAPP ? 240000 : 300000,
  );
  set({ _pollController: controller });
}

export const usePlatformStore = create<PlatformState>()(persist((set, get) => ({
  // Initial state
  availablePlatforms: [],
  connectedSessions: [],
  activePlatformFilter: 'all',
  activeAuthFlow: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  _pollController: null,

  /**
   * Initialize the store from the server-authoritative platform state.
   */
  initialize: async () => {
    if (get().isInitialized) return;

    set({ isLoading: true, error: null });

    try {
      // Fetch available platforms from server
      await get().fetchAvailablePlatforms();

      // Fetch current session status
      await get().fetchConnectedSessions();

      set({ isInitialized: true, isLoading: false });
    } catch (error) {
      console.error('Platform store initialization error:', error);
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to initialize',
      });
    }
  },

  /**
   * Fetch available platforms from server
   */
  fetchAvailablePlatforms: async () => {
    try {
      const platforms = await platformsApi.getAvailablePlatforms();
      set({ availablePlatforms: platforms });
    } catch (error) {
      console.error('Failed to fetch platforms:', error);
      // Don't throw - use defaults if server unavailable
      set({
        availablePlatforms: [
          {
            platform: Platform.WHATSAPP,
            enabled: true,
            authMethod: AuthMethod.QR_CODE,
            capabilities: {
              canSendText: true,
              canSendMedia: true,
              canSendVoice: true,
              canSendStickers: true,
              canSendReactions: true,
              canReplyToMessages: true,
              canReadReceipts: true,
              canDeleteMessages: true,
              canEditMessages: false,
              supportsGroups: true,
              supportsBroadcasts: true,
            },
          },
          {
            platform: Platform.TELEGRAM,
            enabled: true,
            authMethod: AuthMethod.PHONE_CODE,
            capabilities: {
              canSendText: true,
              canSendMedia: true,
              canSendVoice: true,
              canSendStickers: true,
              canSendReactions: true,
              canReplyToMessages: true,
              canReadReceipts: true,
              canDeleteMessages: true,
              canEditMessages: true,
              supportsGroups: true,
              supportsBroadcasts: true,
            },
          },
          {
            platform: Platform.INSTAGRAM,
            enabled: true,
            authMethod: AuthMethod.COOKIE,
            capabilities: {
              canSendText: true,
              canSendMedia: true,
              canSendVoice: false,
              canSendStickers: false,
              canSendReactions: true,
              canReplyToMessages: false,
              canReadReceipts: true,
              canDeleteMessages: false,
              canEditMessages: false,
              supportsGroups: true,
              supportsBroadcasts: false,
            },
          },
        ],
      });
    }
  },

  /**
   * Fetch all connected sessions
   */
  fetchConnectedSessions: async () => {
    try {
      const sessions = await platformsApi.getAllSessions();
      set({ connectedSessions: sessions });

      return sessions;
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      // Never present a cached connection as authoritative. A stale badge can
      // reopen an invalid auth flow or hide a disconnected bridge.
      set({ connectedSessions: [] });
      return [];
    }
  },

  /**
   * Connect to a platform (start auth flow)
   */
  connectPlatform: async (platform: Platform, config?: Record<string, unknown>) => {
    // Refresh before creating a login flow. The server repeats this guard so a
    // second device or a stale cache cannot create duplicate bridge sessions.
    const sessions = await get().fetchConnectedSessions();
    if (sessions.some((session) => (
      session.platform === platform && session.status === PlatformStatus.CONNECTED
    ))) {
      set({ error: `${platform} is already connected` });
      return;
    }

    // Stop any existing poll
    const currentPoll = get()._pollController;
    if (currentPoll) {
      currentPoll.stop();
    }

    set({
      isLoading: true,
      error: null,
      activeAuthFlow: {
        platform,
        sessionId: '',
        step: 'initial',
      },
    });

    try {
      const response = await platformsApi.connectPlatform(platform, config);

      const authFlow: AuthFlowState = {
        platform,
        sessionId: response.session.id,
        step: 'awaiting_input',
        authData: response.authData,
      };

      set({
        isLoading: false,
        activeAuthFlow: authFlow,
      });

      startAuthPolling(set, get, platform, response.session.id);
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to connect',
        activeAuthFlow: null,
      });
    }
  },

  /**
   * Resume a server-authoritative pending login instead of creating another
   * bridge session when a person returns from WhatsApp/Telegram or navigates
   * back into setup.
   */
  resumeAuthFlow: async (platform: Platform) => {
    set({ isLoading: true, error: null });
    try {
      const sessions = (await platformsApi.getPlatformStatus(platform))
        .filter((session) => session.platform === platform);
      set((state) => ({
        connectedSessions: [
          ...state.connectedSessions.filter((session) => session.platform !== platform),
          ...sessions,
        ],
      }));

      const connected = sessions.find((session) => session.status === PlatformStatus.CONNECTED);
      if (connected) {
        get()._pollController?.stop();
        set({
          isLoading: false,
          _pollController: null,
          activeAuthFlow: {
            platform,
            sessionId: connected.id,
            step: 'success',
            authData: connected.authData,
          },
        });
        return true;
      }

      const pending = sessions
        .filter((session) => PENDING_AUTH_STATUSES.has(session.status))
        .sort((left, right) => {
          if (!!left.authData?.pairingCode !== !!right.authData?.pairingCode) {
            return left.authData?.pairingCode ? -1 : 1;
          }
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        })[0];

      if (!pending) {
        set({ isLoading: false });
        return false;
      }

      let authData = pending.authData;
      if (!authData) {
        try {
          authData = await platformsApi.getAuthData(platform, pending.id);
        } catch {
          // Status still proves the session is resumable. Polling can populate
          // auth data shortly, so do not turn a temporary auth-data miss into
          // a second login attempt.
        }
      }

      set({
        isLoading: false,
        activeAuthFlow: {
          platform,
          sessionId: pending.id,
          step: 'awaiting_input',
          authData: authData ? { ...authData, sessionId: pending.id } : undefined,
        },
      });
      startAuthPolling(set, get, platform, pending.id);
      return true;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Could not resume setup',
      });
      return false;
    }
  },

  /** Reconcile the active login immediately after an app handoff or manual check. */
  refreshAuthFlow: async () => {
    const flow = get().activeAuthFlow;
    if (!flow?.sessionId) return undefined;
    try {
      const sessions = await platformsApi.getPlatformStatus(flow.platform);
      const session = sessions.find((candidate) => candidate.id === flow.sessionId);
      if (session) applyAuthSessionUpdate(set, get, session);
      return session;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Could not check connection' });
      return undefined;
    }
  },

  /**
   * Disconnect from a platform
   */
  disconnectPlatform: async (platform: Platform, sessionId: string) => {
    set({ isLoading: true, error: null });

    try {
      await platformsApi.disconnectPlatform(platform, sessionId);

      set((state) => ({
        connectedSessions: state.connectedSessions.filter((s) => s.id !== sessionId),
        isLoading: false,
      }));

    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to disconnect',
      });
    }
  },

  /**
   * Reconnect an existing session
   */
  reconnectPlatform: async (platform: Platform, sessionId: string) => {
    set({ isLoading: true, error: null });

    try {
      const response = await platformsApi.reconnectPlatform(platform, sessionId);

      set((state) => ({
        connectedSessions: state.connectedSessions.map((s) =>
          s.id === sessionId ? response.session : s
        ),
        isLoading: false,
      }));

    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to reconnect',
      });
    }
  },

  /**
   * Submit verification code (for phone-based auth like Telegram)
   */
  submitVerificationCode: async (code: string) => {
    const authFlow = get().activeAuthFlow;
    if (!authFlow) {
      set({ error: 'No active authentication flow' });
      return;
    }

    set({
      isLoading: true,
      activeAuthFlow: { ...authFlow, step: 'verifying' },
    });

    try {
      const response = await platformsApi.submitVerificationCode(
        authFlow.platform,
        authFlow.sessionId,
        code
      );

      if (response.session.status === PlatformStatus.CONNECTED) {
        get()._pollController?.stop();
        set((state) => ({
          connectedSessions: upsertSession(state.connectedSessions, response.session),
          activeAuthFlow: { ...authFlow, step: 'success' },
          isLoading: false,
          _pollController: null,
          error: null,
        }));

      } else {
        set({
          isLoading: false,
          activeAuthFlow: {
            ...authFlow,
            step: 'error',
            error: 'Verification failed',
          },
        });
      }
    } catch (error) {
      set({
        isLoading: false,
        activeAuthFlow: {
          ...authFlow,
          step: 'error',
          error: error instanceof Error ? error.message : 'Verification failed',
        },
      });
    }
  },

  /**
   * Set active platform filter for inbox
   */
  setActivePlatformFilter: (filter: Platform | 'all') => {
    set({ activePlatformFilter: filter });
  },

  /**
   * Clear the current auth flow
   */
  clearAuthFlow: () => {
    const pollController = get()._pollController;
    if (pollController) {
      pollController.stop();
    }
    set({ activeAuthFlow: null, _pollController: null });
  },

  /**
   * Clear error state
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * Reset store (on logout)
   */
  reset: () => {
    const pollController = get()._pollController;
    if (pollController) {
      pollController.stop();
    }

    set({
      availablePlatforms: [],
      connectedSessions: [],
      activePlatformFilter: 'all',
      activeAuthFlow: null,
      isLoading: false,
      isInitialized: false,
      error: null,
      _pollController: null,
    });

    void usePlatformStore.persist.clearStorage();
  },
}), {
  name: 'claire.platforms',
  storage: createJSONStorage(() => AsyncStorage),
  version: 1,
  /**
   * Connection metadata only, and never anything secret.
   *
   * The inbox's platform filter chips are built from connectedSessions, so
   * without this they are absent on every cold start until the network answers
   * and the row of filters appears a beat after the list it belongs to.
   *
   * Three exclusions are deliberate. `authData` carries live QR and pairing
   * codes -- transient auth secrets that must never reach disk. Only connected
   * sessions are stored, because a stale "awaiting_auth" chip on launch would
   * offer to resume an auth flow that died with the last process. And
   * `isInitialized` is left out so the store still refetches on every launch:
   * what is persisted is a hint for the first frame, not an authority on what
   * is actually connected.
   */
  partialize: (state) => ({
    availablePlatforms: state.availablePlatforms,
    activePlatformFilter: state.activePlatformFilter,
    connectedSessions: state.connectedSessions
      .filter((session) => session.status === PlatformStatus.CONNECTED)
      .map(({ authData, error, ...session }) => session),
  }),
}));

// Selector hooks for common queries
export const useConnectedPlatforms = (): Platform[] => {
  const sessions = usePlatformStore((state) => state.connectedSessions);
  return [...new Set(sessions.filter(s => s.status === PlatformStatus.CONNECTED).map(s => s.platform))];
};

export const useHasAnyConnection = (): boolean => {
  const sessions = usePlatformStore((state) => state.connectedSessions);
  return sessions.some(s => s.status === PlatformStatus.CONNECTED);
};

export const usePlatformSession = (platform: Platform): PlatformSession | undefined => {
  const sessions = usePlatformStore((state) => state.connectedSessions);
  return sessions.find(s => s.platform === platform && s.status === PlatformStatus.CONNECTED);
};

export const usePendingPlatformSession = (platform: Platform): PlatformSession | undefined => {
  const sessions = usePlatformStore((state) => state.connectedSessions);
  return sessions.find((session) => session.platform === platform && isPendingPlatformStatus(session.status));
};

export const useIsPlatformConnected = (platform: Platform): boolean => {
  const session = usePlatformSession(platform);
  return !!session;
};
