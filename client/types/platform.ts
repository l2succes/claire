/**
 * Platform Types for Claire Unified Messenger
 *
 * Type definitions for multi-platform messaging support.
 * These types match the server-side adapter types.
 */

export enum Platform {
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  INSTAGRAM = 'instagram',
  IMESSAGE = 'imessage',
}

export enum PlatformStatus {
  INITIALIZING = 'initializing',
  AWAITING_AUTH = 'awaiting_auth',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
}

export enum AuthMethod {
  QR_CODE = 'qr_code',
  PHONE_CODE = 'phone_code',
  COOKIE = 'cookie',
}

export interface PlatformInfo {
  platform: Platform;
  enabled: boolean;
  authMethod: AuthMethod;
  capabilities: PlatformCapabilities;
}

export interface PlatformCapabilities {
  canSendText: boolean;
  canSendMedia: boolean;
  canSendVoice: boolean;
  canSendStickers: boolean;
  canSendReactions: boolean;
  canReadReceipts: boolean;
  canDeleteMessages: boolean;
  canEditMessages: boolean;
  supportsGroups: boolean;
  supportsBroadcasts: boolean;
}

export interface PlatformSession {
  id: string;
  platform: Platform;
  userId: string;
  status: PlatformStatus;
  authMethod: AuthMethod;
  platformUserId?: string;
  platformUsername?: string;
  phoneNumber?: string;
  createdAt: string;
  lastConnectedAt?: string;
  error?: string;
  authData?: AuthData;
}

export interface AuthData {
  method?: AuthMethod;
  qrCode?: string;
  phoneNumber?: string;
  instructions?: string;
  sessionId: string;
}

export interface AuthFlowState {
  platform: Platform;
  sessionId: string;
  step: 'initial' | 'awaiting_input' | 'verifying' | 'success' | 'error';
  authData?: AuthData;
  error?: string;
}

export interface ConnectPlatformResponse {
  success: boolean;
  session: {
    id: string;
    platform: Platform;
    status: PlatformStatus;
    authMethod: AuthMethod;
  };
  authData?: AuthData;
}

export interface PlatformStatusResponse {
  success: boolean;
  platform: Platform;
  sessions: PlatformSession[];
}

export interface DisconnectResponse {
  success: boolean;
  message: string;
}

// Platform display metadata
export const PLATFORM_DISPLAY: Record<Platform, {
  name: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  [Platform.WHATSAPP]: {
    name: 'WhatsApp',
    color: '#25D366',
    bgColor: '#dcfce7',
    description: 'Connect via QR code scan',
  },
  [Platform.TELEGRAM]: {
    name: 'Telegram',
    color: '#0088cc',
    bgColor: '#dbeafe',
    description: 'Connect via phone number',
  },
  [Platform.INSTAGRAM]: {
    name: 'Instagram',
    color: '#E4405F',
    bgColor: '#fce7f3',
    description: 'Connect via browser cookies',
  },
  [Platform.IMESSAGE]: {
    name: 'iMessage',
    color: '#007AFF',
    bgColor: '#dbeafe',
    description: 'Connect via Apple ID',
  },
};

// Helper to get auth method for a platform
export const getPlatformAuthMethod = (platform: Platform): AuthMethod => {
  switch (platform) {
    case Platform.WHATSAPP:
      return AuthMethod.QR_CODE;
    case Platform.TELEGRAM:
      return AuthMethod.PHONE_CODE;
    case Platform.INSTAGRAM:
      return AuthMethod.COOKIE;
    case Platform.IMESSAGE:
      return AuthMethod.QR_CODE; // or another method when implemented
    default:
      return AuthMethod.QR_CODE;
  }
};

// Helper to check if platform is available
export const isPlatformAvailable = (platform: Platform): boolean => {
  // iMessage requires macOS, so check platform
  if (platform === Platform.IMESSAGE) {
    return false; // Disabled until implemented
  }
  return true;
};
