import { redis } from './redis';

export type NotificationAppState = 'foreground' | 'background';

export interface DevicePresence {
  state: NotificationAppState;
  chatId?: string;
  updatedAt: string;
}

const PRESENCE_TTL_SECONDS = 90;

function presenceKey(userId: string, deviceId: string): string {
  return `notification:presence:${userId}:${deviceId}`;
}

export const notificationPresence = {
  async update(userId: string, deviceId: string, state: NotificationAppState, chatId?: string): Promise<void> {
    const value: DevicePresence = {
      state,
      ...(chatId ? { chatId } : {}),
      updatedAt: new Date().toISOString(),
    };
    await redis.setex(presenceKey(userId, deviceId), PRESENCE_TTL_SECONDS, JSON.stringify(value));
  },

  async clear(userId: string, deviceId: string): Promise<void> {
    await redis.del(presenceKey(userId, deviceId));
  },

  async get(userId: string, deviceId: string): Promise<DevicePresence | null> {
    const raw = await redis.get(presenceKey(userId, deviceId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DevicePresence;
    } catch {
      return null;
    }
  },

  async isViewingChat(userId: string, deviceId: string, chatId: string): Promise<boolean> {
    const presence = await this.get(userId, deviceId);
    return presence?.state === 'foreground' && presence.chatId === chatId;
  },
};
