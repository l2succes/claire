/**
 * Platform API Service
 *
 * Service layer for communicating with the server's platform management API.
 * Handles authentication, connection management, and messaging for all platforms.
 */

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { supabase } from './supabase';
import { clientSafeMessage } from './api-errors';
import {
  Platform,
  PlatformStatus,
  AuthMethod,
  PlatformInfo,
  PlatformSession,
  AuthData,
  ConnectPlatformResponse,
  PlatformStatusResponse,
  DisconnectResponse,
  InstagramLoginStep,
  InstagramLoginSubmission,
} from '../types/platform';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

export interface PlatformDefinition {
  id: string;
  name: string;
  mark: string;
  accent: string;
  iconUrl: string;
  supportStatus: 'available' | 'beta' | 'planned' | 'unavailable';
  setupSurface: 'phone' | 'desktop' | 'mac';
  setupLabel: string;
  runtimeLabel: string;
  authSummary: string;
  detail: string;
}

/** Used when the signed-in API predates GET /platforms/definitions. */
export const FALLBACK_PLATFORM_DEFINITIONS: PlatformDefinition[] = [
  { id: 'whatsapp', name: 'WhatsApp', mark: 'WA', accent: '#25D366', iconUrl: 'https://cdn.simpleicons.org/whatsapp/ffffff', supportStatus: 'available', setupSurface: 'phone', setupLabel: 'Pair from your phone', runtimeLabel: 'Cloud or self-hosted', authSummary: 'Scan a QR code or enter a pairing code from WhatsApp Linked Devices.', detail: 'After pairing, Claire keeps the bridge online.' },
  { id: 'telegram', name: 'Telegram', mark: 'TG', accent: '#229ED9', iconUrl: 'https://cdn.simpleicons.org/telegram/ffffff', supportStatus: 'available', setupSurface: 'phone', setupLabel: 'Approve from your phone', runtimeLabel: 'Cloud or self-hosted', authSummary: 'Approve a QR login or enter the code sent to Telegram.', detail: 'Once approved, the bridge runs independently of Claire Desktop.' },
  { id: 'instagram', name: 'Instagram', mark: 'IG', accent: '#D62976', iconUrl: 'https://cdn.simpleicons.org/instagram/ffffff', supportStatus: 'available', setupSurface: 'desktop', setupLabel: 'Claire Desktop setup', runtimeLabel: 'Desktop may close after setup', authSummary: 'Authorize Instagram in Claire Desktop.', detail: 'Sign in on the Mac companion. After handoff, the cloud bridge can keep syncing.' },
  { id: 'imessage', name: 'iMessage', mark: 'IM', accent: '#34C759', iconUrl: 'https://cdn.simpleicons.org/imessage/ffffff', supportStatus: 'beta', setupSurface: 'mac', setupLabel: 'Set up on a Mac', runtimeLabel: 'Mac must remain available', authSummary: 'Grant Claire Desktop access to Messages on a Mac.', detail: 'iMessage stays local to that Mac while Claire Desktop and Messages are running.' },
  { id: 'messenger', name: 'Messenger', mark: 'MS', accent: '#0866FF', iconUrl: 'https://cdn.simpleicons.org/messenger/ffffff', supportStatus: 'planned', setupSurface: 'desktop', setupLabel: 'Planned', runtimeLabel: 'Future cloud bridge', authSummary: 'Not available yet.', detail: 'Request access to help prioritize this bridge.' },
  { id: 'signal', name: 'Signal', mark: 'SI', accent: '#3A76F0', iconUrl: 'https://cdn.simpleicons.org/signal/ffffff', supportStatus: 'planned', setupSurface: 'phone', setupLabel: 'Planned', runtimeLabel: 'Future cloud bridge', authSummary: 'Not available yet.', detail: 'Request access to help prioritize this bridge.' },
  { id: 'discord', name: 'Discord', mark: 'DC', accent: '#5865F2', iconUrl: 'https://cdn.simpleicons.org/discord/ffffff', supportStatus: 'planned', setupSurface: 'phone', setupLabel: 'Planned', runtimeLabel: 'Future cloud bridge', authSummary: 'Not available yet.', detail: 'Request access to help prioritize this bridge.' },
  { id: 'slack', name: 'Slack', mark: 'SL', accent: '#611F69', iconUrl: 'https://api.iconify.design/logos/slack-icon.svg', supportStatus: 'planned', setupSurface: 'desktop', setupLabel: 'Planned', runtimeLabel: 'Future cloud bridge', authSummary: 'Not available yet.', detail: 'Request access to help prioritize this bridge.' },
];

