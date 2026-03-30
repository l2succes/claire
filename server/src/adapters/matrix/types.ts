/**
 * Matrix Bridge Adapter Types
 *
 * Types specific to the Matrix bridge integration.
 * These complement the platform-agnostic types in ../types.ts
 */

import { Platform } from '../types';

/**
 * Configuration for Matrix homeserver connection
 */
export interface MatrixConfig {
  homeserverUrl: string;
  serverName: string;
  adminAccessToken?: string;
  botUserId?: string;
}

/**
 * Matrix room information with platform mapping
 */
export interface MatrixRoomMapping {
  matrixRoomId: string;
  platform: Platform;
  platformChatId: string;
  sessionId: string;
  isControlRoom: boolean;
  createdAt: Date;
}

/**
 * Bridge bot identifiers for each platform
 */
export const BRIDGE_BOT_LOCALPARTS: Record<Platform, string> = {
  [Platform.WHATSAPP]: 'whatsappbot',
  [Platform.TELEGRAM]: 'telegrambot',
  [Platform.INSTAGRAM]: 'instagrambot',
  [Platform.IMESSAGE]: 'imessagebot',
};

/**
 * Ghost user prefixes for each platform bridge
 */
export const GHOST_USER_PREFIXES: Record<Platform, string> = {
  [Platform.WHATSAPP]: 'whatsapp_',
  [Platform.TELEGRAM]: '_telegram_',
  [Platform.INSTAGRAM]: 'meta_',
  [Platform.IMESSAGE]: '_imessage_',
};

/**
 * Bridge command prefixes for each platform
 */
export const BRIDGE_COMMAND_PREFIXES: Record<Platform, string> = {
  [Platform.WHATSAPP]: '!wa',
  [Platform.TELEGRAM]: '!tg',
  [Platform.INSTAGRAM]: '!ig',
  [Platform.IMESSAGE]: '!im',
};

/**
 * Matrix message types we handle
 */
export type MatrixMessageType =
  | 'm.text'
  | 'm.image'
  | 'm.video'
  | 'm.audio'
  | 'm.file'
  | 'm.location'
  | 'm.notice'
  | 'm.emote';

/**
 * Matrix room event content for m.room.message
 */
export interface MatrixMessageContent {
  msgtype: MatrixMessageType;
  body: string;
  format?: string;
  formatted_body?: string;
  url?: string;
  info?: {
    mimetype?: string;
    size?: number;
    w?: number;
    h?: number;
    duration?: number;
    thumbnail_url?: string;
  };
  geo_uri?: string;
  'm.relates_to'?: {
    'm.in_reply_to'?: {
      event_id: string;
    };
    rel_type?: string;
    event_id?: string;
  };
}

/**
 * Bridge authentication state
 */
export interface BridgeAuthState {
  platform: Platform;
  sessionId: string;
  controlRoomId: string;
  status: 'pending' | 'qr_generated' | 'code_sent' | 'authenticated' | 'failed';
  qrCodeUrl?: string;
  errorMessage?: string;
  lastUpdated: Date;
}

/**
 * Bridge login commands by platform
 */
export interface BridgeLoginCommand {
  platform: Platform;
  command: string;
  requiresAdditionalInput: boolean;
  inputPrompt?: string;
}

export const BRIDGE_LOGIN_COMMANDS: Record<Platform, BridgeLoginCommand> = {
  [Platform.WHATSAPP]: {
    platform: Platform.WHATSAPP,
    command: 'login',
    requiresAdditionalInput: false,
  },
  [Platform.TELEGRAM]: {
    platform: Platform.TELEGRAM,
    command: 'login',
    requiresAdditionalInput: true,
    inputPrompt: 'Enter your phone number (with country code)',
  },
  [Platform.INSTAGRAM]: {
    platform: Platform.INSTAGRAM,
    command: 'login-cookie',
    requiresAdditionalInput: true,
    inputPrompt: 'Paste your Instagram cookies from browser',
  },
  [Platform.IMESSAGE]: {
    platform: Platform.IMESSAGE,
    command: '', // iMessage doesn't use command-based login
    requiresAdditionalInput: false,
  },
};

/**
 * Patterns for detecting bridge bot responses
 */
export const BRIDGE_RESPONSE_PATTERNS = {
  QR_CODE: /scan.*qr|qr.*code/i,
  LOGIN_SUCCESS: /successfully logged in|logged in as/i,
  LOGIN_FAILURE: /login failed|error|failed to/i,
  VERIFICATION_CODE: /verification code|enter.*code|code sent/i,
  CHECKPOINT: /checkpoint|verify.*identity|suspicious/i,
};

/**
 * Matrix sync filter for efficient event retrieval
 */
export const MATRIX_SYNC_FILTER = {
  room: {
    timeline: {
      limit: 50,
      types: ['m.room.message', 'm.room.member'],
    },
    state: {
      types: ['m.room.name', 'm.room.member', 'm.room.avatar'],
    },
  },
  presence: {
    types: [], // Don't sync presence to reduce bandwidth
  },
};
