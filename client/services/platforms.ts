/**
 * Platform API Service
 *
 * Service layer for communicating with the server's platform management API.
 * Handles authentication, connection management, and messaging for all platforms.
 */

import axios, { AxiosError } from 'axios';
import { supabase } from './supabase';
import {
  Platform,
  PlatformInfo,
  PlatformSession,
  AuthData,
  ConnectPlatformResponse,
  PlatformStatusResponse,
  DisconnectResponse,
} from '../types/platform';

const API_BASE_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3001';

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
        onUpdate({
          id: sessionId,
          platform,
          userId: '',
          status: 'failed' as const,
          authMethod: 'qr_code' as const,
          createdAt: new Date().toISOString(),
          error: 'Authentication timed out',
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