function isMissingRoute(error: unknown) {
  return error instanceof Error && /route not found/i.test(error.message);
}

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

type RetriableRequest = InternalAxiosRequestConfig & {
  _claireAuthRefreshAttempted?: boolean;
};

let sessionRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!sessionRefresh) {
    sessionRefresh = supabase.auth
      .refreshSession()
      .then(({ data, error }) => {
        if (error || !data.session?.access_token) return null;
        return data.session.access_token;
      })
      .finally(() => {
        sessionRefresh = null;
      });
  }
  return sessionRefresh;
}

async function currentAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  // Refresh shortly before expiry instead of allowing the first authenticated
  // request after a backgrounded period to fail visibly.
  const expiresSoon = !session.expires_at || session.expires_at * 1000 <= Date.now() + 60_000;
  return expiresSoon ? (await refreshAccessToken()) || session.access_token : session.access_token;
}

// Add auth token to all requests
api.interceptors.request.use(async (config) => {
  const accessToken = await currentAccessToken();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});


// Handle response errors
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: string; message?: string }>) => {
    const request = error.config as RetriableRequest | undefined;
    if (error.response?.status === 401 && request && !request._claireAuthRefreshAttempted) {
      request._claireAuthRefreshAttempted = true;
      const accessToken = await refreshAccessToken();
      if (accessToken) {
        request.headers.Authorization = `Bearer ${accessToken}`;
        return api.request(request);
      }
    }

    return Promise.reject(new Error(clientSafeMessage(error)));
  }
);

/**
 * Platform API methods
 */
