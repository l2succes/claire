/**
 * Platform Store
 *
 * Zustand store for managing multi-platform messaging connections.
 * Handles platform state, authentication flows, and session management.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { platformsApi, pollAuthStatus } from '../services/platforms';
import {
  Platform,
  PlatformStatus,
  PlatformInfo,
  PlatformSession,
  AuthData,
  AuthFlowState,
} from '../types/platform';

const STORAGE_KEY = '@claire_platform_sessions';

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
  fetchConnectedSessions: () => Promise<void>;
  connectPlatform: (platform: Platform, config?: Record<string, unknown>) => Promise<void>;
  disconnectPlatform: (platform: Platform, sessionId: string) => Promise<void>;
  reconnectPlatform: (platform: Platform, sessionId: string) => Promise<void>;
  submitVerificationCode: (code: string) => Promise<void>;
  setActivePlatformFilter: (filter: Platform | 'all') => void;
  clearAuthFlow: () => void;
  clearError: () => void;
  reset: () => void;
}

export const usePlatformStore = create<PlatformState>((set, get) => ({
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
   * Initialize the store - fetch platforms and restore sessions
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
            authMethod: 'qr_code' as const,
            capabilities: {
              canSendText: true,
              canSendMedia: true,
              canSendVoice: true,
              canSendStickers: true,
              canSendReactions: true,
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
            authMethod: 'phone_code' as const,
            capabilities: {
              canSendText: true,
              canSendMedia: true,
              canSendVoice: true,
              canSendStickers: true,
              canSendReactions: true,
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
            authMethod: 'cookie' as const,
            capabilities: {
              canSendText: true,
              canSendMedia: true,
              canSendVoice: false,
              canSendStickers: false,
              canSendReactions: true,
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

      // Persist to storage
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch (error) {
      console.error('Failed to fetch sessions:', error);

      // Try to restore from storage
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          set({ connectedSessions: JSON.parse(stored) });
        }
      } catch {
        // Ignore storage errors
      }
    }
  },

  /**
   * Connect to a platform (start auth flow)
   */
  connectPlatform: async (platform: Platform, config?: Record<string, unknown>) => {
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

      // Start polling for status updates
      const pollController = pollAuthStatus(
        platform,
        response.session.id,
        (session) => {
          const currentFlow = get().activeAuthFlow;
          if (!currentFlow || currentFlow.sessionId !== session.id) return;

          if (session.status === PlatformStatus.CONNECTED) {
            // Success! Update sessions and clear auth flow
            set((state) => ({
              connectedSessions: [...state.connectedSessions.filter(s => s.id !== session.id), session],
              activeAuthFlow: { ...currentFlow, step: 'success' },
              _pollController: null,
            }));

            // Persist updated sessions
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().connectedSessions));
          } else if (session.status === PlatformStatus.FAILED) {
            // Failed
            set({
              activeAuthFlow: {
                ...currentFlow,
                step: 'error',
                error: session.error || 'Authentication failed',
              },
              _pollController: null,
            });
          }
        }
      );

      set({ _pollController: pollController });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to connect',
        activeAuthFlow: null,
      });
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

      // Update storage
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().connectedSessions));
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

      // Update storage
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().connectedSessions));
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
        set((state) => ({
          connectedSessions: [...state.connectedSessions, response.session],
          activeAuthFlow: { ...authFlow, step: 'success' },
          isLoading: false,
        }));

        // Persist
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().connectedSessions));
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

    // Clear storage
    AsyncStorage.removeItem(STORAGE_KEY);
  },
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

export const useIsPlatformConnected = (platform: Platform): boolean => {
  const session = usePlatformSession(platform);
  return !!session;
};
