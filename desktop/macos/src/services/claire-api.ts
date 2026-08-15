export type DesktopChat = {
  id: string;
  name: string | null;
  platform: string;
  platform_chat_id: string;
  is_group: boolean;
  last_message_at: string | null;
  unread_count: number | null;
  contact?: { name?: string | null; inferred_name?: string | null; avatar_url?: string | null } | null;
  latest_message?: { content?: string | null; content_type?: string | null; media_mime_type?: string | null; timestamp?: string | null; from_me?: boolean | null } | null;
};

export type DesktopMessage = {
  id: string;
  chat_id?: string | null;
  content: string | null;
  timestamp: string;
  from_me: boolean;
  contact_name?: string | null;
  media_url?: string | null;
  media_mime_type?: string | null;
  content_type?: string | null;
};

export type AssistantCitation = {
  messageId: string;
  chatId: string;
  excerpt: string;
  senderName: string;
  fromMe: boolean;
  timestamp: string;
  platform: string;
  chatName: string | null;
  isGroup: boolean;
  isPreferredScope?: boolean;
};

export type AssistantAnswer = {
  answer: string;
  citations: AssistantCitation[];
  indexing: { status: 'idle' | 'indexing' | 'ready' | 'failed'; indexedCount: number; totalCount: number; lastIndexedAt: string | null; lastError: string | null };
};

export type AssistantThread = { id: string; title: string; created_at: string; updated_at: string };

export type AssistantTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: AssistantCitation[];
  scope_chat_ids: string[];
  created_at: string;
};

export type ConversationAssistantThread = {
  thread: AssistantThread;
  turns: AssistantTurn[];
};

export type ConversationAssistantAnswer = AssistantAnswer & ConversationAssistantThread;

export type DesktopPlatformDefinition = {
  id: string;
  name: string;
  mark: string;
  accent: string;
  iconUrl: string;
  iconTreatment: 'knockout' | 'original' | 'generic';
  bridge: string;
  supportStatus: 'available' | 'beta' | 'planned' | 'unavailable';
  deliveryWave: 'current' | 'wave_1' | 'wave_2' | 'wave_3' | 'parallel_mac';
  setupSurface: 'phone' | 'desktop' | 'mac';
  setupLabel: string;
  runtimeHost: 'cloud' | 'self_hosted' | 'paired_device';
  runtimeLabel: string;
  deviceDependency: 'pairing_only' | 'none' | 'always_on_mac' | 'android_phone_online';
  authSummary: string;
  detail: string;
  capabilities: { desktopSetup: boolean; persistentDevice: boolean };
};

export type DesktopReplyOptions = {
  suggestions: string[];
  confidence: number;
};

export type DesktopConversationSettings = {
  category: string | null;
  profile: {
    display_name?: string | null;
    relationship_context?: string | null;
    ai_instruction?: string | null;
  } | null;
};

export type DesktopPreferences = {
  tone: 'friendly' | 'professional' | 'casual' | 'formal' | 'empathetic';
  response_style: 'concise' | 'detailed' | 'balanced';
  language: string;
  notification_enabled: boolean;
};

export type DesktopPlatformSession = {
  id: string;
  platform: string;
  status: string;
  platformUsername?: string | null;
  phoneNumber?: string | null;
  error?: string | null;
  lastConnectedAt?: string | null;
  authData?: {
    method?: string;
    pairingCode?: string;
    status?: string;
  } | null;
};

export type DesktopPlatformStatus = { platform: string; sessions: DesktopPlatformSession[] };

export type DesktopPlatformConnect = {
  success: boolean;
  resumed?: boolean;
  session: DesktopPlatformSession;
  authData?: {
    method?: string;
    pairingCode?: string;
    status?: string;
  } | null;
};

export type DesktopPromise = {
  id: string;
  content: string;
  deadline?: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed' | 'cancelled' | 'overdue';
  chat_id?: string | null;
  contact_name?: string | null;
  platform?: string | null;
  contact?: { name?: string | null; inferred_name?: string | null; avatar_url?: string | null } | null;
  chat?: { name?: string | null; is_group?: boolean | null; platform?: string | null; contact?: { name?: string | null; inferred_name?: string | null; avatar_url?: string | null } | null } | null;
};

export class ClaireApi {
  constructor(private readonly baseUrl: string, private readonly accessToken: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || `Claire API request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
  }

  getChats(): Promise<DesktopChat[]> {
    return this.request<DesktopChat[]>('/messages/chats');
  }

  async getMessages(chatId: string, limit = 100, offset = 0): Promise<DesktopMessage[]> {
    const response = await this.request<{ messages: DesktopMessage[] }>(`/messages?chatId=${encodeURIComponent(chatId)}&limit=${limit}&offset=${offset}`);
    return [...response.messages].reverse();
  }

  async getMessageContext(messageId: string): Promise<{ chatId: string; messages: DesktopMessage[] }> {
    return this.request<{ chatId: string; messages: DesktopMessage[] }>(`/messages/${encodeURIComponent(messageId)}/context`);
  }

  async markChatRead(chatId: string): Promise<void> {
    await this.request(`/messages/chats/${encodeURIComponent(chatId)}/read`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async registerNotificationDevice(input: { deviceId: string; token: string; timezone: string; appVersion?: string }): Promise<void> {
    await this.request('/notification-devices', {
      method: 'PUT',
      body: JSON.stringify({ ...input, platform: 'macos', provider: 'apns' }),
    });
  }

  async updateNotificationPresence(deviceId: string, state: 'foreground' | 'background', chatId?: string): Promise<void> {
    await this.request('/notification-devices/presence', {
      method: 'POST',
      body: JSON.stringify({ deviceId, state, chatId: chatId || null }),
    });
  }

  async deregisterNotificationDevice(deviceId: string): Promise<void> {
    await this.request(`/notification-devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
  }