export const platformsApi = {
  async getPlatformDefinitions(): Promise<PlatformDefinition[]> {
    try {
      const response = await api.get<{ success: boolean; platforms: PlatformDefinition[] }>('/platforms/definitions');
      return response.data.platforms;
    } catch (error) {
      if (isMissingRoute(error)) return FALLBACK_PLATFORM_DEFINITIONS;
      throw error;
    }
  },

  async getPlatformInterests(): Promise<string[]> {
    try {
      const response = await api.get<{ success: boolean; platformIds: string[] }>('/platforms/interests');
      return response.data.platformIds;
    } catch (error) {
      if (isMissingRoute(error)) return [];
      throw error;
    }
  },

  async requestPlatformInterest(platformId: string): Promise<void> {
    await api.post(`/platforms/${encodeURIComponent(platformId)}/interest`, { source: 'mobile' });
  },
  /**
   * Get all available platforms and their status
   */
  async getAvailablePlatforms(): Promise<PlatformInfo[]> {
    const response = await api.get<{ success: boolean; platforms: PlatformInfo[] }>('/platforms');
    return response.data.platforms;
  },

  /**
   * Get connection status for a specific platform
   */
  async getPlatformStatus(platform: Platform): Promise<PlatformSession[]> {
    const response = await api.get<PlatformStatusResponse>(`/platforms/${platform}/status`);
    return response.data.sessions;
  },

  /**
   * Get all connected sessions across all platforms
   */
  async getAllSessions(): Promise<PlatformSession[]> {
    const platforms = Object.values(Platform);
    const sessionsPromises = platforms.map(async (platform) => {
      try {
        const sessions = await this.getPlatformStatus(platform);
        return sessions;
      } catch {
        return [];
      }
    });

    const allSessions = await Promise.all(sessionsPromises);
    const flat = allSessions.flat();
    // Deduplicate by session ID (in Matrix mode, all platforms share one adapter)
    const seen = new Set<string>();
    return flat.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  },

  /**
   * Connect to a platform (initiate authentication)
   */
  async connectPlatform(
    platform: Platform,
    config?: Record<string, unknown>
  ): Promise<ConnectPlatformResponse> {
    console.log('[platforms] connectPlatform called', platform, API_BASE_URL);
    const response = await api.post<ConnectPlatformResponse>(
      `/platforms/${platform}/connect`,
      config || {}
    );
    console.log('[platforms] connectPlatform response', response.status);
    return response.data;
  },

  /**
   * Get authentication data (QR code, instructions, etc.)
   */
  async getAuthData(platform: Platform, sessionId: string): Promise<AuthData> {
    const response = await api.get<{ success: boolean; authData: AuthData }>(
      `/platforms/${platform}/auth/${sessionId}`
    );
    return response.data.authData;
  },

  /**
   * Submit verification code (for Telegram phone verification)
   *
   * Server follow-up: Matrix mode does not yet expose POST /verify for
   * Telegram. Keep this client contract unchanged; E2E completion is mocked
   * explicitly until that bridge route ships.
   */
  async submitVerificationCode(
    platform: Platform,
    sessionId: string,
    code: string
  ): Promise<{ success: boolean; session: PlatformSession }> {
    const response = await api.post<{ success: boolean; session: PlatformSession }>(
      `/platforms/${platform}/verify`,
      { sessionId, code }
    );
    return response.data;
  },

  /**
   * Disconnect from a platform
   */
  async disconnectPlatform(platform: Platform, sessionId: string): Promise<DisconnectResponse> {
    const response = await api.delete<DisconnectResponse>(
      `/platforms/${platform}/disconnect`,
      { data: { sessionId } }
    );
    return response.data;
  },

  /**
   * Reconnect an existing session
   */
  async reconnectPlatform(
    platform: Platform,
    sessionId: string
  ): Promise<{ success: boolean; session: PlatformSession }> {
    const response = await api.post<{ success: boolean; session: PlatformSession }>(
      `/platforms/${platform}/reconnect`,
      { sessionId }
    );
    return response.data;
  },

  /**
   * Send a message via a platform
   */
  async sendMessage(
    platform: Platform,
    sessionId: string,
    chatId: string,
    content: string,
    replyToMessageId?: string
  ): Promise<{ success: boolean; message: unknown }> {
    const response = await api.post<{ success: boolean; message: unknown }>(
      `/platforms/${platform}/send`,
      { sessionId, chatId, content, replyToMessageId }
    );
    return response.data;
  },

  /** Add a native platform reaction through Claire's Matrix bridge. */
  async reactToMessage(
    platform: Platform,
    sessionId: string,
    chatId: string,
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean; reaction: unknown; alreadyReacted?: boolean }> {
    const response = await api.post<{ success: boolean; reaction: unknown; alreadyReacted?: boolean }>(
      `/platforms/${platform}/reactions`,
      { sessionId, chatId, messageId, emoji }
    );
    return response.data;
  },

  /**
   * Send a reviewed local recording as an audio stream. It is intentionally a
   * separate binary route so an encoded message body never lands in request
   * logs or competes with the JSON request-size limit.
   */
  async sendVoiceMessage(
    platform: Platform,
    sessionId: string,
    chatId: string,
    voice: { uri: string; mimeType: string; durationMs: number; waveform: number[] },
    replyToMessageId?: string
  ): Promise<{ success: boolean; message: unknown }> {
    const localFile = await fetch(voice.uri);
    if (!localFile.ok) throw new Error('The recorded voice note is no longer available. Record it again.');
    const audio = await localFile.blob();
    if (!audio.size) throw new Error('The recording was empty. Try again.');
    if (audio.size > 8 * 1024 * 1024) throw new Error('Voice notes must be 8 MB or smaller.');

    const response = await api.post<{ success: boolean; message: unknown }>(
      `/platforms/${platform}/voice`,
      audio,
      {
        params: {
          sessionId,
          chatId,
          replyToMessageId,
          // Keep the legacy parameter during a server-first rolling deploy.
          durationSeconds: voice.durationMs / 1000,
        },
        headers: {
          'Content-Type': voice.mimeType,
          'X-Claire-Audio-Duration-Ms': String(Math.max(0, Math.round(voice.durationMs))),
          'X-Claire-Audio-Waveform': voice.waveform.slice(0, 128).join(','),
        },
      }
    );
    return response.data;
  },

  /** Persist Claire's read cursor and mirror it to Matrix when possible. */
  async markChatRead(chatId: string, sessionId?: string): Promise<void> {
    await api.post(`/messages/chats/${encodeURIComponent(chatId)}/read`, { sessionId });
  },

  /**
   * Companion-only bridge helper. Mobile and web must direct people to Claire
   * Desktop rather than collecting an Instagram browser session themselves.
   */
  async instagramLoginStart(client: 'native' | 'web' = 'native'): Promise<InstagramLoginStep> {
    const response = await api.post<{
      success: boolean;
      sessionId: string;
      loginId: string;
      stepId: string;
      stepType?: InstagramLoginStep['stepType'];
      instructions?: string;
      loginUrl?: string;
      requiredCookies?: string[];
    }>(
      '/platforms/instagram/login/start',
      { client }
    );
    return {
      sessionId: response.data.sessionId,
      loginId: response.data.loginId,
      stepId: response.data.stepId,
      stepType: response.data.stepType,
      instructions: response.data.instructions,
      loginUrl: response.data.loginUrl,
      requiredCookies: response.data.requiredCookies,
    };
  },

  /**
   * Companion-only bridge helper for a securely captured desktop session.
   */
  async instagramLoginSubmit(
    sessionId: string,
    loginId: string,
    stepId: string,
    submission: InstagramLoginSubmission
  ): Promise<{ success: boolean; userLoginId?: string }> {
    const response = await api.post<{ success: boolean; userLoginId?: string }>(
      '/platforms/instagram/login/submit',
      { sessionId, loginId, stepId, ...submission }
    );
    return response.data;
  },

  /**
   * Get chats from a platform session
   */
  async getChats(
    platform: Platform,
    sessionId: string
  ): Promise<{ success: boolean; chats: unknown[] }> {
    const response = await api.get<{ success: boolean; chats: unknown[] }>(
      `/platforms/${platform}/chats/${sessionId}`
    );
    return response.data;
  },

  /**
   * Generate on-demand reply options for a given message. Guidance is kept
   * request-local so a user's instruction never changes later default drafts.
   */
  async generateDraftReply(
    messageId: string,
    content: string,
    chatType: 'individual' | 'group' = 'individual',
    options: { guidance?: string; forceRefresh?: boolean } = {}
  ): Promise<{ suggestions: string[]; confidence: number }> {
    const response = await api.post<{
      success: boolean;
      data: { suggestions: string[]; confidence: number };
    }>('/ai/responses/generate', { messageId, content, chatType, ...options });
    const suggestions = response.data?.data?.suggestions;
    if (!suggestions || suggestions.length === 0) {
      throw new Error('No suggestions returned');
    }
    return { suggestions, confidence: response.data.data.confidence };
  },

  /** Ask Claire to explain the latest message and relevant conversation context. */
  async explainConversation(
    messageId: string,
    content: string,
    chatType: 'individual' | 'group' = 'individual'
  ): Promise<{
    summary: string;
    latestMessageIntent: string;
    responseStrategy: string;
    suggestedNextStep: string;
    contextSignals: string[];
  }> {
    const response = await api.post<{
      success: boolean;
      data: {
        summary: string;
        latestMessageIntent: string;
        responseStrategy: string;
        suggestedNextStep: string;
        contextSignals: string[];
      };
    }>('/ai/conversations/explain', { messageId, content, chatType });
    return response.data.data;
  },
};

