/**
 * Platform API Service
 *
 * Service layer for communicating with the server's platform management API.
 * Handles authentication, connection management, and messaging for all platforms.
 */

import axios, { AxiosError } from 'axios';
import { fetch as expoFetch } from 'expo/fetch';
import { supabase } from './supabase';
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

export interface OutgoingMediaUpload {
  uri: string;
  file?: File;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video' | 'voice';
  width?: number;
  height?: number;
  durationMs?: number;
}

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to all requests
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string; message?: string }>) => {
    const message = error.response?.data?.error
      || error.response?.data?.message
      || error.message
      || 'An unexpected error occurred';

    return Promise.reject(new Error(message));
  }
);

/**
 * Platform API methods
 */
export const platformsApi = {
  async getPlatformDefinitions(): Promise<PlatformDefinition[]> {
    const response = await api.get<{ success: boolean; platforms: PlatformDefinition[] }>('/platforms/definitions');
    return response.data.platforms;
  },

  async getPlatformInterests(): Promise<string[]> {
    const response = await api.get<{ success: boolean; platformIds: string[] }>('/platforms/interests');
    return response.data.platformIds;
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

  async sendMedia(
    platform: Platform,
    sessionId: string,
    chatId: string,
    media: OutgoingMediaUpload,
    content = '',
    replyToMessageId?: string
  ): Promise<{ success: boolean; message: { platformMessageId?: string; platformMetadata?: { mediaUrl?: string } } }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('You must be signed in to send media');

    const form = new FormData();
    form.append('sessionId', sessionId);
    form.append('chatId', chatId);
    form.append('mediaKind', media.kind);
    if (content.trim()) form.append('content', content.trim());
    if (replyToMessageId) form.append('replyToMessageId', replyToMessageId);
    if (media.width !== undefined) form.append('width', String(media.width));
    if (media.height !== undefined) form.append('height', String(media.height));
    if (media.durationMs !== undefined) form.append('durationMs', String(media.durationMs));
    if (media.file) {
      form.append('media', media.file, media.fileName);
    } else {
      form.append('media', {
        uri: media.uri,
        name: media.fileName,
        type: media.mimeType,
      } as unknown as Blob);
    }

    const response = await expoFetch(`${API_BASE_URL}/platforms/${encodeURIComponent(platform)}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: form,
    });
    const payload = await response.json() as { success?: boolean; message?: { platformMessageId?: string; platformMetadata?: { mediaUrl?: string } }; error?: string };
    if (!response.ok || !payload.success || !payload.message) {
      throw new Error(payload.error || `Media send failed (${response.status})`);
    }
    return { success: true, message: payload.message };
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
