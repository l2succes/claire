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
  /** Deployment-known exact aliases, used for bridge identities such as WhatsApp LIDs. */
  configuredSelfGhostIds?: Partial<Record<Platform, string[]>>;
  resolveSelfGhostIds?: (
    platform: Platform,
    platformUserId: string
  ) => Promise<string[]>;
  /**
   * Resolve a remote bridge identity through the user's authenticated bridge
   * login. This is used for provider-owned identifiers (notably WhatsApp
   * LIDs) that are stable routing keys but are not suitable for display.
   */
  resolveContactIdentity?: (
    platform: Platform,
    platformContactId: string,
    platformUserId: string
  ) => Promise<ResolvedBridgeContactIdentity | null>;
}

export interface ResolvedBridgeContactIdentity {
  displayName?: string;
  phoneNumber?: string;
  username?: string;
  avatarUrl?: string;
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
  [Platform.INSTAGRAM]: 'metabot',
  [Platform.IMESSAGE]: 'imessagebot',
  [Platform.SLACK]: 'slackbot',
};

/**
 * Ghost user prefixes for each platform bridge
 */
export const GHOST_USER_PREFIXES: Record<Platform, string> = {
  [Platform.WHATSAPP]: 'whatsapp_',
  [Platform.TELEGRAM]: '_telegram_',
  [Platform.INSTAGRAM]: 'meta_',
  [Platform.IMESSAGE]: '_imessage_',
  [Platform.SLACK]: 'slack_',
};

/**
 * Bridge command prefixes for each platform
 */
export const BRIDGE_COMMAND_PREFIXES: Record<Platform, string> = {
  [Platform.WHATSAPP]: '!wa',
  [Platform.TELEGRAM]: '!tg',
  [Platform.INSTAGRAM]: '!ig',
  [Platform.IMESSAGE]: '!im',
  [Platform.SLACK]: '!slack',
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
  // Encrypted Matrix media stores its MXC URL under `file.url` rather than
  // top-level `url`. mautrix can surface either shape depending on the room.
  file?: {
    url?: string;
  };
  info?: {
    mimetype?: string;
    size?: number;
    w?: number;
    h?: number;
    duration?: number;
    thumbnail_url?: string;
  };
  'org.matrix.msc1767.audio'?: {
    duration?: number;
    waveform?: number[];
  };
  'org.matrix.msc3245.voice'?: Record<string, never>;
  geo_uri?: string;
  'm.relates_to'?: {
    'm.in_reply_to'?: {
      event_id: string;
    };
    // 'm.thread' on platforms with native threading (Slack, Discord). `event_id`
    // is then the thread root rather than a reply target.
    rel_type?: string;
    event_id?: string;
  };
  // Structured mentions. Bridges render the display form into `body` differently
  // per platform (WhatsApp writes the phone number, Telegram the handle), so this
  // is the only mention representation that generalizes.
  'm.mentions'?: {
    user_ids?: string[];
    room?: boolean;
  };
}

/**
 * Bridge authentication state
 */
export interface BridgeAuthState {
  platform: Platform;
  sessionId: string;
  controlRoomId: string;
  status: 'pending' | 'qr_generated' | 'pairing_code_generated' | 'code_sent' | 'authenticated' | 'failed';
  qrCodeUrl?: string;
  pairingCode?: string;
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
  [Platform.SLACK]: {
    platform: Platform.SLACK,
    command: 'login-token',
    requiresAdditionalInput: true,
    inputPrompt: 'Paste your Slack xoxc- and xoxd- tokens, separated by a space',
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
