import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Linking, PanResponder, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { CircleHelp, Home, Inbox as InboxIcon, ListTodo, MessageCircle, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, RefreshCw, Search, Send, Settings, SlidersHorizontal, Sparkles, Trash2, Users } from 'lucide-react-native';
import { ClaireAvatar, ClaireButton, ClaireCard, ClaireConversationRow, ClaireField, ClaireIconButton, ClaireMessageBubble, ClaireStatusPill, ClaireText, colors, radius, space } from '@claire/design-system';
import { companionBridge, type CompanionStatus, type DesktopRuntimeConfig } from './native/CompanionBridge';
import { ClaireApi, type AssistantAnswer, type AssistantCitation, type AssistantTurn, type ConversationAssistantThread, type DesktopChat, type DesktopMessage, type DesktopPlatformDefinition, type DesktopPlatformStatus, type DesktopPreferences, type DesktopPromise } from './services/claire-api';
import { createDesktopAuth, exchangeDesktopCallback, signInWithGoogle, type DesktopAuth } from './services/auth';
import { clampDesktopPaneWidth, destinationForDesktopCommand, type DesktopDestination } from './services/desktop-navigation';
import { mergeChronologicalMessages } from './services/message-sync';

type Destination = DesktopDestination;
type Conversation = { id: string; platformChatId: string; name: string; initials: string; avatarUrl?: string; preview: string; time: string; unread?: number; platform: string; isGroup: boolean; tone: 'mint' | 'sky' | 'blush' | 'lavender' };

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

function relativeTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function chatTone(index: number): Conversation['tone'] {
  return (['mint', 'sky', 'blush', 'lavender'] as const)[index % 4];
}

function toConversation(chat: DesktopChat, index: number): Conversation {
  const name = chat.name || chat.contact?.name || chat.contact?.inferred_name || 'Conversation';
  const content = chat.latest_message?.content?.trim();
  const preview = content || (chat.latest_message?.content_type === 'image' ? 'Photo' : chat.latest_message?.content_type === 'video' ? 'Video' : chat.is_group ? 'Group conversation' : 'No messages yet');
  return { id: chat.id, platformChatId: chat.platform_chat_id, name, initials: initials(name), avatarUrl: chat.contact?.avatar_url || undefined, preview, time: relativeTime(chat.last_message_at || chat.latest_message?.timestamp || null), unread: chat.unread_count || undefined, platform: chat.platform, isGroup: chat.is_group, tone: chatTone(index) };
}

export default function DesktopApp({ compactWindow = false, initialConversationId, runtimeConfig }: { compactWindow?: boolean; initialConversationId?: string; runtimeConfig?: DesktopRuntimeConfig }) {
  const [auth, setAuth] = useState<DesktopAuth | null | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};
    const load = async () => {
      try {
        const nextAuth = await createDesktopAuth(runtimeConfig);
        if (!active) return;
        setAuth(nextAuth);
        if (!nextAuth) return;
        const listener = nextAuth.client.auth.onAuthStateChange((_event, nextSession) => {
          if (active) setSession(nextSession);
        });
        unsubscribe = () => listener.data.subscription.unsubscribe();

        // Register this before restoring a saved session. On macOS the secure
        // storage lookup can take a moment, but a user may immediately finish
        // the browser login. Missing that deep-link left OAuth looking like it
        // simply stopped after account selection.
        const handleAuthCallback = (url: string) => {
          const hasCode = /[?&#]code=/.test(url);
          const hasError = /[?&#]error=/.test(url);
          console.log('[Claire Desktop] Received OAuth callback', { hasCode, hasError });
          setAuthError(null);
          exchangeDesktopCallback(nextAuth.client, url)
            .then((nextSession) => {
              if (active && nextSession) setSession(nextSession);
            })
            .catch((error: Error) => {
              console.warn('[Claire Desktop] OAuth callback could not be completed', error.message);
              if (active) setAuthError(error.message);
            });
        };
        const urlListener = Linking.addEventListener('url', ({ url }) => handleAuthCallback(url));
        const previousUnsubscribe = unsubscribe;
        unsubscribe = () => { previousUnsubscribe(); urlListener.remove(); };
        const initialUrl = await Linking.getInitialURL().catch(() => null);
        if (initialUrl) handleAuthCallback(initialUrl);

        // A development-signed macOS app can occasionally block in Keychain
        // while Supabase restores a previous session. Do not leave the whole
        // client on a blank loading state: keep listening for a late result,
        // but make the sign-in screen available after a short deadline.
        const restoredSession = nextAuth.client.auth.getSession()
          .then(({ data }) => {
            if (active) setSession(data.session);
          })
          .catch((error: Error) => {
            console.warn('[Claire Desktop] Unable to restore the saved session', error.message);
            if (active) setSession(null);
          });
        await Promise.race([
          restoredSession,
          new Promise<void>((resolve) => setTimeout(resolve, 2_500)),
        ]);
      } catch (error) {
        if (active) {
          setAuth(null);
          setAuthError(error instanceof Error ? error.message : 'Unable to initialise Claire Desktop.');
        }
      }
    };
    load().catch(() => undefined);
    return () => { active = false; unsubscribe(); };
  }, [runtimeConfig]);

  if (auth === undefined) return <LoadingScreen label="Starting Claire Desktop…" />;
  if (!auth) return <ConfigurationScreen error={authError} />;
  if (!session) return <SignInScreen auth={auth} error={authError} onError={setAuthError} />;
  return <DesktopWorkspace auth={auth} compactWindow={compactWindow} initialConversationId={initialConversationId} session={session} />;
}