  async getPromises(): Promise<DesktopPromise[]> {
    const response = await this.request<{ data: DesktopPromise[] }>('/promises?limit=200');
    return response.data;
  }

  async createAssistantThread(title?: string): Promise<AssistantThread> {
    const response = await this.request<{ data: AssistantThread }>('/ai/assistant/threads', {
      method: 'POST',
      body: JSON.stringify(title ? { title } : {}),
    });
    return response.data;
  }

  async askAssistant(threadId: string, question: string, chatIds: string[] = []): Promise<AssistantAnswer> {
    const response = await this.request<{ data: AssistantAnswer }>(`/ai/assistant/threads/${encodeURIComponent(threadId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ question, chatIds }),
    });
    return response.data;
  }

  async getConversationAssistant(chatId: string): Promise<ConversationAssistantThread> {
    const response = await this.request<{ data: ConversationAssistantThread }>(`/ai/assistant/conversations/${encodeURIComponent(chatId)}`);
    return response.data;
  }

  async askConversationAssistant(chatId: string, question: string): Promise<ConversationAssistantAnswer> {
    const response = await this.request<{ data: ConversationAssistantAnswer }>(`/ai/assistant/conversations/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
    return response.data;
  }

  async clearConversationAssistant(chatId: string): Promise<void> {
    await this.request(`/ai/assistant/conversations/${encodeURIComponent(chatId)}`, { method: 'DELETE' });
  }

  async generateReplyOptions(messageId: string, content: string, chatType: 'individual' | 'group', forceRefresh = false): Promise<DesktopReplyOptions> {
    const response = await this.request<{ success: boolean; data: DesktopReplyOptions }>('/ai/responses/generate', {
      method: 'POST',
      body: JSON.stringify({ messageId, content, chatType, forceRefresh }),
    });
    if (!response.data?.suggestions?.length) throw new Error('Claire did not return any reply options.');
    return response.data;
  }

  async getConversationSettings(chatId: string): Promise<DesktopConversationSettings> {
    const response = await this.request<{ success: boolean; data: DesktopConversationSettings }>(`/conversations/${encodeURIComponent(chatId)}/settings`);
    return response.data;
  }

  async updateConversationProfile(chatId: string, updates: Pick<NonNullable<DesktopConversationSettings['profile']>, 'relationship_context' | 'ai_instruction'>): Promise<DesktopConversationSettings['profile']> {
    const response = await this.request<{ success: boolean; data: DesktopConversationSettings['profile'] }>(`/conversations/${encodeURIComponent(chatId)}/profile`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.data;
  }

  async getPreferences(): Promise<DesktopPreferences> {
    const response = await this.request<{ data: DesktopPreferences }>('/preferences');
    return response.data;
  }

  async updatePreferences(updates: Partial<DesktopPreferences>): Promise<DesktopPreferences> {
    const response = await this.request<{ data: DesktopPreferences }>('/preferences', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.data;
  }

  async getPlatformSession(platform: string): Promise<string | null> {
    const response = await this.getPlatformStatus(platform);
    return response.sessions?.find((session) => session.status === 'connected')?.id ?? null;
  }

  getPlatformStatus(platform: string): Promise<DesktopPlatformStatus> {
    return this.request<DesktopPlatformStatus>(`/platforms/${encodeURIComponent(platform)}/status`);
  }

  async getPlatformDefinitions(): Promise<DesktopPlatformDefinition[]> {
    const response = await this.request<{ platforms: DesktopPlatformDefinition[] }>('/platforms/definitions');
    return response.platforms;
  }

  async getPlatformInterest(): Promise<string[]> {
    const response = await this.request<{ platformIds: string[] }>('/platforms/interests');
    return response.platformIds;
  }

  async requestPlatformInterest(platform: string): Promise<void> {
    await this.request(`/platforms/${encodeURIComponent(platform)}/interest`, { method: 'POST', body: JSON.stringify({}) });
  }

  /**
   * Start or resume the bridge-managed WhatsApp phone-pairing flow. The
   * server owns the long-poll and transition to connected; clients only show
   * the returned pairing code and observe status.
   */
  connectWhatsApp(phoneNumber: string): Promise<DesktopPlatformConnect> {
    return this.request<DesktopPlatformConnect>('/platforms/whatsapp/connect', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    });
  }

  async sendMessage(platform: string, sessionId: string, chatId: string, message: string): Promise<void> {
    await this.request(`/platforms/${encodeURIComponent(platform)}/send`, {
      method: 'POST',
      body: JSON.stringify({ sessionId, chatId, content: message }),
    });
  }

}