/**
 * Poll authentication status until connected or failed
 */
export const pollAuthStatus = (
  platform: Platform,
  sessionId: string,
  onUpdate: (session: PlatformSession) => void,
  intervalMs: number = 2000,
  timeoutMs: number = 300000 // 5 minutes
): { stop: () => void } => {
  let stopped = false;
  const startTime = Date.now();

  const poll = async () => {
    if (stopped) return;

    try {
      const sessions = await platformsApi.getPlatformStatus(platform);
      const session = sessions.find((s) => s.id === sessionId);

      if (session) {
        onUpdate(session);

        // Stop polling if connected or failed
        if (session.status === 'connected' || session.status === 'failed') {
          stopped = true;
          return;
        }
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        stopped = true;
        const isWhatsAppPairing = platform === Platform.WHATSAPP;
        onUpdate({
          id: sessionId,
          platform,
          userId: '',
          status: PlatformStatus.FAILED,
          authMethod: isWhatsAppPairing ? AuthMethod.PAIRING_CODE : AuthMethod.QR_CODE,
          createdAt: new Date().toISOString(),
          error: isWhatsAppPairing
            ? 'The WhatsApp pairing code expired or was not confirmed. Request a new code and enter it in WhatsApp within a few minutes.'
            : 'Authentication timed out',
        });
        return;
      }

      // Continue polling
      if (!stopped) {
        setTimeout(poll, intervalMs);
      }
    } catch (error) {
      console.error('Poll error:', error);
      if (!stopped) {
        setTimeout(poll, intervalMs);
      }
    }
  };

  // Start polling
  poll();

  return {
    stop: () => {
      stopped = true;
    },
  };
};

export default platformsApi;
