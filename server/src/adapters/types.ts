/**
 * Multi-Platform Messaging Adapter Types
 *
 * Defines unified interfaces for WhatsApp, Telegram, iMessage, and Instagram
 * to enable platform-agnostic message handling in the Claire AI assistant.
 */

/**
 * Supported messaging platforms
 */
export enum Platform {
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
  IMESSAGE = 'imessage',
  INSTAGRAM = 'instagram',
}

/**
 * Platform connection/session status
 */
export enum PlatformStatus {
  INITIALIZING = 'initializing',
  AWAITING_AUTH = 'awaiting_auth',
  AUTHENTICATING = 'authenticating',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

/**
 * Authentication method for each platform
 */
export enum AuthMethod {
  QR_CODE = 'qr_code',
  BOT_TOKEN = 'bot_token',
  LOCAL_DATABASE = 'local_db',
  USERNAME_PASSWORD = 'credentials',
}

/**
 * Message content types
 */
export enum MessageContentType {
  TEXT = 'text',
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  VOICE = 'voice',
  DOCUMENT = 'document',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACT = 'contact',
  POLL = 'poll',
  STORY_REPLY = 'story_reply',
  REACTION = 'reaction',
  SYSTEM = 'system',
}

/**
 * Unified message format across all platforms
 */
export interface UnifiedMessage {
  // Core identifiers
  id: string;
  platformMessageId: string;
  platform: Platform;

  // Session/connection context
  sessionId: string;
  userId: string;

  // Message content
  content: string;
  contentType: MessageContentType;

  // Participants
  senderId: string;
  senderName?: string;
  receiverId?: string;

  // Chat context
  chatId: string;
  chatType: 'individual' | 'group';
  chatName?: string;

  // Message metadata
  timestamp: Date;
  isFromMe: boolean;
  isRead: boolean;
  replyToMessageId?: string;

  // Media
  hasMedia: boolean;
  media?: UnifiedMedia[];

  // Platform-specific metadata
  platformMetadata?: Record<string, unknown>;
}

/**
 * Unified media attachment
 */
export interface UnifiedMedia {
  id: string;
  type: MessageContentType;
  url?: string;
  localPath?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  thumbnail?: string;
  duration?: number;
  width?: number;
  height?: number;
}

/**
 * Unified contact representation
 */
export interface UnifiedContact {
  id: string;
  platformContactId: string;
  platform: Platform;
  userId: string;

  displayName?: string;
  phoneNumber?: string;
  username?: string;
  avatarUrl?: string;

  isBlocked: boolean;
  isVerified: boolean;
  lastSeen?: Date;

  inferredName?: string;
  inferredRelationship?: string;
  inferenceConfidence?: number;
  notes?: string;
}

/**
 * Unified chat/conversation representation
 */
export interface UnifiedChat {
  id: string;
  platformChatId: string;
  platform: Platform;
  userId: string;

  name?: string;
  isGroup: boolean;
  participantCount?: number;
  avatarUrl?: string;

  lastMessageAt?: Date;
  unreadCount?: number;
  isMuted?: boolean;
  isArchived?: boolean;
}

/**
 * Platform session representation
 */
export interface PlatformSession {
  id: string;
  platform: Platform;
  userId: string;
  status: PlatformStatus;
  authMethod: AuthMethod;

  platformUserId?: string;
  platformUsername?: string;
  phoneNumber?: string;

  authData?: {
    qrCode?: string;
    token?: string;
    sessionPath?: string;
    state?: unknown;
  };

  createdAt: Date;
  lastConnectedAt?: Date;
  lastMessageAt?: Date;
  error?: string;

  capabilities: PlatformCapabilities;
}

/**
 * Platform capabilities
 */
export interface PlatformCapabilities {
  canSendText: boolean;
  canSendMedia: boolean;
  canSendStickers: boolean;
  canSendVoice: boolean;
  canSendLocation: boolean;
  canCreateGroups: boolean;
  canReadReceipts: boolean;
  canEditMessages: boolean;
  canDeleteMessages: boolean;
  canReactToMessages: boolean;
  canReplyToMessages: boolean;
  maxMessageLength: number;
  supportedMediaTypes: MessageContentType[];
}

/**
 * Outgoing message structure
 */
export interface OutgoingMessage {
  content: string;
  contentType?: MessageContentType;
  replyToMessageId?: string;
  media?: OutgoingMedia[];
}

export interface OutgoingMedia {
  type: MessageContentType;
  data: Buffer | string;
  mimeType?: string;
  fileName?: string;
}

/**
 * Platform events
 */
export type PlatformEvent =
  | 'message'
  | 'message_ack'
  | 'message_deleted'
  | 'message_edited'
  | 'typing'
  | 'presence'
  | 'session_ready'
  | 'session_disconnected'
  | 'session_error'
  | 'qr_code'
  | 'auth_failure';

export type PlatformEventHandler = (data: PlatformEventData) => void | Promise<void>;

export interface PlatformEventData {
  sessionId: string;
  platform: Platform;
  event: PlatformEvent;
  data: unknown;
  timestamp: Date;
}

/**
 * Platform adapter interface - all adapters must implement this
 */
export interface IPlatformAdapter {
  readonly platform: Platform;
  readonly authMethod: AuthMethod;
  readonly capabilities: PlatformCapabilities;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Session management
  createSession(userId: string, sessionId: string, config?: unknown): Promise<PlatformSession>;
  getSession(sessionId: string): Promise<PlatformSession | null>;
  getUserSessions(userId: string): Promise<PlatformSession[]>;
  disconnectSession(sessionId: string): Promise<void>;
  reconnectSession(sessionId: string): Promise<void>;

  // Authentication
  getAuthData(sessionId: string): Promise<unknown>;

  // Messaging
  sendMessage(sessionId: string, chatId: string, message: OutgoingMessage): Promise<UnifiedMessage>;
  markAsRead(sessionId: string, chatId: string, messageId: string): Promise<void>;

  // Contacts & Chats
  getContacts(sessionId: string): Promise<UnifiedContact[]>;
  getChats(sessionId: string): Promise<UnifiedChat[]>;
  getChatHistory(sessionId: string, chatId: string, limit?: number): Promise<UnifiedMessage[]>;

  // Events
  on(event: PlatformEvent, handler: PlatformEventHandler): void;
  off(event: PlatformEvent, handler: PlatformEventHandler): void;
}

/**
 * Platform error structure
 */
export interface PlatformError {
  platform: Platform;
  code: string;
  message: string;
  recoverable: boolean;
  action?: 'reconnect' | 'reauth' | 'notify_user' | 'disable';
  userMessage?: string;
}