function DesktopWorkspace({ auth, compactWindow, initialConversationId, session }: { auth: DesktopAuth; compactWindow: boolean; initialConversationId?: string; session: Session }) {
  const { width } = useWindowDimensions();
  const [destination, setDestination] = useState<Destination>('Inbox');
  const [compactChatOpen, setCompactChatOpen] = useState(false);
  const [chats, setChats] = useState<DesktopChat[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialConversationId || null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DesktopMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationDeviceId, setNotificationDeviceId] = useState<string | null>(null);
  const [companion, setCompanion] = useState<CompanionStatus | null>(null);
  const [companionNotice, setCompanionNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [conversationPaneWidth, setConversationPaneWidth] = useState(330);
  const [inspectorPaneWidth, setInspectorPaneWidth] = useState(290);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const syncingIMessageRef = useRef(false);
  const selectedConversationIdRef = useRef<string | null>(initialConversationId || null);
  const api = useMemo(() => auth.config.apiUrl ? new ClaireApi(auth.config.apiUrl, session.access_token) : null, [auth.config.apiUrl, session.access_token]);
  const conversations = useMemo(() => chats.map(toConversation), [chats]);
  const selected = useMemo(() => conversations.find((item) => item.id === selectedConversationId) ?? conversations[0] ?? null, [conversations, selectedConversationId]);
  const usesCompactInbox = width < 980;
  const usesCompactNavigation = width < 1080 || navigationCollapsed;
  const canShowInspector = width >= 1320 && destination === 'Inbox';
  const showsInspector = canShowInspector && !inspectorCollapsed;
  const openConversation = useCallback((chatId: string) => {
    setHighlightedMessageId(null);
    setSelectedConversationId(chatId);
    setDestination('Inbox');
    setCompactChatOpen(true);
  }, []);

  useEffect(() => { selectedConversationIdRef.current = selectedConversationId; }, [selectedConversationId]);

  useEffect(() => {
    const unreadCount = chats.reduce((total, chat) => total + Math.max(0, chat.unread_count || 0), 0);
    companionBridge.setDockBadge(unreadCount).catch(() => undefined);
  }, [chats]);

  const refreshChats = useCallback(async (showLoading = true) => {
    if (!api) return;
    if (showLoading) setLoadingChats(true);
    try {
      const nextChats = await api.getChats();
      setChats(nextChats);
      setSelectedConversationId((current) => current && nextChats.some((chat) => chat.id === current) ? current : (initialConversationId && nextChats.some((chat) => chat.id === initialConversationId) ? initialConversationId : nextChats[0]?.id ?? null));
      if (showLoading) setDataError(null);
    } catch (error) {
      if (showLoading) setDataError(error instanceof Error ? error.message : 'Unable to load conversations.');
    } finally {
      if (showLoading) setLoadingChats(false);
    }
  }, [api, initialConversationId]);

  const refreshVisibleMessages = useCallback(async () => {
    if (!api || !selectedConversationId || highlightedMessageId) return;
    const latest = await api.getMessages(selectedConversationId, 100, 0);
    setMessages((current) => mergeChronologicalMessages(current, latest));
    setHasMoreMessages((current) => current || latest.length === 100);
  }, [api, highlightedMessageId, selectedConversationId]);

  const syncIMessageHistory = useCallback(async () => {
    if (!api || syncingIMessageRef.current) return;
    syncingIMessageRef.current = true;
    try {
      let cursor = Number(await companionBridge.getSecureValue('companion.imessage.cursor') || '0');
      const initialSyncComplete = await companionBridge.getSecureValue('companion.imessage.initial_sync_complete') === 'true';
      const syncKind = initialSyncComplete ? 'live' : 'backfill';
      let synced = 0;
      while (true) {
        const batch = await companionBridge.fetchIMessageMessages(cursor, 200);
        if (!batch.length) break;
        await companionBridge.ingestIMessageEvents(auth.config.apiUrl, batch.map((message) => ({
          platformMessageId: message.platformMessageId,
          content: message.content,
          contentType: message.contentType,
          senderId: message.senderId,
          senderName: message.senderName,
          chatId: message.chatId,
          chatType: message.chatType,
          chatName: message.chatName,
          timestamp: new Date(message.timestampMilliseconds).toISOString(),
          isFromMe: message.isFromMe,
          isRead: message.isRead,
          hasMedia: message.hasMedia,
          platformMetadata: { rowId: message.rowId, syncKind },
        })));
        // Attachment paths stay inside native code. This follows event
        // ingestion so the device-authenticated upload can attach media to a
        // message row that already exists.
        const uploadedMedia = await companionBridge.syncIMessageMedia(auth.config.apiUrl, batch.filter((message) => message.hasMedia));
        if (uploadedMedia) setCompanionNotice(`Synced ${uploadedMedia} iMessage attachment${uploadedMedia === 1 ? '' : 's'} from this Mac.`);
        cursor = batch[batch.length - 1].rowId;
        synced += batch.length;
        await companionBridge.setSecureValue('companion.imessage.cursor', String(cursor));
        if (batch.length < 200) break;
      }
      if (!initialSyncComplete) await companionBridge.setSecureValue('companion.imessage.initial_sync_complete', 'true');
      if (synced) {
        setCompanionNotice(`Synced ${synced} iMessage${synced === 1 ? '' : 's'} from this Mac.`);
        await refreshChats();
      }
    } finally {
      syncingIMessageRef.current = false;
    }
  }, [api, auth.config.apiUrl, refreshChats]);

  useEffect(() => {
    const loadCompanion = async () => {
      try {
        setCompanion(await companionBridge.getStatus());
      } catch {
        setCompanion(null);
      }
    };
    loadCompanion().catch(() => setCompanion(null));
  }, []);

  useEffect(() => {
    if (!api) return;
    let active = true;
    const enrollCompanion = async () => {
      try {
        const enrollment = await companionBridge.enrolMacCompanion(auth.config.apiUrl, session.access_token, session.user.id);
        if (active) setNotificationDeviceId(enrollment.deviceId);
        await companionBridge.heartbeatMacCompanion(auth.config.apiUrl);
        if (active) setCompanion(await companionBridge.getStatus());
        await syncIMessageHistory();
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Mac companion enrolment needs attention.';
        if (!/invalid device credential|device not found|not enrolled/i.test(detail)) {
          if (active) setCompanionNotice(detail);
          return;
        }
        try {
          await companionBridge.resetMacCompanion();
          const enrollment = await companionBridge.enrolMacCompanion(auth.config.apiUrl, session.access_token, session.user.id);
          if (active) setNotificationDeviceId(enrollment.deviceId);
          await companionBridge.heartbeatMacCompanion(auth.config.apiUrl);
          if (active) setCompanion(await companionBridge.getStatus());
          await syncIMessageHistory();
          if (active) setCompanionNotice('This Mac companion was safely re-enrolled.');
        } catch (recoveryError) {
          if (active) setCompanionNotice(recoveryError instanceof Error ? recoveryError.message : detail);
        }
      }
    };
    enrollCompanion().catch(() => undefined);
    const keepAliveAndSync = async () => {
      await companionBridge.heartbeatMacCompanion(auth.config.apiUrl);
      if (active) setCompanion(await companionBridge.getStatus());
      await syncIMessageHistory();
    };
    const interval = setInterval(() => {
      keepAliveAndSync().catch((error) => active && setCompanionNotice(error instanceof Error ? error.message : 'iMessage sync needs attention.'));
    }, 30_000);
    return () => { active = false; clearInterval(interval); };
  }, [api, auth.config.apiUrl, session.access_token, session.user.id, syncIMessageHistory]);

  useEffect(() => { refreshChats().catch(() => undefined); }, [refreshChats]);

  useEffect(() => {
    let active = true;
    setWorkspaceHydrated(false);
    if (compactWindow) {
      setWorkspaceHydrated(true);
      return () => { active = false; };
    }
    const preferencePrefix = `workspace.${session.user.id}`;
    Promise.all([
      companionBridge.getDesktopPreference(`${preferencePrefix}.destination`),
      companionBridge.getDesktopPreference(`${preferencePrefix}.conversation`),
      companionBridge.getDesktopPreference(`${preferencePrefix}.conversation-pane-width`),
      companionBridge.getDesktopPreference(`${preferencePrefix}.inspector-pane-width`),
    ]).then(([savedDestination, savedConversationId, savedConversationPaneWidth, savedInspectorPaneWidth]) => {
      if (!active) return;
      if (savedDestination && ['Home', 'Inbox', 'Promises', 'People', 'Search', 'Connections', 'Settings'].includes(savedDestination)) {
        setDestination(savedDestination as Destination);
      }
      if (savedConversationId) setSelectedConversationId(savedConversationId);
      const conversationWidth = Number(savedConversationPaneWidth);
      if (Number.isFinite(conversationWidth)) setConversationPaneWidth(clampDesktopPaneWidth(conversationWidth, 'conversation'));
      const inspectorWidth = Number(savedInspectorPaneWidth);
      if (Number.isFinite(inspectorWidth)) setInspectorPaneWidth(clampDesktopPaneWidth(inspectorWidth, 'inspector'));
    }).catch(() => undefined).finally(() => { if (active) setWorkspaceHydrated(true); });
    return () => { active = false; };
  }, [compactWindow, session.user.id]);

  useEffect(() => {
    if (compactWindow || !workspaceHydrated) return;
    const preferencePrefix = `workspace.${session.user.id}`;
    companionBridge.setDesktopPreference(`${preferencePrefix}.destination`, destination).catch(() => undefined);
    companionBridge.setDesktopPreference(`${preferencePrefix}.conversation`, selectedConversationId || '').catch(() => undefined);
    companionBridge.setDesktopPreference(`${preferencePrefix}.conversation-pane-width`, String(conversationPaneWidth)).catch(() => undefined);
    companionBridge.setDesktopPreference(`${preferencePrefix}.inspector-pane-width`, String(inspectorPaneWidth)).catch(() => undefined);
  }, [compactWindow, conversationPaneWidth, destination, inspectorPaneWidth, selectedConversationId, session.user.id, workspaceHydrated]);

  useEffect(() => companionBridge.subscribeDesktopCommands((command) => {
    setDestination(destinationForDesktopCommand(command));
    if (command === 'inbox') setCompactChatOpen(false);
    if (command === 'compose') {
      setCompactChatOpen(true);
      setComposerFocusRequest((current) => current + 1);
    }
    if (command === 'compact') companionBridge.openCompactChatWindow(selectedConversationIdRef.current).catch(() => undefined);
  }), []);

  useEffect(() => {
    const openNotification = (payload: { chatId: string; messageId?: string }) => {
      openConversation(payload.chatId);
      setHighlightedMessageId(payload.messageId || null);
    };
    const unsubscribe = companionBridge.subscribeNotificationResponses(openNotification);
    companionBridge.getPendingNotificationResponse().then((payload) => { if (payload) openNotification(payload); }).catch(() => undefined);
    return unsubscribe;
  }, [openConversation]);

  useEffect(() => {
    if (!api || !notificationDeviceId) return;
    let active = true;
    const register = async (token?: string) => {
      const registration = token ? { token, status: 'authorized' as const, error: '' } : await companionBridge.getNotificationRegistration();
      if (!registration.token || (registration.status !== 'authorized' && registration.status !== 'provisional')) return;
      await api.registerNotificationDevice({
        deviceId: notificationDeviceId,
        token: registration.token,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
    };
    register().catch((error) => active && setCompanionNotice(error instanceof Error ? error.message : 'Unable to register Mac notifications.'));
    const unsubscribeToken = companionBridge.subscribeNotificationTokenChanges((token) => register(token).catch(() => undefined));
    const presence = () => api.updateNotificationPresence(
      notificationDeviceId,
      AppState.currentState === 'active' ? 'foreground' : 'background',
      AppState.currentState === 'active' && destination === 'Inbox' ? selectedConversationId || undefined : undefined,
    ).catch(() => undefined);
    presence();
    const heartbeat = setInterval(presence, 45_000);
    const appState = AppState.addEventListener('change', () => presence());
    return () => { active = false; unsubscribeToken(); clearInterval(heartbeat); appState.remove(); };
  }, [api, destination, notificationDeviceId, selectedConversationId]);

  useEffect(() => {
    if (!api) return;
    let active = true;
    api.getPreferences().then((preferences) => active && setNotificationsEnabled(preferences.notification_enabled)).catch(() => undefined);
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const interval = setInterval(() => { refreshChats(false).catch(() => undefined); }, 12_000);
    return () => clearInterval(interval);
  }, [api, refreshChats]);

  useEffect(() => {
    if (!api || !selectedConversationId) return;
    let active = true;
    setLoadingMessages(true);
    setMessages([]);
    setHasMoreMessages(false);
    const messageRequest = highlightedMessageId ? api.getMessageContext(highlightedMessageId).then((context) => context.messages) : api.getMessages(selectedConversationId);
    messageRequest
      .then((nextMessages) => {
        if (!active) return;
        setMessages(nextMessages);
        setHasMoreMessages(!highlightedMessageId && nextMessages.length === 100);
        setDataError(null);
        api.markChatRead(selectedConversationId)
          .then(() => setChats((current) => current.map((chat) => chat.id === selectedConversationId ? { ...chat, unread_count: 0 } : chat)))
          .catch(() => undefined);
      })
      .catch((error: Error) => active && setDataError(error.message))
      .finally(() => active && setLoadingMessages(false));
    return () => { active = false; };
  }, [api, highlightedMessageId, selectedConversationId]);

  useEffect(() => {
    if (!api || !selectedConversationId || highlightedMessageId) return;
    const reconcileVisibleMessages = async () => {
      try {
        await refreshVisibleMessages();
      } catch {
        // Background refresh must not replace a usable conversation with an error state.
      }
    };
    const interval = setInterval(() => { reconcileVisibleMessages().catch(() => undefined); }, 12_000);
    return () => clearInterval(interval);
  }, [api, highlightedMessageId, refreshVisibleMessages, selectedConversationId]);

  useEffect(() => {
    if (!api) return;
    const channel = auth.client
      .channel(`claire-desktop-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${session.user.id}` }, ({ new: row }) => {
        const message = row as { chat_id?: string; from_me?: boolean; contact_name?: string | null; content?: string | null };
        refreshChats(false).catch(() => undefined);
        if (message.chat_id === selectedConversationId) {
          refreshVisibleMessages().catch(() => undefined);
          if (!message.from_me) api.markChatRead(message.chat_id).catch(() => undefined);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `user_id=eq.${session.user.id}` }, () => {
        refreshVisibleMessages().catch(() => undefined);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats', filter: `user_id=eq.${session.user.id}` }, () => {
        refreshChats(false).catch(() => undefined);
      })
      .subscribe((status) => {
        setRealtimeStatus(status === 'SUBSCRIBED' ? 'live' : 'reconnecting');
      });
    return () => { auth.client.removeChannel(channel); };
  }, [api, auth.client, refreshChats, refreshVisibleMessages, selectedConversationId, session.user.id]);

  const loadOlderMessages = async () => {
    if (!api || !selectedConversationId || loadingOlderMessages || !hasMoreMessages) return;
    setLoadingOlderMessages(true);
    try {
      const older = await api.getMessages(selectedConversationId, 100, messages.length);
      setMessages((current) => mergeChronologicalMessages(current, older));
      setHasMoreMessages(older.length === 100);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to load older messages.');
    } finally { setLoadingOlderMessages(false); }
  };

  const sendDraft = async () => {
    if (!api || !selected || !draft.trim()) return;
    try {
      const content = draft.trim();
      if (selected.platform === 'imessage') {
        if (selected.isGroup) throw new Error('Direct iMessage sending currently supports one-to-one conversations only.');
        await companionBridge.sendIMessage(selected.platformChatId, content);
        const optimistic: DesktopMessage = {
          id: `local-imessage-${Date.now()}`,
          content,
          timestamp: new Date().toISOString(),
          from_me: true,
          content_type: 'text',
        };
        setMessages((current) => [...current, optimistic]);
        setDraft('');
        setCompanionNotice('Sent through Messages. Claire will confirm it on the next sync.');
        setTimeout(() => { syncIMessageHistory().catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to confirm the iMessage send.')); }, 1_000);
        return;
      }
      const sessionId = await api.getPlatformSession(selected.platform);
      if (!sessionId) throw new Error(`${selected.platform} is not connected on this account.`);
      await api.sendMessage(selected.platform, sessionId, selected.platformChatId, content);
      setDraft('');
      await Promise.all([refreshChats(), api.getMessages(selected.id).then(setMessages)]);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Unable to send this message.');
    }
  };

  if (compactWindow) {
    return <SafeAreaView style={styles.safeArea} testID="claire-desktop-compact-chat"><StatusBar barStyle="dark-content" /><ChatPane api={api} compact selected={selected} messages={messages} highlightedMessageId={highlightedMessageId} apiBaseUrl={auth.config.apiUrl} loading={loadingMessages} loadingOlder={loadingOlderMessages} hasMoreMessages={hasMoreMessages} draft={draft} onDraftChange={setDraft} composerFocusRequest={composerFocusRequest} onLoadOlder={() => { loadOlderMessages().catch(() => undefined); }} onSend={() => { sendDraft().catch(() => undefined); }} onAskClaire={() => setDestination('Search')} error={dataError} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea} testID="claire-desktop-shell">
      <StatusBar barStyle="dark-content" />
      <DesktopTitleBar destination={destination} navigationCollapsed={usesCompactNavigation} onOpenSearch={() => setDestination('Search')} onOpenConnections={() => setDestination('Connections')} onToggleNavigation={() => setNavigationCollapsed((current) => !current)} />
      <View style={styles.appFrame}>
        <NavigationRail compact={usesCompactNavigation} destination={destination} realtimeStatus={realtimeStatus} onSelect={(next) => { setDestination(next); if (next === 'Inbox') setCompactChatOpen(false); }} onSignOut={() => {
          const signOut = async () => {
            if (api && notificationDeviceId) await api.deregisterNotificationDevice(notificationDeviceId).catch(() => undefined);
            await auth.client.auth.signOut();
          };
          signOut().catch(() => undefined);
        }} />
        {destination === 'Home' ? <HomePane api={api} companion={companion} conversations={conversations} onOpenChat={openConversation} onOpenInbox={() => setDestination('Inbox')} /> : null}
        {destination === 'Promises' ? <PromisesPane api={api} onOpenChat={openConversation} /> : null}
        {destination === 'People' ? <PeoplePane conversations={conversations} onOpenChat={openConversation} /> : null}
        {destination === 'Search' ? <AssistantPane api={api} selected={selected} onOpenMessage={(chatId, messageId) => { setSelectedConversationId(chatId); setHighlightedMessageId(messageId); setDestination('Inbox'); }} /> : null}
        {destination === 'Connections' ? <ConnectionsPane companion={companion} companionNotice={companionNotice} api={api} apiUrl={auth.config.apiUrl} accessToken={session.access_token} /> : null}
        {destination === 'Settings' ? <SettingsPane api={api} onNotificationPreferenceChange={setNotificationsEnabled} /> : null}
        {destination === 'Inbox' ? <>{(!usesCompactInbox || !compactChatOpen) ? <ConversationPane compact={usesCompactInbox} width={conversationPaneWidth} selectedId={selectedConversationId} onSelect={openConversation} onOpenSearch={() => setDestination('Search')} conversations={conversations} loading={loadingChats} error={dataError} onRefresh={() => { refreshChats().catch(() => undefined); }} /> : null}{!usesCompactInbox ? <PaneResizeHandle accessibilityLabel="Resize conversation list" direction={1} initialWidth={conversationPaneWidth} onWidthChange={(next) => setConversationPaneWidth(clampDesktopPaneWidth(next, 'conversation'))} /> : null}{(!usesCompactInbox || compactChatOpen) ? <ChatPane api={api} compact={usesCompactInbox} onBack={usesCompactInbox ? () => setCompactChatOpen(false) : undefined} selected={selected} messages={messages} highlightedMessageId={highlightedMessageId} apiBaseUrl={auth.config.apiUrl} loading={loadingMessages} loadingOlder={loadingOlderMessages} hasMoreMessages={hasMoreMessages} draft={draft} onDraftChange={setDraft} composerFocusRequest={composerFocusRequest} onLoadOlder={() => { loadOlderMessages().catch(() => undefined); }} onSend={() => { sendDraft().catch(() => undefined); }} onAskClaire={() => setDestination('Search')} assistantPanelAvailable={canShowInspector} assistantPanelVisible={showsInspector} onToggleAssistantPanel={() => setInspectorCollapsed((current) => !current)} error={dataError} /> : null}</> : null}
        {showsInspector ? <><PaneResizeHandle accessibilityLabel="Resize Claire assistant panel" direction={-1} initialWidth={inspectorPaneWidth} onWidthChange={(next) => setInspectorPaneWidth(clampDesktopPaneWidth(next, 'inspector'))} /><ConversationAssistantInspector api={api} selected={selected} width={inspectorPaneWidth} onCollapse={() => setInspectorCollapsed(true)} onOpenMessage={(chatId, messageId) => { setSelectedConversationId(chatId); setHighlightedMessageId(messageId); }} /></> : null}
      </View>
    </SafeAreaView>
  );
}

function DesktopTitleBar({ destination, navigationCollapsed, onOpenSearch, onOpenConnections, onToggleNavigation }: { destination: Destination; navigationCollapsed: boolean; onOpenSearch: () => void; onOpenConnections: () => void; onToggleNavigation: () => void }) {
  return <View mouseDownCanMoveWindow style={styles.desktopTitleBar}>
    <View mouseDownCanMoveWindow={false} style={desktopShellStyles.titleBarLeading}><ClaireIconButton accessibilityLabel={navigationCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onPress={onToggleNavigation} style={desktopShellStyles.titleBarIconButton}>{navigationCollapsed ? <PanelLeftOpen size={15} color={colors.ink} /> : <PanelLeftClose size={15} color={colors.ink} />}</ClaireIconButton></View>
    <View pointerEvents="none" mouseDownCanMoveWindow style={styles.titleBarTitle}><ClaireText variant="bodySmall" style={styles.titleBarTitleText}>Claire · {destination === 'Search' ? 'Ask Claire' : destination}</ClaireText></View>
    <View mouseDownCanMoveWindow={false} style={styles.titleBarActions}><ClaireIconButton accessibilityLabel="Open Ask Claire" onPress={onOpenSearch} style={desktopShellStyles.titleBarIconButton}><Search size={15} color={colors.ink} /></ClaireIconButton><ClaireIconButton accessibilityLabel="Open connections" onPress={onOpenConnections} style={desktopShellStyles.titleBarIconButton}><Plus size={16} color={colors.ink} /></ClaireIconButton></View>
  </View>;
}

function NavigationRail({ compact, destination, realtimeStatus, onSelect, onSignOut }: { compact: boolean; destination: Destination; realtimeStatus: 'connecting' | 'live' | 'reconnecting'; onSelect: (value: Destination) => void; onSignOut: () => void }) {
  const entries: Destination[] = ['Home', 'Inbox', 'Promises', 'People', 'Search', 'Connections', 'Settings'];
  return <View style={[styles.navigationRail, compact && styles.navigationRailCompact]}>
    <View>
      {entries.map((entry) => <Pressable key={entry} accessibilityRole="button" accessibilityLabel={entry === 'Search' ? 'Ask Claire' : entry} accessibilityState={{ selected: destination === entry }} onPress={() => onSelect(entry)} style={({ pressed }) => [styles.navButton, compact && styles.navButtonCompact, destination === entry && styles.navButtonActive, pressed && styles.pressed]}><View style={desktopShellStyles.navEntryContent}><NavigationIcon entry={entry} active={destination === entry} />{!compact ? <ClaireText variant="label" style={[styles.navText, destination === entry && styles.navTextActive]}>{entry === 'Search' ? 'Ask Claire' : entry}</ClaireText> : null}</View></Pressable>)}
    </View>
    <View>{compact ? <View style={[styles.syncDot, realtimeStatus === 'live' && styles.syncDotLive]} /> : <ClaireStatusPill tone={realtimeStatus === 'live' ? 'success' : 'warning'}>{realtimeStatus === 'live' ? 'Live sync' : realtimeStatus === 'connecting' ? 'Connecting…' : 'Reconciling…'}</ClaireStatusPill>}<Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={onSignOut} style={[styles.profileRow, compact && styles.profileRowCompact]}><ClaireAvatar initials="LS" size={34} tone="lavender" />{!compact ? <ClaireText variant="label" style={styles.profileName}>Sign out</ClaireText> : null}</Pressable></View>
  </View>;
}

function NavigationIcon({ entry, active }: { entry: Destination; active: boolean }) {
  const color = active ? colors.lime : colors.neutral[300];
  const Icon = entry === 'Home' ? Home : entry === 'Inbox' ? InboxIcon : entry === 'Promises' ? ListTodo : entry === 'People' ? Users : entry === 'Search' ? Sparkles : entry === 'Connections' ? CircleHelp : Settings;
  return <Icon size={18} color={color} />;
}

function PaneResizeHandle({ accessibilityLabel, direction, initialWidth, onWidthChange }: { accessibilityLabel: string; direction: 1 | -1; initialWidth: number; onWidthChange: (width: number) => void }) {
  const dragStartWidthRef = useRef(initialWidth);
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 2,
    onPanResponderGrant: () => { dragStartWidthRef.current = initialWidth; },
    onPanResponderMove: (_event, gesture) => onWidthChange(dragStartWidthRef.current + (gesture.dx * direction)),
  }), [direction, initialWidth, onWidthChange]);
  return <View accessibilityLabel={accessibilityLabel} accessibilityRole="adjustable" {...responder.panHandlers} style={styles.paneResizeHandle} />;
}

function ConversationPane({ compact, width, selectedId, onSelect, onOpenSearch, conversations, loading, error, onRefresh }: { compact: boolean; width: number; selectedId: string | null; onSelect: (id: string) => void; onOpenSearch: () => void; conversations: Conversation[]; loading: boolean; error: string | null; onRefresh: () => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleConversations = conversations.filter((conversation) => {
    const matchesQuery = !normalizedQuery || `${conversation.name} ${conversation.preview} ${conversation.platform}`.toLocaleLowerCase().includes(normalizedQuery);
    const matchesFilter = filter === 'all' || (filter === 'unread' && Boolean(conversation.unread)) || (filter === 'groups' && conversation.isGroup);
    return matchesQuery && matchesFilter;
  });
  const unreadCount = conversations.reduce((count, conversation) => count + (conversation.unread || 0), 0);
  return <View style={[styles.conversationPane, { width }, compact && styles.conversationPaneCompact]}>
    <View style={styles.paneHeader}><View style={styles.paneHeaderCopy}><ClaireText variant="screenTitle" numberOfLines={1}>Inbox</ClaireText><ClaireText variant="bodySmall" numberOfLines={1} style={styles.muted}>Your conversations, in one place</ClaireText></View><ClaireIconButton accessibilityLabel="Refresh conversations" disabled={loading} onPress={onRefresh}>{loading ? <ActivityIndicator size="small" color={colors.ink} /> : <RefreshCw size={17} color={colors.ink} />}</ClaireIconButton></View>
    <View style={styles.inboxSearch}><Search size={17} color={colors.neutral[400]} /><TextInput accessibilityLabel="Search conversations" value={query} onChangeText={setQuery} placeholder="Search everything" placeholderTextColor={colors.neutral[400]} style={styles.inboxSearchInput} /><Pressable accessibilityRole="button" accessibilityLabel="Open global search" onPress={onOpenSearch} style={({ pressed }) => [styles.searchShortcut, pressed && styles.pressed]}><ClaireText variant="monoLabel" style={styles.searchShortcutText}>⌘K</ClaireText></Pressable></View>
    <View style={styles.inboxFilters}>{([['all', 'All'], ['unread', unreadCount ? `Unread ${unreadCount}` : 'Unread'], ['groups', 'Groups']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={({ pressed }) => [styles.inboxFilter, filter === value && styles.inboxFilterActive, pressed && styles.pressed]}><ClaireText variant="label" style={filter === value ? styles.inboxFilterActiveText : styles.inboxFilterText}>{label}</ClaireText></Pressable>)}</View>
    <ScrollView contentContainerStyle={styles.conversationList} showsVerticalScrollIndicator={false}>{loading ? <LoadingRow label="Loading conversations…" /> : null}{!loading && error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}{!loading && !error && conversations.length === 0 ? <ClaireText variant="bodySmall" style={styles.muted}>No conversations have synced to this account yet.</ClaireText> : null}{!loading && !error && conversations.length > 0 && visibleConversations.length === 0 ? <ClaireText variant="bodySmall" style={styles.muted}>No conversations match this view.</ClaireText> : null}{visibleConversations.map((item) => <ClaireConversationRow key={item.id} name={item.name} preview={item.preview} timestamp={item.time} platform={item.platform} unreadCount={item.unread} initials={item.initials} avatarSource={item.avatarUrl ? { uri: item.avatarUrl } : undefined} avatarTone={item.tone} selected={selectedId === item.id} onPress={() => onSelect(item.id)} />)}</ScrollView>
  </View>;
}

function ChatPane({ api, compact, onBack, selected, messages, highlightedMessageId, apiBaseUrl, loading, loadingOlder, hasMoreMessages, draft, onDraftChange, composerFocusRequest, onLoadOlder, onSend, onAskClaire, assistantPanelAvailable = false, assistantPanelVisible = false, onToggleAssistantPanel, error }: { api: ClaireApi | null; compact: boolean; onBack?: () => void; selected: Conversation | null; messages: DesktopMessage[]; highlightedMessageId: string | null; apiBaseUrl: string; loading: boolean; loadingOlder: boolean; hasMoreMessages: boolean; draft: string; onDraftChange: (value: string) => void; composerFocusRequest: number; onLoadOlder: () => void; onSend: () => void; onAskClaire: () => void; assistantPanelAvailable?: boolean; assistantPanelVisible?: boolean; onToggleAssistantPanel?: () => void; error: string | null }) {
  const messageListRef = useRef<ScrollView>(null);
  const composerRef = useRef<TextInput>(null);
  const messageOffsets = useRef<Record<string, number>>({});
  const [showConversationSettings, setShowConversationSettings] = useState(false);
  const latestIncoming = useMemo(() => [...messages].reverse().find((message) => !message.from_me && Boolean(message.content?.trim())) || null, [messages]);
  useEffect(() => {
    if (!highlightedMessageId) return;
    const offset = messageOffsets.current[highlightedMessageId];
    if (offset === undefined) return;
    const task = setTimeout(() => messageListRef.current?.scrollTo({ y: Math.max(0, offset - space[4]), animated: true }), 0);
    return () => clearTimeout(task);
  }, [highlightedMessageId, messages]);
  useEffect(() => { setShowConversationSettings(false); }, [selected?.id]);
  useEffect(() => {
    if (!composerFocusRequest || !selected) return;
    const task = setTimeout(() => composerRef.current?.focus(), 0);
    return () => clearTimeout(task);
  }, [composerFocusRequest, selected]);
  if (!selected) return <View style={[styles.chatPane, compact && styles.chatPaneCompact, styles.emptyPane]}><ClaireText variant="sectionTitle">Select a conversation</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Your synced chats will appear here.</ClaireText></View>;
  return <View style={[styles.chatPane, compact && styles.chatPaneCompact]}>
    <View style={styles.chatHeader}><View style={styles.contactHeader}>{onBack ? <ClaireButton variant="quiet" onPress={onBack}>Back</ClaireButton> : null}<ClaireAvatar initials={selected.initials} source={selected.avatarUrl ? { uri: selected.avatarUrl } : undefined} size={40} tone={selected.tone} /><View><ClaireText variant="sectionTitle">{selected.name}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{selected.platform} · Active now</ClaireText></View></View><View style={styles.chatActions}><ClaireIconButton accessibilityLabel="Chat settings" onPress={() => setShowConversationSettings((current) => !current)}><SlidersHorizontal size={17} color={colors.ink} /></ClaireIconButton><ClaireIconButton accessibilityLabel="Open Ask Claire" onPress={onAskClaire}><Sparkles size={17} color={colors.focus} /></ClaireIconButton>{assistantPanelAvailable ? <ClaireIconButton accessibilityLabel={assistantPanelVisible ? 'Collapse conversation assistant' : 'Show conversation assistant'} onPress={onToggleAssistantPanel}>{assistantPanelVisible ? <PanelRightClose size={17} color={colors.ink} /> : <PanelRightOpen size={17} color={colors.ink} />}</ClaireIconButton> : null}</View></View>
    <QuickContextRibbon message={latestIncoming} conversationName={selected.name} onAsk={() => assistantPanelAvailable ? onToggleAssistantPanel?.() : onAskClaire()} />
    {showConversationSettings ? <ConversationSettings api={api} chatId={selected.id} chatName={selected.name} onClose={() => setShowConversationSettings(false)} /> : null}
    <ScrollView ref={messageListRef} contentContainerStyle={styles.messageList}>{hasMoreMessages ? <ClaireButton variant="quiet" disabled={loadingOlder} onPress={onLoadOlder}>{loadingOlder ? 'Loading older messages…' : 'Load older messages'}</ClaireButton> : null}{loading ? <LoadingRow label="Loading messages…" /> : null}{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}{!loading && !error && messages.length === 0 ? <ClaireText variant="bodySmall" style={styles.muted}>No messages in this conversation yet.</ClaireText> : null}{messages.map((message) => <View key={message.id} onLayout={(event) => { messageOffsets.current[message.id] = event.nativeEvent.layout.y; }} style={[styles.messageWrap, message.from_me && styles.messageWrapMine, message.id === highlightedMessageId && styles.messageWrapHighlighted]}>{!message.from_me ? <ClaireText variant="label" style={styles.messageSender}>{message.contact_name || selected.name}</ClaireText> : null}<ClaireMessageBubble fromMe={message.from_me}><MediaMessage message={message} apiBaseUrl={apiBaseUrl} /></ClaireMessageBubble><ClaireText variant="bodySmall" style={styles.messageTime}>{new Date(message.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</ClaireText></View>)}</ScrollView>
    <ReplyOptions api={api} target={latestIncoming} chatType={selected.isGroup ? 'group' : 'individual'} onUse={onDraftChange} />
    <View style={styles.composer}><TextInput ref={composerRef} accessibilityLabel={`Message ${selected.name}`} multiline onChangeText={onDraftChange} placeholder={`Message ${selected.name}…`} placeholderTextColor={colors.neutral[400]} style={styles.composerInput} value={draft} /><ClaireButton disabled={!draft.trim()} onPress={onSend} accessibilityLabel="Send message">Send</ClaireButton></View>
  </View>;
}

function QuickContextRibbon({ message, conversationName, onAsk }: { message: DesktopMessage | null; conversationName: string; onAsk: () => void }) {
  const summary = message?.content?.trim() ? message.content.trim() : `Use Claire to review the latest messages with ${conversationName}.`;
  return <View style={styles.quickContextRibbon}><View style={styles.quickContextMark}><Sparkles size={14} color={colors.focus} /></View><View style={styles.quickContextCopy}><ClaireText variant="monoLabel" style={styles.quickContextLabel}>QUICK CONTEXT</ClaireText><ClaireText variant="bodySmall" numberOfLines={1}>{summary}</ClaireText></View><Pressable accessibilityRole="button" accessibilityLabel={`Ask Claire about ${conversationName}`} onPress={onAsk} style={({ pressed }) => [styles.quickContextAction, pressed && styles.pressed]}><ClaireText variant="label" style={styles.quickContextActionText}>Ask Claire</ClaireText></Pressable></View>;
}

function ConversationSettings({ api, chatId, chatName, onClose }: { api: ClaireApi | null; chatId: string; chatName: string; onClose: () => void }) {
  const [relationship, setRelationship] = useState('');
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    api?.getConversationSettings(chatId).then((settings) => {
      if (!active) return;
      setRelationship(settings.profile?.relationship_context || '');
      setInstruction(settings.profile?.ai_instruction || '');
    }).catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Unable to load chat settings.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api, chatId]);
  const save = async () => {
    if (!api) return;
    setSaving(true); setError(null);
    try { await api.updateConversationProfile(chatId, { relationship_context: relationship.trim(), ai_instruction: instruction.trim() }); onClose(); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save chat settings.'); } finally { setSaving(false); }
  };
  return <ClaireCard tone="cream" style={styles.conversationSettings}><View style={styles.surfaceHeader}><View><ClaireText variant="sectionTitle">Claire in {chatName}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>These instructions are used for replies and chat-scoped Ask Claire questions.</ClaireText></View><ClaireButton variant="quiet" onPress={onClose}>Close</ClaireButton></View>{loading ? <LoadingRow label="Loading chat settings…" /> : <><ClaireField label="Relationship context" value={relationship} onChangeText={setRelationship} placeholder="Friend, client, family…" style={styles.conversationField} /><ClaireField label="Claire’s instruction for this chat" value={instruction} onChangeText={setInstruction} multiline numberOfLines={3} placeholder="Keep this professional, don’t suggest flirting, use informal Spanish…" style={styles.conversationInstruction} />{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}<View style={styles.chatActions}><ClaireButton variant="secondary" disabled={saving} onPress={() => { save().catch(() => undefined); }}>{saving ? 'Saving…' : 'Save instructions'}</ClaireButton></View></>}</ClaireCard>;
}

function ReplyOptions({ api, target, chatType, onUse }: { api: ClaireApi | null; target: DesktopMessage | null; chatType: 'individual' | 'group'; onUse: (value: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (forceRefresh = false) => {
    if (!api || !target?.content?.trim()) return;
    setLoading(true); setError(null);
    try { setSuggestions((await api.generateReplyOptions(target.id, target.content, chatType, forceRefresh)).suggestions.slice(0, 3)); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Reply options are unavailable.'); } finally { setLoading(false); }
  }, [api, chatType, target?.content, target?.id]);
  useEffect(() => { setSuggestions([]); setError(null); load().catch(() => undefined); }, [load]);
  if (!target) return null;
  return <View style={styles.suggestionArea}>{loading ? <View style={styles.suggestionRow}><ActivityIndicator size="small" color={colors.focus} /><ClaireText variant="bodySmall" style={styles.muted}>Claire is drafting a few natural replies…</ClaireText></View> : null}{suggestions.length ? <><View style={styles.suggestionHeader}><ClaireStatusPill tone="info">Reply options</ClaireStatusPill><ClaireButton variant="quiet" onPress={() => { load(true).catch(() => undefined); }}>Regenerate</ClaireButton></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionOptions}>{suggestions.map((suggestion, index) => <Pressable key={`${target.id}-${index}-${suggestion}`} accessibilityRole="button" accessibilityLabel={`Use reply option ${index + 1}`} onPress={() => onUse(suggestion)} style={({ pressed }) => [styles.suggestionOption, pressed && styles.pressed]}><ClaireText variant="bodySmall" numberOfLines={3}>{suggestion}</ClaireText><ClaireText variant="label" style={styles.replyLabel}>Use</ClaireText></Pressable>)}</ScrollView></> : null}{error ? <View style={styles.suggestionRow}><ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText><ClaireButton variant="quiet" onPress={() => { load(true).catch(() => undefined); }}>Retry</ClaireButton></View> : null}</View>;
}

function mediaUrl(value: string, apiBaseUrl: string) {
  if (value.startsWith('mxc://')) {
    const [, server, mediaId] = value.match(/^mxc:\/\/([^/]+)\/(.+)$/) || [];
    return server && mediaId ? `${apiBaseUrl.replace(/\/$/, '')}/media/${encodeURIComponent(server)}/${encodeURIComponent(mediaId)}` : null;
  }
  if (value.startsWith('/media/')) return `${apiBaseUrl.replace(/\/$/, '')}${value}`;
  return value;
}

function MediaMessage({ message, apiBaseUrl }: { message: DesktopMessage; apiBaseUrl: string }) {
  const [failed, setFailed] = useState(false);
  const url = message.media_url ? mediaUrl(message.media_url, apiBaseUrl) : null;
  const isImage = Boolean(url && (message.media_mime_type?.startsWith('image/') || message.content_type === 'image'));
  if (isImage && !failed) return <Image accessibilityLabel="Message image" source={{ uri: url! }} onError={() => setFailed(true)} style={styles.mediaImage} />;
  if (url && failed) return <ClaireText variant="bodySmall" style={styles.muted}>Media unavailable</ClaireText>;
  if (url) return <ClaireText variant="bodySmall">{message.content || 'Media message'}</ClaireText>;
  return <ClaireText variant="body">{message.content || 'Message unavailable'}</ClaireText>;
}

function LoadingRow({ label }: { label: string }) {
  return <View style={styles.loadingRow}><ActivityIndicator color={colors.ink} /><ClaireText variant="bodySmall" style={styles.muted}>{label}</ClaireText></View>;
}

function promiseConversation(promise: DesktopPromise) {
  return promise.chat?.name || promise.contact?.name || promise.contact?.inferred_name || promise.contact_name || 'Conversation';
}

function deadlineLabel(value?: string | null) {
  if (!value) return null;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days < 0) return `${Math.abs(days)}d overdue`;
  return `Due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function PromisesPane({ api, onOpenChat }: { api: ClaireApi | null; onOpenChat: (chatId: string) => void }) {
  const [promises, setPromises] = useState<DesktopPromise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try { setPromises(await api.getPromises()); setError(null); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load promises.'); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);
  const open = promises.filter((item) => item.status === 'pending' || item.status === 'overdue');
  return <ScrollView style={styles.promisesPane} contentContainerStyle={styles.promisesContent}><View style={styles.promiseHeader}><View><ClaireText variant="screenTitle">Promises</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{open.length} open commitments to follow up on</ClaireText></View><ClaireButton variant="secondary" onPress={() => { refresh().catch(() => undefined); }}>Refresh</ClaireButton></View>{loading ? <LoadingRow label="Loading promises…" /> : null}{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}{!loading && !error && !open.length ? <ClaireText variant="bodySmall" style={styles.muted}>No open promises right now.</ClaireText> : null}{open.map((promise) => { const conversation = promiseConversation(promise); const avatarUrl = promise.contact?.avatar_url || promise.chat?.contact?.avatar_url || undefined; const overdue = promise.status === 'overdue' || Boolean(promise.deadline && new Date(promise.deadline).getTime() < Date.now()); return <Pressable key={promise.id} accessibilityRole={promise.chat_id ? 'button' : undefined} disabled={!promise.chat_id} onPress={() => promise.chat_id && onOpenChat(promise.chat_id)} style={({ pressed }) => [styles.promiseCard, overdue && styles.promiseCardOverdue, pressed && promise.chat_id && styles.pressed]}><View style={styles.promisePerson}><ClaireAvatar initials={initials(conversation)} source={avatarUrl ? { uri: avatarUrl } : undefined} tone="sky" size={36} /><View style={styles.promisePersonText}><ClaireText variant="body" style={styles.conversationName}>{conversation}</ClaireText><ClaireText variant="monoLabel" style={styles.platformLabel}>{promise.platform || promise.chat?.platform || 'Conversation'}</ClaireText></View><ClaireText variant="label" style={styles.replyLabel}>{promise.chat_id ? 'Reply' : ''}</ClaireText></View><ClaireText variant="body" style={styles.promiseText}>{promise.content}</ClaireText>{deadlineLabel(promise.deadline) ? <ClaireText variant="bodySmall" style={overdue ? styles.overdueText : styles.muted}>{deadlineLabel(promise.deadline)}</ClaireText> : null}</Pressable>; })}</ScrollView>;
}

function HomePane({ api, companion, conversations, onOpenChat, onOpenInbox }: { api: ClaireApi | null; companion: CompanionStatus | null; conversations: Conversation[]; onOpenChat: (chatId: string) => void; onOpenInbox: () => void }) {
  const [promises, setPromises] = useState<DesktopPromise[]>([]);
  const [loadingPromises, setLoadingPromises] = useState(Boolean(api));
  useEffect(() => {
    let active = true;
    if (!api) return () => { active = false; };
    api.getPromises().then((next) => active && setPromises(next)).catch(() => undefined).finally(() => active && setLoadingPromises(false));
    return () => { active = false; };
  }, [api]);
  const unread = conversations.reduce((total, conversation) => total + (conversation.unread || 0), 0);
  const needsReply = conversations.filter((conversation) => Boolean(conversation.unread)).slice(0, 3);
  const openPromises = promises.filter((item) => item.status === 'pending' || item.status === 'overdue').slice(0, 3);
  const latest = conversations[0];
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const firstName = 'Luc';
  const companionHealthy = companion?.health === 'healthy';
  return <ScrollView style={styles.surfacePane} contentContainerStyle={styles.dailyBriefContent}><View style={styles.dailyBriefHeader}><View><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>{today.toUpperCase()}</ClaireText><ClaireText variant="screenTitle">Good morning, {firstName}.</ClaireText><ClaireText variant="body" style={styles.muted}>{unread ? `${unread} messages need your attention.` : 'Your inbox is clear for now.'}</ClaireText></View><ClaireButton variant="secondary" onPress={onOpenInbox}>Open Inbox</ClaireButton></View><View style={styles.dailyBriefGrid}><ClaireCard tone="sky" style={[styles.dailyBriefCard, styles.dailyBriefHero]}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>CONTINUE CONVERSATION</ClaireText><ClaireText variant="sectionTitle">{'Pick up where\nyou left off.'}</ClaireText>{latest ? <Pressable accessibilityRole="button" onPress={() => onOpenChat(latest.id)} style={({ pressed }) => [styles.dailyBriefRow, pressed && styles.pressed]}><ClaireAvatar initials={latest.initials} source={latest.avatarUrl ? { uri: latest.avatarUrl } : undefined} size={34} tone={latest.tone} /><View style={styles.dailyBriefRowCopy}><ClaireText variant="body" style={styles.conversationName}>{latest.name}</ClaireText><ClaireText variant="bodySmall" numberOfLines={1} style={styles.muted}>{latest.preview}</ClaireText></View><ClaireText variant="label" style={styles.replyLabel}>Continue</ClaireText></Pressable> : <ClaireText variant="bodySmall" style={styles.muted}>Your latest conversation will appear here after sync.</ClaireText>}</ClaireCard><ClaireCard tone="paper" style={styles.dailyBriefCard}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>CONNECTION HEALTH</ClaireText><View style={styles.healthRow}><View style={[styles.healthDot, companionHealthy && styles.healthDotHealthy]} /><View style={styles.dailyBriefRowCopy}><ClaireText variant="body" style={styles.conversationName}>This Mac</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{companionHealthy ? 'Companion ready for local connections' : 'Companion setup pending'}</ClaireText></View><ClaireStatusPill tone={companionHealthy ? 'success' : 'warning'}>{companionHealthy ? 'Healthy' : 'Action'}</ClaireStatusPill></View><ClaireText variant="bodySmall" style={styles.muted}>Platform status and recovery stay available in Connections.</ClaireText></ClaireCard><ClaireCard tone="paper" style={styles.dailyBriefCard}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>NEEDS A REPLY</ClaireText>{needsReply.length ? needsReply.map((conversation) => <Pressable key={conversation.id} accessibilityRole="button" onPress={() => onOpenChat(conversation.id)} style={({ pressed }) => [styles.dailyBriefRow, pressed && styles.pressed]}><ClaireAvatar initials={conversation.initials} source={conversation.avatarUrl ? { uri: conversation.avatarUrl } : undefined} size={30} tone={conversation.tone} /><View style={styles.dailyBriefRowCopy}><ClaireText variant="bodySmall" style={styles.conversationName}>{conversation.name}</ClaireText><ClaireText variant="bodySmall" numberOfLines={1} style={styles.muted}>{conversation.preview}</ClaireText></View><ClaireText variant="label" style={styles.replyLabel}>Reply</ClaireText></Pressable>) : <ClaireText variant="bodySmall" style={styles.muted}>No unread conversations right now.</ClaireText>}</ClaireCard><ClaireCard tone="paper" style={styles.dailyBriefCard}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>OPEN PROMISES</ClaireText>{loadingPromises ? <LoadingRow label="Loading promises…" /> : openPromises.length ? openPromises.map((promise) => <Pressable key={promise.id} accessibilityRole={promise.chat_id ? 'button' : undefined} disabled={!promise.chat_id} onPress={() => promise.chat_id && onOpenChat(promise.chat_id)} style={({ pressed }) => [styles.dailyBriefRow, pressed && promise.chat_id && styles.pressed]}><View style={styles.promiseDot} /><View style={styles.dailyBriefRowCopy}><ClaireText variant="bodySmall" style={styles.conversationName}>{promise.content}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{deadlineLabel(promise.deadline) || 'Open commitment'}</ClaireText></View><ClaireText variant="label" style={styles.replyLabel}>Open</ClaireText></Pressable>) : <ClaireText variant="bodySmall" style={styles.muted}>No open promises right now.</ClaireText>}</ClaireCard></View></ScrollView>;
}

function PeoplePane({ conversations, onOpenChat }: { conversations: Conversation[]; onOpenChat: (chatId: string) => void }) {
  const people = conversations.filter((conversation) => !conversation.isGroup);
  return <ScrollView style={styles.surfacePane} contentContainerStyle={styles.surfaceContent}><ClaireText variant="screenTitle">People</ClaireText><ClaireText variant="body" style={styles.muted}>Open a person’s conversation to review context, promises, and Claire’s guidance.</ClaireText><View style={styles.surfaceSection}>{people.length ? people.map((person) => <Pressable key={person.id} accessibilityRole="button" onPress={() => onOpenChat(person.id)} style={({ pressed }) => [styles.peopleRow, pressed && styles.pressed]}><ClaireAvatar initials={person.initials} source={person.avatarUrl ? { uri: person.avatarUrl } : undefined} size={46} tone={person.tone} /><View style={styles.conversationContent}><ClaireText variant="body" style={styles.conversationName}>{person.name}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{person.platform} conversation</ClaireText></View><ClaireText variant="label" style={styles.replyLabel}>Open</ClaireText></Pressable>) : <ClaireText variant="bodySmall" style={styles.muted}>People will appear here once conversations sync.</ClaireText>}</View></ScrollView>;
}

function AssistantPane({ api, selected, onOpenMessage }: { api: ClaireApi | null; selected: Conversation | null; onOpenMessage: (chatId: string, messageId: string) => void }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [scopeSelected, setScopeSelected] = useState(Boolean(selected));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ask = async () => {
    if (!api || !question.trim()) return;
    setLoading(true); setError(null);
    try {
      let activeThreadId = threadId;
      if (!activeThreadId) {
        const thread = await api.createAssistantThread();
        activeThreadId = thread.id;
        setThreadId(thread.id);
      }
      setAnswer(await api.askAssistant(activeThreadId, question.trim(), scopeSelected && selected ? [selected.id] : []));
      setQuestion('');
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : 'Ask Claire could not answer right now.');
    } finally { setLoading(false); }
  };
  return <ScrollView style={styles.surfacePane} contentContainerStyle={styles.surfaceContent}><View style={styles.surfaceHeader}><View><ClaireText variant="screenTitle">Ask Claire</ClaireText><ClaireText variant="body" style={styles.muted}>Search your private connected conversations. Claire only answers from cited messages.</ClaireText></View><ClaireStatusPill tone="info">Read only</ClaireStatusPill></View>{selected ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: scopeSelected }} onPress={() => setScopeSelected((current) => !current)} style={({ pressed }) => [styles.scopeControl, pressed && styles.pressed]}><View style={[styles.scopeCheck, scopeSelected && styles.scopeCheckSelected]}><ClaireText variant="label">{scopeSelected ? '✓' : ''}</ClaireText></View><View><ClaireText variant="body">Prioritize {selected.name}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Other relevant chats remain secondary sources.</ClaireText></View></Pressable> : null}<ClaireCard tone="paper" style={styles.assistantCard}><TextInput accessibilityLabel="Ask Claire a question" multiline value={question} onChangeText={setQuestion} placeholder="Ask about a plan, a message, or a person…" placeholderTextColor={colors.neutral[400]} style={styles.assistantInput} /><View style={styles.assistantActions}><ClaireText variant="bodySmall" style={styles.muted}>Claire never sends messages from here.</ClaireText><ClaireButton disabled={!question.trim() || loading} onPress={() => { ask().catch(() => undefined); }}>{loading ? 'Thinking…' : 'Ask Claire'}</ClaireButton></View></ClaireCard>{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}{answer ? <View style={styles.answerArea}><ClaireCard tone="cream"><ClaireText variant="body">{answer.answer}</ClaireText></ClaireCard><View style={styles.surfaceHeader}><ClaireText variant="sectionTitle">Sources</ClaireText><ClaireStatusPill tone={answer.indexing.status === 'ready' ? 'success' : 'warning'}>{answer.indexing.status === 'ready' ? 'Index ready' : `Index ${answer.indexing.indexedCount}/${answer.indexing.totalCount}`}</ClaireStatusPill></View>{answer.citations.slice(0, 3).map((citation) => <Pressable key={citation.messageId} accessibilityRole="button" onPress={() => onOpenMessage(citation.chatId, citation.messageId)} style={({ pressed }) => [styles.citationCard, pressed && styles.pressed]}><View style={styles.citationHeader}><ClaireText variant="label" style={styles.citationName}>{citation.fromMe ? 'You' : citation.senderName}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{new Date(citation.timestamp).toLocaleDateString()} · {citation.platform}</ClaireText></View><ClaireText variant="bodySmall">{citation.excerpt}</ClaireText><ClaireText variant="label" style={styles.replyLabel}>Open conversation</ClaireText></Pressable>)}</View> : null}</ScrollView>;
}

function connectionSummary(status: DesktopPlatformStatus | undefined) {
  const connected = status?.sessions.find((session) => session.status === 'connected');
  if (connected) return { tone: 'success' as const, label: 'Connected', detail: connected.platformUsername || connected.phoneNumber || 'Connected to Claire' };
  const pending = status?.sessions.find((session) => ['awaiting_auth', 'authenticating', 'reconnecting', 'initializing'].includes(session.status));
  if (pending) return { tone: 'warning' as const, label: 'Needs attention', detail: pending.error || 'Connection setup is in progress.' };
  return { tone: 'neutral' as const, label: 'Not connected', detail: 'No connection on this Claire account yet.' };
}

function pendingWhatsAppCode(status: DesktopPlatformStatus | undefined) {
  const pending = status?.sessions.find((session) => ['awaiting_auth', 'authenticating', 'reconnecting', 'initializing'].includes(session.status));
  return pending?.authData?.pairingCode || null;
}

function ConnectionsPane({ companion, companionNotice, api, apiUrl, accessToken }: { companion: CompanionStatus | null; companionNotice: string | null; api: ClaireApi | null; apiUrl: string; accessToken: string }) {
  const [connectingInstagram, setConnectingInstagram] = useState(false);
  const [instagramNotice, setInstagramNotice] = useState<string | null>(null);
  const [whatsAppPhoneNumber, setWhatsAppPhoneNumber] = useState('');
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);
  const [whatsAppNotice, setWhatsAppNotice] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [definitions, setDefinitions] = useState<DesktopPlatformDefinition[]>([]);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [requestedPlatformIds, setRequestedPlatformIds] = useState<string[]>([]);
  const [requestingInterest, setRequestingInterest] = useState(false);
  const [interestNotice, setInterestNotice] = useState<string | null>(null);
  const [platformStatuses, setPlatformStatuses] = useState<Record<string, DesktopPlatformStatus>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(Boolean(api));
  const [statusError, setStatusError] = useState<string | null>(null);
  const refreshStatuses = useCallback(async () => {
    if (!api) return;
    setLoadingStatuses(true);
    try {
      const [catalog, interests, statuses] = await Promise.all([
        api.getPlatformDefinitions(),
        api.getPlatformInterest(),
        Promise.all(['whatsapp', 'telegram', 'instagram'].map((platform) => api.getPlatformStatus(platform))),
      ]);
      setDefinitions(catalog);
      setRequestedPlatformIds(interests);
      setSelectedPlatformId((current) => current && catalog.some((item) => item.id === current) ? current : (catalog.find((item) => item.supportStatus === 'available')?.id || catalog[0]?.id || null));
      setPlatformStatuses(Object.fromEntries(statuses.map((status) => [status.platform, status])));
      setStatusError(null);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Unable to load connection status.');
    } finally { setLoadingStatuses(false); }
  }, [api]);
  useEffect(() => { refreshStatuses().catch(() => undefined); }, [refreshStatuses]);
  const instagram = connectionSummary(platformStatuses.instagram);
  const whatsapp = connectionSummary(platformStatuses.whatsapp);
  const telegram = connectionSummary(platformStatuses.telegram);
  const ready = companion?.health === 'healthy';
  const selectedPlatform = definitions.find((item) => item.id === selectedPlatformId) || null;
  useEffect(() => {
    const savedCode = pendingWhatsAppCode(platformStatuses.whatsapp);
    if (savedCode) setPairingCode(savedCode);
  }, [platformStatuses.whatsapp]);
  useEffect(() => {
    if (!api || whatsapp.label !== 'Needs attention') return;
    const timer = setInterval(() => { refreshStatuses().catch(() => undefined); }, 3000);
    return () => clearInterval(timer);
  }, [api, refreshStatuses, whatsapp.label]);
  const connectInstagram = async () => {
    setConnectingInstagram(true); setInstagramNotice(null);
    try {
      const result = await companionBridge.connectInstagram(apiUrl, accessToken);
      setInstagramNotice(result.userLoginId ? `Instagram connected as ${result.userLoginId}.` : 'Instagram connected.');
      await refreshStatuses();
    } catch (error) {
      setInstagramNotice(error instanceof Error ? error.message : 'Instagram could not connect.');
    } finally { setConnectingInstagram(false); }
  };
  const connectWhatsApp = async () => {
    if (!api || !whatsAppPhoneNumber.trim()) return;
    setConnectingWhatsApp(true); setWhatsAppNotice(null);
    try {
      const connection = await api.connectWhatsApp(whatsAppPhoneNumber.trim());
      const code = connection.authData?.pairingCode;
      setPairingCode(code || null);
      setWhatsAppNotice(code ? 'Enter this code in WhatsApp to finish linking Claire Desktop.' : 'Waiting for WhatsApp to provide a pairing code…');
      await refreshStatuses();
    } catch (error) {
      await refreshStatuses().catch(() => undefined);
      setWhatsAppNotice(error instanceof Error ? error.message : 'WhatsApp could not start pairing.');
    } finally { setConnectingWhatsApp(false); }
  };
  const requestInterest = async () => {
    if (!api || !selectedPlatform) return;
    setRequestingInterest(true); setInterestNotice(null);
    try {
      await api.requestPlatformInterest(selectedPlatform.id);
      setRequestedPlatformIds((current) => current.includes(selectedPlatform.id) ? current : [...current, selectedPlatform.id]);
      setInterestNotice(`You’re on the ${selectedPlatform.name} waitlist.`);
    } catch (error) {
      setInterestNotice(error instanceof Error ? error.message : 'Unable to save your interest right now.');
    } finally { setRequestingInterest(false); }
  };

  return <ScrollView style={styles.surfacePane} contentContainerStyle={styles.connectionsContent}>
    <View style={styles.surfaceHeader}><View style={styles.surfaceHeaderCopy}><ClaireText variant="screenTitle">Connections</ClaireText><ClaireText variant="body" style={styles.muted}>Choose a platform to connect, or request one from Claire’s roadmap.</ClaireText></View><ClaireIconButton accessibilityLabel="Refresh connection status" disabled={loadingStatuses} onPress={() => { refreshStatuses().catch(() => undefined); }}>{loadingStatuses ? <ActivityIndicator size="small" color={colors.ink} /> : <RefreshCw size={17} color={colors.ink} />}</ClaireIconButton></View>
    {statusError && !definitions.length ? <ClaireCard tone="paper" style={{ flexDirection: 'row', alignItems: 'center', columnGap: space[3], maxWidth: 720 }}><CircleHelp size={20} color={colors.warning} /><View style={{ flex: 1, minWidth: 0, rowGap: space[1] }}><ClaireText variant="sectionTitle">Connections need a server update</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>This signed-in desktop client expects Claire’s canonical platform catalog. The server responded “{statusError}”, so setup controls stay disabled instead of showing incomplete connection flows.</ClaireText></View><ClaireButton variant="secondary" onPress={() => { refreshStatuses().catch(() => undefined); }}>Try again</ClaireButton></ClaireCard> : null}
    {statusError && definitions.length ? <ClaireText variant="bodySmall" style={styles.errorText}>{statusError}</ClaireText> : null}
    {loadingStatuses && !definitions.length ? <LoadingRow label="Loading Claire’s platform catalog…" /> : null}
    {definitions.length ? <View style={styles.connectionsWorkspace}>
      <View style={styles.platformCatalog}><View style={styles.catalogHeading}><ClaireText variant="sectionTitle">Connect now</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Current integrations and local beta access.</ClaireText></View><View style={styles.platformGrid}>{definitions.filter((item) => item.supportStatus === 'available' || item.supportStatus === 'beta').map((item) => <PlatformCatalogCard key={item.id} definition={item} selected={item.id === selectedPlatformId} summary={item.id === 'whatsapp' ? whatsapp : item.id === 'instagram' ? instagram : item.id === 'telegram' ? telegram : { tone: ready ? 'success' : 'warning', label: ready ? 'Local beta ready' : 'Local beta', detail: companionNotice || companion?.detail || 'Mac companion setup required.' }} requested={false} onPress={() => { setSelectedPlatformId(item.id); setInterestNotice(null); }} />)}</View><View style={styles.catalogHeading}><ClaireText variant="sectionTitle">On the roadmap</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Tell us what you want next. We’ll never ask for account credentials here.</ClaireText></View><View style={styles.platformGrid}>{definitions.filter((item) => item.supportStatus === 'planned' || item.supportStatus === 'unavailable').map((item) => <PlatformCatalogCard key={item.id} definition={item} selected={item.id === selectedPlatformId} requested={requestedPlatformIds.includes(item.id)} onPress={() => { setSelectedPlatformId(item.id); setInterestNotice(null); }} />)}</View></View>
      {selectedPlatform ? <ConnectionDetail definition={selectedPlatform} requested={requestedPlatformIds.includes(selectedPlatform.id)} companion={companion} companionNotice={companionNotice} summary={selectedPlatform.id === 'whatsapp' ? whatsapp : selectedPlatform.id === 'instagram' ? instagram : selectedPlatform.id === 'telegram' ? telegram : undefined} whatsAppPhoneNumber={whatsAppPhoneNumber} onWhatsAppPhoneNumber={setWhatsAppPhoneNumber} connectingWhatsApp={connectingWhatsApp} pairingCode={pairingCode} whatsAppNotice={whatsAppNotice} onConnectWhatsApp={connectWhatsApp} connectingInstagram={connectingInstagram} instagramNotice={instagramNotice} onConnectInstagram={connectInstagram} onOpenMacPermissions={() => { companionBridge.openSystemSettings('full_disk_access').catch(() => undefined); }} requestingInterest={requestingInterest} interestNotice={interestNotice} onRequestInterest={requestInterest} /> : null}
    </View> : null}
  </ScrollView>;
}

function PlatformCatalogCard({ definition, selected, summary, requested, onPress }: { definition: DesktopPlatformDefinition; selected: boolean; summary?: { tone: 'success' | 'warning' | 'neutral'; label: string; detail: string }; requested: boolean; onPress: () => void }) {
  const tone = summary?.tone || (definition.supportStatus === 'unavailable' ? 'neutral' : 'warning');
  const label = summary?.label || (requested ? 'Requested' : definition.supportStatus === 'planned' ? 'Planned' : 'Unavailable');
  return <Pressable accessibilityRole="button" accessibilityLabel={`Select ${definition.name}`} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.platformCatalogCard, selected && styles.platformCatalogCardSelected, pressed && styles.pressed]}><View style={[styles.platformIcon, { backgroundColor: definition.accent }]}>{definition.iconUrl ? <Image source={{ uri: definition.iconUrl }} style={styles.platformIconImage} /> : <ClaireText variant="label">{definition.mark}</ClaireText>}</View><View style={styles.platformCardCopy}><ClaireText variant="body" numberOfLines={1} style={styles.conversationName}>{definition.name}</ClaireText><ClaireText variant="bodySmall" numberOfLines={1} style={styles.muted}>{definition.setupLabel}</ClaireText><ClaireStatusPill tone={tone}>{label}</ClaireStatusPill></View></Pressable>;
}

function ConnectionDetail({ definition, requested, companion, companionNotice, summary, whatsAppPhoneNumber, onWhatsAppPhoneNumber, connectingWhatsApp, pairingCode, whatsAppNotice, onConnectWhatsApp, connectingInstagram, instagramNotice, onConnectInstagram, onOpenMacPermissions, requestingInterest, interestNotice, onRequestInterest }: { definition: DesktopPlatformDefinition; requested: boolean; companion: CompanionStatus | null; companionNotice: string | null; summary?: { tone: 'success' | 'warning' | 'neutral'; label: string; detail: string }; whatsAppPhoneNumber: string; onWhatsAppPhoneNumber: (value: string) => void; connectingWhatsApp: boolean; pairingCode: string | null; whatsAppNotice: string | null; onConnectWhatsApp: () => Promise<void>; connectingInstagram: boolean; instagramNotice: string | null; onConnectInstagram: () => Promise<void>; onOpenMacPermissions: () => void; requestingInterest: boolean; interestNotice: string | null; onRequestInterest: () => Promise<void> }) {
  const isConnectableHere = definition.id === 'whatsapp' || definition.id === 'instagram' || definition.id === 'imessage';
  return <ClaireCard tone="paper" style={styles.connectionDetail}><View style={styles.connectionDetailHead}><View style={[styles.platformIcon, { backgroundColor: definition.accent }]}>{definition.iconUrl ? <Image source={{ uri: definition.iconUrl }} style={styles.platformIconImage} /> : <ClaireText variant="label">{definition.mark}</ClaireText>}</View><View style={styles.connectionDetailCopy}><ClaireText variant="sectionTitle">{definition.name}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{definition.runtimeLabel}</ClaireText></View></View><ClaireText variant="bodySmall" style={styles.muted}>{definition.detail}</ClaireText><View style={styles.connectionMeta}><ClaireText variant="monoLabel" style={styles.contextLabel}>SETUP</ClaireText><ClaireText variant="bodySmall">{definition.authSummary}</ClaireText></View>{summary ? <ClaireStatusPill tone={summary.tone}>{summary.label}</ClaireStatusPill> : null}{definition.id === 'whatsapp' && summary?.label !== 'Connected' ? <><ClaireField accessibilityLabel="WhatsApp phone number" autoCapitalize="none" keyboardType="phone-pad" onChangeText={onWhatsAppPhoneNumber} placeholder="+15166100494" style={styles.connectionInput} value={whatsAppPhoneNumber} /><ClaireButton disabled={connectingWhatsApp || !whatsAppPhoneNumber.trim()} onPress={() => { onConnectWhatsApp().catch(() => undefined); }}>{connectingWhatsApp ? 'Starting pairing…' : pairingCode ? 'Get a new code' : 'Connect WhatsApp'}</ClaireButton>{pairingCode ? <View style={styles.pairingCode}><ClaireText variant="label" style={styles.pairingCodeLabel}>Pairing code</ClaireText><ClaireText variant="screenTitle" style={styles.pairingCodeText}>{pairingCode}</ClaireText></View> : null}{whatsAppNotice ? <ClaireText variant="bodySmall" style={whatsAppNotice.startsWith('Enter this') || whatsAppNotice.startsWith('Waiting') ? styles.successText : styles.errorText}>{whatsAppNotice}</ClaireText> : null}</> : null}{definition.id === 'instagram' ? <><ClaireText variant="bodySmall" style={styles.muted}>Sign in in Claire’s private Instagram window. Claire never asks you to copy cookies or share a password with us.</ClaireText><ClaireButton disabled={connectingInstagram || summary?.label === 'Connected'} onPress={() => { onConnectInstagram().catch(() => undefined); }}>{connectingInstagram ? 'Waiting for Instagram…' : summary?.label === 'Connected' ? 'Instagram connected' : 'Connect Instagram'}</ClaireButton>{instagramNotice ? <ClaireText variant="bodySmall" style={instagramNotice.startsWith('Instagram connected') ? styles.successText : styles.errorText}>{instagramNotice}</ClaireText> : null}</> : null}{definition.id === 'imessage' ? <><ClaireStatusPill tone={companion?.health === 'healthy' ? 'success' : 'warning'}>{companion?.health === 'healthy' ? 'This Mac is syncing' : 'Local beta setup'}</ClaireStatusPill><ClaireText variant="bodySmall" style={styles.muted}>{companionNotice || companion?.detail || 'Claire needs Messages permissions on this Mac before it can sync.'}</ClaireText><ClaireButton variant="secondary" onPress={onOpenMacPermissions}>Open Mac permissions</ClaireButton></> : null}{!isConnectableHere && definition.supportStatus === 'available' ? <ClaireText variant="bodySmall" style={styles.muted}>This integration is available in Claire, but this desktop build does not yet provide its setup flow. We won’t show a non-working connect button.</ClaireText> : null}{!isConnectableHere && (definition.supportStatus === 'planned' || definition.supportStatus === 'unavailable') ? <><ClaireText variant="bodySmall" style={styles.muted}>Joining the waitlist records only that you want {definition.name}; it does not connect an account or promise a release date.</ClaireText><ClaireButton variant={requested ? 'quiet' : 'secondary'} disabled={requested || requestingInterest} onPress={() => { onRequestInterest().catch(() => undefined); }}>{requested ? 'Requested' : requestingInterest ? 'Saving…' : 'Join waitlist'}</ClaireButton>{interestNotice ? <ClaireText variant="bodySmall" style={interestNotice.startsWith('You’re') ? styles.successText : styles.errorText}>{interestNotice}</ClaireText> : null}</> : null}</ClaireCard>;
}

function SettingsPane({ api, onNotificationPreferenceChange }: { api: ClaireApi | null; onNotificationPreferenceChange: (enabled: boolean) => void }) {
  const [preferences, setPreferences] = useState<DesktopPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<'not_determined' | 'authorized' | 'provisional' | 'denied'>('not_determined');
  useEffect(() => {
    if (!api) return;
    let active = true;
    Promise.all([api.getPreferences(), companionBridge.getNotificationRegistration()]).then(([next, registration]) => {
      if (active) { setPreferences(next); setNotificationPermission(registration.status); if (registration.error) setError(registration.error); }
    }).catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Unable to load settings.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api]);
  const save = async (updates: Partial<DesktopPreferences>) => {
    if (!api || !preferences) return;
    setSaving(true); setError(null);
    try { const next = await api.updatePreferences(updates); setPreferences(next); onNotificationPreferenceChange(next.notification_enabled); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save settings.'); } finally { setSaving(false); }
  };
  const nextTone = () => {
    const tones: DesktopPreferences['tone'][] = ['friendly', 'casual', 'professional', 'formal', 'empathetic'];
    return tones[(tones.indexOf(preferences?.tone || 'friendly') + 1) % tones.length];
  };
  const nextStyle = () => {
    const styles: DesktopPreferences['response_style'][] = ['concise', 'balanced', 'detailed'];
    return styles[(styles.indexOf(preferences?.response_style || 'concise') + 1) % styles.length];
  };
  const requestMacNotificationPermission = async () => {
    try {
      const granted = await companionBridge.requestNotificationPermission();
      const registration = await companionBridge.getNotificationRegistration();
      setNotificationPermission(registration.status);
      if (!granted) setError('Allow notifications for Claire Desktop in macOS System Settings to receive alerts here.');
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to request macOS notification permission.'); }
  };
  return <ScrollView style={styles.surfacePane} contentContainerStyle={styles.surfaceContent}><ClaireText variant="screenTitle">Settings</ClaireText><ClaireText variant="body" style={styles.muted}>These account preferences apply to every Claire client.</ClaireText>{loading ? <LoadingRow label="Loading settings…" /> : null}{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}{preferences ? <View style={styles.surfaceSection}><ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="sectionTitle">AI replies</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Keep the defaults short and natural; adjust them per conversation when needed.</ClaireText><View style={styles.settingsActions}><ClaireButton variant="quiet" disabled={saving} onPress={() => { save({ tone: nextTone() }).catch(() => undefined); }}>Tone: {preferences.tone}</ClaireButton><ClaireButton variant="quiet" disabled={saving} onPress={() => { save({ response_style: nextStyle() }).catch(() => undefined); }}>Length: {preferences.response_style}</ClaireButton></View></ClaireCard><ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="sectionTitle">Notifications</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Incoming message alerts are coordinated by Claire across your signed-in devices. macOS permission: {notificationPermission.replace('_', ' ')}.</ClaireText><View style={styles.settingsActions}><ClaireButton variant={preferences.notification_enabled ? 'secondary' : 'quiet'} disabled={saving} onPress={() => { save({ notification_enabled: !preferences.notification_enabled }).catch(() => undefined); }}>{preferences.notification_enabled ? 'Notifications on' : 'Notifications off'}</ClaireButton>{notificationPermission === 'denied' ? <ClaireButton variant="quiet" onPress={() => { Linking.openURL('x-apple.systempreferences:com.apple.Notifications-Settings.extension').catch(() => undefined); }}>Open System Settings</ClaireButton> : <ClaireButton variant="quiet" onPress={() => { requestMacNotificationPermission().catch(() => undefined); }}>{notificationPermission === 'authorized' || notificationPermission === 'provisional' ? 'macOS alerts allowed' : 'Allow macOS alerts'}</ClaireButton>}</View></ClaireCard><ClaireCard tone="cream" style={styles.settingsCard}><ClaireText variant="sectionTitle">Keyboard shortcuts</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Use ⌘1 Home, ⌘2 Inbox, ⌘3 Promises, ⌘4 People, ⌘K Ask Claire, ⌘N to compose, and ⌘, Settings. Shortcuts change the active desktop workspace without interrupting a message you are typing.</ClaireText></ClaireCard><ClaireCard tone="cream" style={styles.settingsCard}><ClaireText variant="sectionTitle">Privacy-first desktop</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>The Mac keeps its device identity and companion credential in Keychain. The React Native layer can access only its Supabase session and non-secret iMessage sync checkpoints.</ClaireText></ClaireCard></View> : null}</ScrollView>;
}

function LoadingScreen({ label }: { label: string }) {
  return <SafeAreaView style={styles.authScreen}><ActivityIndicator size="large" color={colors.ink} /><ClaireText variant="body" style={styles.authLabel}>{label}</ClaireText></SafeAreaView>;
}

function ConfigurationScreen({ error }: { error?: string | null }) {
  return <SafeAreaView style={styles.authScreen}><ClaireCard tone="cream" style={styles.authCard}><ClaireText variant="screenTitle">Claire Desktop</ClaireText><ClaireText variant="body" style={styles.authBody}>This development build is missing its signed runtime configuration.</ClaireText>{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}<ClaireText variant="bodySmall" style={styles.muted}>Release builds receive the Claire API and Supabase public configuration at build time. No account credentials belong in this app bundle.</ClaireText></ClaireCard></SafeAreaView>;
}

function SignInScreen({ auth, error, onError }: { auth: DesktopAuth; error: string | null; onError: (value: string | null) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitPassword = async () => {
    setSubmitting(true); onError(null);
    const { error: signInError } = await auth.client.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) onError(signInError.message);
    setSubmitting(false);
  };
  const submitGoogle = async () => {
    setSubmitting(true); onError(null);
    try { await signInWithGoogle(auth.client); } catch (signInError) { onError(signInError instanceof Error ? signInError.message : 'Google sign-in could not start.'); }
    setSubmitting(false);
  };
  return <SafeAreaView style={styles.authScreen}><ClaireCard tone="paper" style={styles.authCard}><View style={styles.brandMark}><ClaireText variant="sectionTitle">C</ClaireText></View><ClaireText variant="screenTitle">Welcome back</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Sign in to your private Claire workspace.</ClaireText><ClaireField autoCapitalize="none" accessibilityLabel="Email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email" style={styles.authInput} value={email} /><ClaireField accessibilityLabel="Password" onChangeText={setPassword} placeholder="Password" secureTextEntry style={styles.authInput} value={password} />{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}<ClaireButton disabled={submitting || !email.trim() || !password} onPress={() => { submitPassword().catch(() => undefined); }}>Sign in</ClaireButton><ClaireButton variant="secondary" disabled={submitting} onPress={() => { submitGoogle().catch(() => undefined); }}>Continue with Google</ClaireButton></ClaireCard></SafeAreaView>;
}

function ConversationAssistantInspector({ api, selected, width, onCollapse, onOpenMessage }: { api: ClaireApi | null; selected: Conversation | null; width: number; onCollapse: () => void; onOpenMessage: (chatId: string, messageId: string) => void }) {
  const [history, setHistory] = useState<ConversationAssistantThread | null>(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setHistory(null); setQuestion(''); setError(null);
    if (!api || !selected) return () => { active = false; };
    setLoadingHistory(true);
    api.getConversationAssistant(selected.id)
      .then((next) => active && setHistory(next))
      .catch((loadError) => {
        const message = loadError instanceof Error ? loadError.message : 'Unable to load this Claire chat.';
        if (active && !/no saved thread yet/i.test(message)) setError(message);
      })
      .finally(() => active && setLoadingHistory(false));
    return () => { active = false; };
  }, [api, selected]);

  const ask = async () => {
    if (!api || !selected || !question.trim()) return;
    setLoading(true); setError(null);
    try {
      const next = await api.askConversationAssistant(selected.id, question.trim());
      setHistory({ thread: next.thread, turns: next.turns });
      setQuestion('');
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : 'Claire could not answer right now.');
    } finally { setLoading(false); }
  };

  const clear = async () => {
    if (!api || !selected) return;
    setClearing(true); setError(null);
    try {
      await api.clearConversationAssistant(selected.id);
      setHistory(null);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Unable to clear this Claire chat.');
    } finally { setClearing(false); }
  };
  const confirmClear = () => {
    Alert.alert('Clear this Claire chat?', 'This removes Claire’s saved questions and answers for this conversation. It will not affect any messages.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear chat', style: 'destructive', onPress: () => { clear().catch(() => undefined); } },
    ]);
  };

  return <View style={[styles.inspector, { width }]} testID="conversation-assistant-inspector">
    <View style={styles.inspectorHeader}><View style={styles.inspectorHeaderCopy}><View style={styles.inspectorTitleRow}><View style={styles.inspectorMark}><Sparkles size={15} color={colors.focus} /></View><ClaireText variant="sectionTitle">Ask Claire</ClaireText></View><ClaireText variant="bodySmall" numberOfLines={2} style={styles.muted}>{selected ? `About ${selected.name}` : 'Select a conversation to ask Claire about it.'}</ClaireText></View><View style={styles.inspectorHeaderActions}>{history ? <ClaireIconButton accessibilityLabel="Clear Claire chat" disabled={clearing} onPress={confirmClear}><Trash2 size={16} color={colors.neutral[600]} /></ClaireIconButton> : null}<ClaireIconButton accessibilityLabel="Collapse conversation assistant" onPress={onCollapse}><PanelRightClose size={17} color={colors.ink} /></ClaireIconButton></View></View>
    <ScrollView contentContainerStyle={styles.inspectorContent} keyboardShouldPersistTaps="handled">
      {!selected ? <View style={styles.inspectorEmpty}><MessageCircle size={22} color={colors.neutral[400]} /><ClaireText variant="body">Pick a conversation</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Claire will keep a private, saved thread for that chat.</ClaireText></View> : null}
      {selected && loadingHistory ? <LoadingRow label="Loading Claire’s notes…" /> : null}
      {selected && !loadingHistory && !history ? <View style={styles.inspectorEmpty}><ClaireText variant="body">Ask about this conversation</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Claire will answer only from messages in {selected.name} and cite what it found.</ClaireText></View> : null}
      {history?.turns.map((turn) => <AssistantTurnCard key={turn.id} turn={turn} onOpenMessage={onOpenMessage} />)}
      {loading ? <View style={styles.inspectorThinking}><ActivityIndicator size="small" color={colors.focus} /><ClaireText variant="bodySmall" style={styles.muted}>Claire is reading this conversation…</ClaireText></View> : null}
      {error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}
    </ScrollView>
    {selected ? <View style={styles.inspectorComposer}><TextInput accessibilityLabel={`Ask Claire about ${selected.name}`} multiline value={question} onChangeText={setQuestion} placeholder={`Ask about ${selected.name}…`} placeholderTextColor={colors.neutral[400]} style={styles.inspectorInput} /><ClaireIconButton accessibilityLabel="Ask Claire" disabled={!question.trim() || loading} onPress={() => { ask().catch(() => undefined); }}><Send size={17} color={colors.ink} /></ClaireIconButton></View> : null}
  </View>;
}

function AssistantTurnCard({ turn, onOpenMessage }: { turn: AssistantTurn; onOpenMessage: (chatId: string, messageId: string) => void }) {
  const isUser = turn.role === 'user';
  return <View style={[styles.inspectorTurn, isUser && styles.inspectorTurnUser]}><ClaireText variant="label" style={isUser ? styles.inspectorTurnUserLabel : styles.inspectorTurnClaireLabel}>{isUser ? 'You' : 'Claire'}</ClaireText><ClaireCard tone={isUser ? 'sky' : 'paper'} style={styles.inspectorTurnCard}><ClaireText variant="bodySmall">{turn.content}</ClaireText></ClaireCard>{!isUser && turn.citations?.length ? <View style={styles.inspectorSources}><ClaireText variant="monoLabel" style={styles.contextLabel}>SOURCES</ClaireText>{turn.citations.slice(0, 3).map((citation) => <AssistantCitationCard key={citation.messageId} citation={citation} onOpenMessage={onOpenMessage} compact />)}</View> : null}</View>;
}

function AssistantCitationCard({ citation, onOpenMessage, compact = false }: { citation: AssistantCitation; onOpenMessage: (chatId: string, messageId: string) => void; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open source from ${citation.fromMe ? 'you' : citation.senderName}`} onPress={() => onOpenMessage(citation.chatId, citation.messageId)} style={({ pressed }) => [styles.citationCard, compact && styles.citationCardCompact, pressed && styles.pressed]}><View style={styles.citationHeader}><ClaireText variant="label" style={styles.citationName}>{citation.fromMe ? 'You' : citation.senderName}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{new Date(citation.timestamp).toLocaleDateString()} · {citation.platform}</ClaireText></View><ClaireText variant="bodySmall" numberOfLines={compact ? 3 : undefined}>{citation.excerpt}</ClaireText><ClaireText variant="label" style={styles.replyLabel}>Open conversation</ClaireText></Pressable>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, desktopTitleBar: { height: 42, minHeight: 42, backgroundColor: colors.paper, borderBottomWidth: 1, borderColor: colors.neutral[200], flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3] }, titleBarBrand: { width: 140, justifyContent: 'center' }, titleBarMark: { width: 24, height: 24, borderRadius: 8, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }, titleBarTitle: { flex: 1, alignItems: 'center' }, titleBarTitleText: { fontWeight: '700', color: colors.neutral[600] }, titleBarActions: { width: 140, flexDirection: 'row', justifyContent: 'flex-end', columnGap: space[2] }, appFrame: { flex: 1, flexDirection: 'row', minWidth: 0 }, navigationRail: { width: 148, backgroundColor: colors.ink, padding: space[4], justifyContent: 'space-between' }, navigationRailCompact: { width: 68, paddingHorizontal: space[2], alignItems: 'center' }, brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', marginBottom: space[8] }, navButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: radius.control, marginBottom: space[1] }, navButtonCompact: { width: 42, alignItems: 'center', paddingHorizontal: 0 }, navButtonActive: { backgroundColor: colors.neutral[800] }, navText: { color: colors.neutral[300] }, navTextActive: { color: colors.lime }, syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning, alignSelf: 'center', marginBottom: space[3] }, syncDotLive: { backgroundColor: colors.success }, profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: space[4], columnGap: space[2] }, profileRowCompact: { marginTop: space[2] }, profileName: { color: colors.paper }, pressed: { opacity: 0.8 },
  conversationPane: { backgroundColor: colors.paper, borderRightWidth: 1, borderColor: colors.neutral[200], minWidth: 0 }, conversationPaneCompact: { flex: 1, width: undefined, borderRightWidth: 0 }, paneResizeHandle: { width: 8, backgroundColor: colors.neutral[100], borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.neutral[200] }, paneHeader: { padding: space[4], paddingBottom: space[3], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', columnGap: space[2] }, paneHeaderCopy: { flex: 1, minWidth: 0 }, muted: { color: colors.neutral[600] }, inboxSearch: { minHeight: 44, marginHorizontal: space[4], paddingLeft: space[3], paddingRight: space[2], borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.neutral[50], flexDirection: 'row', alignItems: 'center', columnGap: space[2] }, inboxSearchInput: { flex: 1, minWidth: 0, height: 42, color: colors.ink, fontFamily: 'System', fontSize: 14, lineHeight: 20, paddingVertical: 0, textAlignVertical: 'center' }, searchShortcut: { minWidth: 32, height: 24, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }, searchShortcutText: { color: colors.neutral[600] }, inboxFilters: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[1], rowGap: space[1], paddingHorizontal: space[4], paddingTop: space[3] }, inboxFilter: { minHeight: 28, borderRadius: radius.pill, paddingHorizontal: space[3], justifyContent: 'center', backgroundColor: colors.neutral[100] }, inboxFilterActive: { backgroundColor: colors.ink }, inboxFilterText: { color: colors.neutral[600] }, inboxFilterActiveText: { color: colors.lime }, conversationList: { padding: space[2], paddingTop: space[3] }, conversationContent: { flex: 1, minWidth: 0 }, conversationName: { fontWeight: '700', flexShrink: 1 }, platformLabel: { color: colors.neutral[600], marginTop: 4 }, unread: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, unreadText: { color: colors.lime },
  chatPane: { flex: 1, minWidth: 400, backgroundColor: colors.cream }, chatPaneCompact: { minWidth: 0 }, chatHeader: { minHeight: 76, paddingHorizontal: space[6], borderBottomWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, contactHeader: { flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, chatActions: { flexDirection: 'row', alignItems: 'center', columnGap: space[2] }, quickContextRibbon: { minHeight: 56, paddingHorizontal: space[5], backgroundColor: colors.sky, borderBottomWidth: 1, borderColor: colors.infoBorder, flexDirection: 'row', alignItems: 'center', columnGap: space[2] }, quickContextMark: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, quickContextCopy: { flex: 1, minWidth: 0, rowGap: 2 }, quickContextLabel: { color: colors.focus }, quickContextAction: { minHeight: 28, paddingHorizontal: space[3], borderWidth: 1, borderColor: colors.focusSoft, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, quickContextActionText: { color: colors.focus }, conversationSettings: { marginHorizontal: space[5], marginTop: space[3], rowGap: space[3] }, conversationField: { backgroundColor: colors.paper, fontFamily: 'System', textAlignVertical: 'center', paddingVertical: 0 }, conversationInstruction: { minHeight: 84, fontFamily: 'System', textAlignVertical: 'top', paddingVertical: space[2] }, messageList: { padding: space[6] }, contextCard: { maxWidth: 500, borderColor: colors.focusSoft, padding: space[3], marginBottom: space[4] }, contextLabel: { color: colors.neutral[600], marginBottom: space[1] }, messageWrap: { alignSelf: 'flex-start', maxWidth: '76%', marginBottom: space[4] }, messageWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' }, messageWrapHighlighted: { borderRadius: radius.card, backgroundColor: colors.sky, padding: space[2], marginHorizontal: -space[2] }, messageSender: { color: colors.neutral[600], marginLeft: space[2], marginBottom: 3 }, bubble: { borderRadius: radius.card, paddingHorizontal: space[4], paddingVertical: space[3] }, bubbleTheirs: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }, bubbleMine: { backgroundColor: colors.lime }, mediaImage: { width: 280, height: 210, borderRadius: radius.control, resizeMode: 'cover' }, messageTime: { color: colors.neutral[600], marginTop: 4, marginHorizontal: space[2] }, suggestionArea: { backgroundColor: colors.sky, borderTopWidth: 1, borderColor: colors.neutral[200], paddingVertical: space[2], rowGap: space[2] }, suggestionRow: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], paddingHorizontal: space[6], paddingBottom: space[2] }, suggestionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6] }, suggestionOptions: { paddingHorizontal: space[6], columnGap: space[2] }, suggestionOption: { width: 218, minHeight: 76, justifyContent: 'space-between', borderRadius: radius.control, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], padding: space[3] }, composer: { flexDirection: 'row', columnGap: space[3], alignItems: 'flex-end', padding: space[5], backgroundColor: colors.paper, borderTopWidth: 1, borderColor: colors.neutral[200] }, composerInput: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[200], color: colors.ink, fontFamily: 'System', lineHeight: 20, paddingHorizontal: space[3], paddingVertical: space[2], fontSize: 14, textAlignVertical: 'top' },
  inspector: { backgroundColor: colors.paper, borderLeftWidth: 1, borderColor: colors.neutral[200], minWidth: 0 }, inspectorHeader: { minHeight: 82, padding: space[4], paddingBottom: space[3], flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: space[2], borderBottomWidth: 1, borderColor: colors.neutral[200] }, inspectorHeaderCopy: { flex: 1, minWidth: 0 }, inspectorHeaderActions: { flexDirection: 'row', columnGap: space[1] }, inspectorTitleRow: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], marginBottom: 4 }, inspectorMark: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.infoSurface, borderRadius: 9 }, inspectorContent: { padding: space[3], rowGap: space[3] }, inspectorEmpty: { paddingVertical: space[6], alignItems: 'center', rowGap: space[2], textAlign: 'center' }, inspectorThinking: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], paddingVertical: space[2] }, inspectorComposer: { borderTopWidth: 1, borderColor: colors.neutral[200], padding: space[3], flexDirection: 'row', alignItems: 'flex-end', columnGap: space[2] }, inspectorInput: { flex: 1, minHeight: 42, maxHeight: 100, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, color: colors.ink, fontFamily: 'Avenir Next', fontSize: 14, lineHeight: 20, paddingHorizontal: space[3], paddingVertical: space[2], textAlignVertical: 'top' }, inspectorTurn: { alignItems: 'flex-start', rowGap: 4 }, inspectorTurnUser: { alignItems: 'flex-end' }, inspectorTurnUserLabel: { color: colors.focus }, inspectorTurnClaireLabel: { color: colors.neutral[600] }, inspectorTurnCard: { padding: space[3], maxWidth: '100%' }, inspectorSources: { width: '100%', rowGap: space[2], marginTop: space[1] },
  emptyPane: { justifyContent: 'center', alignItems: 'center', rowGap: space[2] }, loadingRow: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], paddingVertical: space[4] }, errorText: { color: colors.danger, paddingVertical: space[2] }, successText: { color: colors.success, paddingVertical: space[2] },
  promisesPane: { flex: 1, minWidth: 620, backgroundColor: colors.cream }, promisesContent: { padding: space[6], maxWidth: 900 }, promiseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space[5] }, promiseCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderLeftWidth: 4, borderLeftColor: colors.warning, borderRadius: radius.card, padding: space[4], marginBottom: space[3] }, promiseCardOverdue: { borderLeftColor: colors.danger }, promisePerson: { flexDirection: 'row', alignItems: 'center', columnGap: space[3], marginBottom: space[3] }, promisePersonText: { flex: 1 }, replyLabel: { color: colors.focus }, promiseText: { fontWeight: '600', marginBottom: space[2] }, overdueText: { color: colors.danger },
  surfacePane: { flex: 1, minWidth: 620, backgroundColor: colors.cream }, surfaceContent: { padding: space[6], maxWidth: 920, rowGap: space[3] }, dailyBriefContent: { padding: space[6], maxWidth: 980, rowGap: space[5] }, dailyBriefHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: space[4] }, dailyBriefDate: { color: colors.neutral[600], marginBottom: space[1] }, dailyBriefGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], rowGap: space[3] }, dailyBriefCard: { width: 360, flexGrow: 1, minHeight: 190, rowGap: space[3] }, dailyBriefHero: { minHeight: 220, justifyContent: 'space-between' }, dailyBriefRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', columnGap: space[2], paddingVertical: space[1] }, dailyBriefRowCopy: { flex: 1, minWidth: 0, rowGap: 2 }, healthRow: { flexDirection: 'row', alignItems: 'center', columnGap: space[2] }, healthDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning }, healthDotHealthy: { backgroundColor: colors.success }, promiseDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.warning }, connectionsContent: { padding: space[5], rowGap: space[3] }, surfaceSection: { marginTop: space[4], rowGap: space[2] }, surfaceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', columnGap: space[3] }, surfaceHeaderCopy: { flex: 1, minWidth: 0 }, connectionsWorkspace: { flexDirection: 'row', alignItems: 'flex-start', columnGap: space[4] }, platformCatalog: { flex: 1, minWidth: 420, rowGap: space[3] }, catalogHeading: { marginTop: space[2], rowGap: 3 }, platformGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[2], rowGap: space[2] }, platformCatalogCard: { width: 210, minHeight: 88, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, padding: space[3], flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, platformCatalogCardSelected: { borderColor: colors.focus, borderWidth: 2, backgroundColor: colors.sky }, platformIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }, platformIconImage: { width: 22, height: 22, resizeMode: 'contain' }, platformCardCopy: { flex: 1, minWidth: 0, rowGap: 3 }, connectionDetail: { width: 330, minWidth: 300, rowGap: space[3] }, connectionDetailHead: { flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, connectionDetailCopy: { flex: 1, minWidth: 0 }, connectionMeta: { backgroundColor: colors.cream, borderRadius: radius.control, padding: space[3], rowGap: space[1] }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], rowGap: space[3], marginTop: space[3] }, summaryCard: { minWidth: 210, flexGrow: 1, rowGap: space[1] }, homeConversation: { minHeight: 62, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, padding: space[3], flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, peopleRow: { minHeight: 68, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, padding: space[3], flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, scopeControl: { flexDirection: 'row', alignItems: 'center', columnGap: space[3], backgroundColor: colors.sky, borderRadius: radius.control, padding: space[3], marginTop: space[3] }, scopeCheck: { width: 20, height: 20, borderWidth: 1, borderColor: colors.neutral[400], borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, scopeCheckSelected: { backgroundColor: colors.lime, borderColor: colors.ink }, assistantCard: { marginTop: space[3] }, assistantInput: { minHeight: 104, color: colors.ink, fontFamily: 'System', fontSize: 15, lineHeight: 22, textAlignVertical: 'top', padding: 0 }, assistantActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: space[3], borderTopWidth: 1, borderColor: colors.neutral[200], paddingTop: space[3], marginTop: space[3] }, answerArea: { marginTop: space[4], rowGap: space[3] }, citationCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.infoBorder, borderRadius: radius.control, padding: space[3], rowGap: space[1] }, citationCardCompact: { padding: space[2] }, citationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', columnGap: space[3] }, citationName: { color: colors.focus }, connectionCard: { marginTop: space[3], rowGap: space[2] }, connectionInput: { minHeight: 46, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.cream, color: colors.ink, fontFamily: 'System', fontSize: 15, lineHeight: 20, paddingHorizontal: space[3], paddingVertical: 0, textAlignVertical: 'center' }, pairingCode: { alignSelf: 'flex-start', backgroundColor: colors.sky, borderRadius: radius.control, paddingHorizontal: space[3], paddingVertical: space[2], rowGap: space[1] }, pairingCodeLabel: { color: colors.neutral[600] }, pairingCodeText: { letterSpacing: 2 }, settingsCard: { rowGap: space[3] }, settingsActions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[2], rowGap: space[2] },
  authScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream, padding: space[6] }, authCard: { width: 420, maxWidth: '100%', rowGap: space[4] }, authLabel: { marginTop: space[3] }, authBody: { marginTop: space[2] }, authInput: { minHeight: 46, borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[200], color: colors.ink, fontFamily: 'Avenir Next', fontSize: 14, lineHeight: 20, paddingHorizontal: space[3], paddingVertical: 0, textAlignVertical: 'center' },
});

const desktopShellStyles = StyleSheet.create({
  titleBarLeading: { width: 140, paddingLeft: 92, justifyContent: 'center' },
  titleBarIconButton: { width: 30, height: 30, borderRadius: 9 },
  navEntryContent: { flexDirection: 'row', alignItems: 'center', columnGap: space[2] },
});
