import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, LayoutAnimation, Linking, PanResponder, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { ChevronDown, ChevronUp, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react-native';
import {
  AdjustmentsHorizontalIcon as SlidersHorizontal,
  ArrowPathIcon as RefreshCw,
  ChatBubbleLeftRightIcon as MessageCircle,
  CheckBadgeIcon as ListTodo,
  Cog6ToothIcon as Settings,
  HomeIcon as Home,
  InboxIcon,
  MagnifyingGlassIcon as Search,
  PaperAirplaneIcon as Send,
  PlusIcon as Plus,
  QuestionMarkCircleIcon as CircleHelp,
  SparklesIcon as Sparkles,
  TrashIcon as Trash2,
  UserGroupIcon as Users,
} from 'react-native-heroicons/outline';
import { ClaireAvatar, ClaireButton, ClaireCard, ClaireConversationRow, ClaireField, ClaireIconButton, ClaireMessageBubble, ClaireStatusPill, ClaireText, colors, radius, space } from '@claire/design-system';
import { companionBridge, type CompanionStatus, type DesktopRuntimeConfig } from './native/CompanionBridge';
import { ClaireApi, type AssistantAnswer, type AssistantCitation, type AssistantThread, type AssistantTurn, type ConversationAssistantThread, type DesktopAccountProfile, type DesktopChat, type DesktopConversationSettings, type DesktopMessage, type DesktopPlatformDefinition, type DesktopPlatformStatus, type DesktopPreferences, type DesktopPromise } from './services/claire-api';
import { createDesktopAuth, exchangeDesktopCallback, signInWithGoogle, type DesktopAuth } from './services/auth';
import { clampDesktopPaneWidth, destinationForDesktopCommand, type DesktopDestination } from './services/desktop-navigation';
import { mergeChronologicalMessages } from './services/message-sync';

type Destination = Exclude<DesktopDestination, 'Connections'>;
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

function sameOutgoingMessage(left: DesktopMessage, right: DesktopMessage) {
  if (!left.from_me || !right.from_me || left.content !== right.content) return false;
  return Math.abs(Date.parse(left.timestamp) - Date.parse(right.timestamp)) < 120_000;
}

function reconcileDesktopMessages(current: DesktopMessage[], incoming: DesktopMessage[]) {
  const stillPending = current.filter((message) => message.delivery_state && !incoming.some((saved) => sameOutgoingMessage(message, saved)));
  return mergeChronologicalMessages(stillPending, incoming);
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
  const [_realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [_notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationDeviceId, setNotificationDeviceId] = useState<string | null>(null);
  const [companion, setCompanion] = useState<CompanionStatus | null>(null);
  const [companionNotice, setCompanionNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [composerFocusRequest, setComposerFocusRequest] = useState(0);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [conversationPaneWidth, setConversationPaneWidth] = useState(330);
  const [inspectorPaneWidth, setInspectorPaneWidth] = useState(290);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<'contact' | 'assistant'>('contact');
  const [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [peopleSelectionId, setPeopleSelectionId] = useState<string | null>(null);
  const [globalSearchSeed, setGlobalSearchSeed] = useState<string | null>(null);
  const syncingIMessageRef = useRef(false);
  const inspectorPreferenceLoadedRef = useRef(false);
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
  const openPerson = useCallback((chatId: string) => {
    setPeopleSelectionId(chatId);
    setDestination('People');
  }, []);
  const openGlobalSearch = useCallback((query = '') => {
    setGlobalSearchSeed(query.trim() || null);
    setDestination('Search');
  }, []);
  const clearGlobalSearchSeed = useCallback(() => setGlobalSearchSeed(null), []);

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
    setMessages((current) => reconcileDesktopMessages(current, latest));
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
    let enrollmentInFlight = false;
    const enrollCompanion = async () => {
      if (enrollmentInFlight) return;
      enrollmentInFlight = true;
      try {
        const enrollment = await companionBridge.enrolMacCompanion(auth.config.apiUrl, session.access_token, session.user.id);
        if (active) setNotificationDeviceId(enrollment.deviceId);
        await companionBridge.heartbeatMacCompanion(auth.config.apiUrl);
        if (active) setCompanion(await companionBridge.getStatus());
        await syncIMessageHistory();
        if (active) setCompanionNotice(null);
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
      } finally {
        enrollmentInFlight = false;
      }
    };
    enrollCompanion().catch(() => undefined);
    const keepAliveAndSync = async () => {
      try {
        await companionBridge.heartbeatMacCompanion(auth.config.apiUrl);
        if (active) setCompanion(await companionBridge.getStatus());
        await syncIMessageHistory();
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'iMessage sync needs attention.';
        if (/invalid device credential|device not found|not enrolled|enrolled again/i.test(detail)) {
          await enrollCompanion();
          return;
        }
        throw error;
      }
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
      companionBridge.getDesktopPreference(`${preferencePrefix}.inspector-mode`),
    ]).then(([savedDestination, savedConversationId, savedConversationPaneWidth, savedInspectorPaneWidth, savedInspectorMode]) => {
      if (!active) return;
      if (savedDestination && ['Home', 'Inbox', 'Promises', 'People', 'Search', 'Settings'].includes(savedDestination)) {
        setDestination(savedDestination as Destination);
      }
      if (savedConversationId) setSelectedConversationId(savedConversationId);
      const conversationWidth = Number(savedConversationPaneWidth);
      if (Number.isFinite(conversationWidth)) setConversationPaneWidth(clampDesktopPaneWidth(conversationWidth, 'conversation'));
      const inspectorWidth = Number(savedInspectorPaneWidth);
      if (Number.isFinite(inspectorWidth)) setInspectorPaneWidth(clampDesktopPaneWidth(inspectorWidth, 'inspector'));
      if (savedInspectorMode === 'contact' || savedInspectorMode === 'assistant') setInspectorMode(savedInspectorMode);
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
    companionBridge.setDesktopPreference(`${preferencePrefix}.inspector-mode`, inspectorMode).catch(() => undefined);
  }, [compactWindow, conversationPaneWidth, destination, inspectorMode, inspectorPaneWidth, selectedConversationId, session.user.id, workspaceHydrated]);

  // Keep the last inspector choice useful on another signed-in desktop too.
  // Native preferences make restoration instant; the account preference is the
  // durable cross-device source of truth.
  useEffect(() => {
    if (!api || compactWindow) return;
    let active = true;
    api.getPreferences().then((preferences) => {
      const saved = preferences.preferences?.desktop_inbox_inspector;
      if (active && (saved === 'contact' || saved === 'assistant')) setInspectorMode(saved);
      if (active) inspectorPreferenceLoadedRef.current = true;
    }).catch(() => { if (active) inspectorPreferenceLoadedRef.current = true; });
    return () => { active = false; };
  }, [api, compactWindow]);

  useEffect(() => {
    if (!api || compactWindow || !workspaceHydrated || !inspectorPreferenceLoadedRef.current) return;
    api.getPreferences()
      .then((preferences) => api.updatePreferences({ preferences: { ...(preferences.preferences || {}), desktop_inbox_inspector: inspectorMode } }))
      .catch(() => undefined);
  }, [api, compactWindow, inspectorMode, workspaceHydrated]);

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
    const content = draft.trim();
    const optimistic: DesktopMessage = {
      id: `local-${selected.platform}-${Date.now()}`,
      chat_id: selected.id,
      content,
      timestamp: new Date().toISOString(),
      from_me: true,
      content_type: 'text',
      delivery_state: 'sending',
    };
    const appendOptimisticMessage = () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages((current) => mergeChronologicalMessages(current, [optimistic]));
      setChats((current) => {
        const updated = current.find((chat) => chat.id === selected.id);
        if (!updated) return current;
        const next = {
          ...updated,
          last_message_at: optimistic.timestamp,
          latest_message: {
            content,
            content_type: 'text',
            timestamp: optimistic.timestamp,
            from_me: true,
          },
        };
        return [next, ...current.filter((chat) => chat.id !== selected.id)];
      });
      setDraft('');
    };
    try {
      if (selected.platform === 'imessage') {
        if (selected.isGroup) throw new Error('Direct iMessage sending currently supports one-to-one conversations only.');
        appendOptimisticMessage();
        await companionBridge.sendIMessage(selected.platformChatId, content);
        setCompanionNotice('Sent through Messages. Claire will confirm it on the next sync.');
        setTimeout(() => { syncIMessageHistory().catch((error) => setDataError(error instanceof Error ? error.message : 'Unable to confirm the iMessage send.')); }, 1_000);
        return;
      }
      appendOptimisticMessage();
      const sessionId = await api.getPlatformSession(selected.platform);
      if (!sessionId) throw new Error(`${selected.platform} is not connected on this account.`);
      await api.sendMessage(selected.platform, sessionId, selected.platformChatId, content);
      const [, savedMessages] = await Promise.all([refreshChats(), api.getMessages(selected.id)]);
      setMessages((current) => reconcileDesktopMessages(current, savedMessages));
    } catch (error) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMessages((current) => current.map((message) => message.id === optimistic.id ? { ...message, delivery_state: 'failed' } : message));
      setDataError(error instanceof Error ? error.message : 'Unable to send this message.');
    }
  };

  if (compactWindow) {
    return <SafeAreaView style={styles.safeArea} testID="claire-desktop-compact-chat"><StatusBar barStyle="dark-content" /><ChatPane api={api} compact selected={selected} messages={messages} highlightedMessageId={highlightedMessageId} apiBaseUrl={auth.config.apiUrl} loading={loadingMessages} loadingOlder={loadingOlderMessages} hasMoreMessages={hasMoreMessages} draft={draft} onDraftChange={setDraft} composerFocusRequest={composerFocusRequest} onLoadOlder={() => { loadOlderMessages().catch(() => undefined); }} onSend={() => { sendDraft().catch(() => undefined); }} onAskClaire={() => openGlobalSearch()} onOpenPerson={openPerson} error={dataError} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea} testID="claire-desktop-shell">
      <StatusBar barStyle="dark-content" />
      <DesktopTitleBar destination={destination} navigationCollapsed={usesCompactNavigation} onOpenSearch={openGlobalSearch} onOpenConnections={() => setDestination('Settings')} onToggleNavigation={() => setNavigationCollapsed((current) => !current)} />
      <View style={styles.appFrame}>
        <NavigationRail compact={usesCompactNavigation} destination={destination} onSelect={(next) => { setDestination(next); if (next === 'Inbox') setCompactChatOpen(false); }} />
        {destination === 'Home' ? <HomePane api={api} companion={companion} conversations={conversations} onOpenChat={openConversation} onOpenInbox={() => setDestination('Inbox')} /> : null}
        {destination === 'Promises' ? <PromisesPane api={api} onOpenChat={openConversation} /> : null}
        {destination === 'People' ? <PeoplePane api={api} conversations={conversations} selectedConversationId={peopleSelectionId} onOpenChat={openConversation} /> : null}
        {destination === 'Search' ? <AssistantPane api={api} selected={selected} initialQuestion={globalSearchSeed} onInitialQuestionConsumed={clearGlobalSearchSeed} onOpenMessage={(chatId, messageId) => { setSelectedConversationId(chatId); setHighlightedMessageId(messageId); setDestination('Inbox'); }} /> : null}
        {destination === 'Settings' ? <SettingsPane api={api} companion={companion} companionNotice={companionNotice} apiUrl={auth.config.apiUrl} accessToken={session.access_token} onNotificationPreferenceChange={setNotificationsEnabled} /> : null}
        {destination === 'Inbox' ? <>{(!usesCompactInbox || !compactChatOpen) ? <ConversationPane compact={usesCompactInbox} width={conversationPaneWidth} selectedId={selectedConversationId} onSelect={openConversation} onOpenSearch={() => openGlobalSearch()} conversations={conversations} loading={loadingChats} error={dataError} onRefresh={() => { refreshChats().catch(() => undefined); }} /> : null}{!usesCompactInbox ? <PaneResizeHandle accessibilityLabel="Resize conversation list" direction={1} initialWidth={conversationPaneWidth} onWidthChange={(next) => setConversationPaneWidth(clampDesktopPaneWidth(next, 'conversation'))} /> : null}{(!usesCompactInbox || compactChatOpen) ? <ChatPane api={api} compact={usesCompactInbox} onBack={usesCompactInbox ? () => setCompactChatOpen(false) : undefined} selected={selected} messages={messages} highlightedMessageId={highlightedMessageId} apiBaseUrl={auth.config.apiUrl} loading={loadingMessages} loadingOlder={loadingOlderMessages} hasMoreMessages={hasMoreMessages} draft={draft} onDraftChange={setDraft} composerFocusRequest={composerFocusRequest} onLoadOlder={() => { loadOlderMessages().catch(() => undefined); }} onSend={() => { sendDraft().catch(() => undefined); }} onAskClaire={() => { if (canShowInspector) { setInspectorMode('assistant'); setInspectorCollapsed(false); } else openGlobalSearch(); }} onOpenPerson={openPerson} assistantPanelAvailable={canShowInspector} assistantPanelVisible={showsInspector} onToggleAssistantPanel={() => setInspectorCollapsed((current) => !current)} error={dataError} /> : null}</> : null}
        {showsInspector ? <><PaneResizeHandle accessibilityLabel="Resize conversation inspector" direction={-1} initialWidth={inspectorPaneWidth} onWidthChange={(next) => setInspectorPaneWidth(clampDesktopPaneWidth(next, 'inspector'))} />{inspectorMode === 'assistant' ? <ConversationAssistantInspector api={api} selected={selected} width={inspectorPaneWidth} onCollapse={() => setInspectorCollapsed(true)} onOpenMessage={(chatId, messageId) => { setSelectedConversationId(chatId); setHighlightedMessageId(messageId); }} /> : <ConversationContactInspector api={api} selected={selected} width={inspectorPaneWidth} onOpenAssistant={() => setInspectorMode('assistant')} onOpenPerson={openPerson} />}</> : null}
      </View>
    </SafeAreaView>
  );
}

function DesktopTitleBar({ navigationCollapsed, onOpenSearch, onOpenConnections, onToggleNavigation }: { destination: Destination; navigationCollapsed: boolean; onOpenSearch: (query?: string) => void; onOpenConnections: () => void; onToggleNavigation: () => void }) {
  const [query, setQuery] = useState('');
  const submitSearch = () => onOpenSearch(query);
  return <View mouseDownCanMoveWindow style={[styles.desktopTitleBar, desktopShellStyles.titleBar]}>
    <View pointerEvents="none" style={[desktopShellStyles.titleBarSidebarSurface, navigationCollapsed && desktopShellStyles.titleBarSidebarSurfaceCollapsed]} />
    <View pointerEvents="none" style={[desktopShellStyles.titleBarRailSpacer, navigationCollapsed && desktopShellStyles.titleBarRailSpacerCollapsed]} />
    <View mouseDownCanMoveWindow={false} style={desktopShellStyles.titleBarToggle}><ClaireIconButton accessibilityLabel={navigationCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onPress={onToggleNavigation} style={desktopShellStyles.titleBarIconButton}>{navigationCollapsed ? <PanelLeftOpen size={17} color={colors.ink} /> : <PanelLeftClose size={17} color={colors.ink} />}</ClaireIconButton></View>
    <View pointerEvents="none" style={[desktopShellStyles.titleBarDivider, navigationCollapsed && desktopShellStyles.titleBarDividerCollapsed]} />
    <View mouseDownCanMoveWindow={false} style={desktopShellStyles.titleBarSearchArea}>
      <View style={desktopShellStyles.titleBarSearch}>
        <Search size={16} color={colors.neutral[600]} />
        <TextInput accessibilityLabel="Search everything" value={query} onChangeText={setQuery} onSubmitEditing={submitSearch} placeholder="Search everything" placeholderTextColor={colors.neutral[400]} returnKeyType="search" style={desktopShellStyles.titleBarSearchInput} />
        <Pressable accessibilityRole="button" accessibilityLabel="Search everything" onPress={submitSearch} style={({ pressed }) => [desktopShellStyles.titleBarSearchShortcut, pressed && styles.pressed]}><ClaireText variant="monoLabel" style={desktopShellStyles.titleBarSearchShortcutText}>⌘K</ClaireText></Pressable>
      </View>
    </View>
    <View mouseDownCanMoveWindow={false} style={styles.titleBarActions}><ClaireIconButton accessibilityLabel="Open connections" onPress={onOpenConnections} style={desktopShellStyles.titleBarIconButton}><Plus size={18} color={colors.ink} /></ClaireIconButton></View>
  </View>;
}

function NavigationRail({ compact, destination, onSelect }: { compact: boolean; destination: Destination; onSelect: (value: Destination) => void }) {
  // Keep Claire's assistant at the center of the primary navigation: it is a
  // first-class workspace, not a secondary utility hidden behind search.
  const entries: Destination[] = ['Home', 'Inbox', 'Promises', 'Search', 'People', 'Settings'];
  return <View style={[styles.navigationRail, desktopShellStyles.navigationRail, compact && styles.navigationRailCompact, compact && desktopShellStyles.navigationRailCompact]}>
    <View>
      {entries.map((entry) => <Pressable key={entry} accessibilityRole="button" accessibilityLabel={entry === 'Search' ? 'Ask Claire' : entry} accessibilityState={{ selected: destination === entry }} onPress={() => onSelect(entry)} style={({ pressed }) => [styles.navButton, desktopShellStyles.navButton, compact && styles.navButtonCompact, compact && desktopShellStyles.navButtonCompact, destination === entry && styles.navButtonActive, pressed && styles.pressed]}><View style={desktopShellStyles.navEntryContent}><NavigationIcon entry={entry} active={destination === entry} />{!compact ? <ClaireText variant="label" style={[styles.navText, destination === entry && styles.navTextActive]}>{entry === 'Search' ? 'Ask Claire' : entry}</ClaireText> : null}</View></Pressable>)}
    </View>
    <View />
  </View>;
}

function NavigationIcon({ entry, active }: { entry: Destination; active: boolean }) {
  const color = active ? colors.lime : colors.neutral[300];
  const Icon = entry === 'Home' ? Home : entry === 'Inbox' ? InboxIcon : entry === 'Promises' ? ListTodo : entry === 'People' ? Users : entry === 'Search' ? Sparkles : Settings;
  return <Icon size={22} color={color} strokeWidth={1.9} />;
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
  const [showNewConversation, setShowNewConversation] = useState(false);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleConversations = conversations.filter((conversation) => {
    const matchesQuery = !normalizedQuery || `${conversation.name} ${conversation.preview} ${conversation.platform}`.toLocaleLowerCase().includes(normalizedQuery);
    const matchesFilter = filter === 'all' || (filter === 'unread' && Boolean(conversation.unread)) || (filter === 'groups' && conversation.isGroup);
    return matchesQuery && matchesFilter;
  });
  const unreadCount = conversations.reduce((count, conversation) => count + (conversation.unread || 0), 0);
  return <View style={[styles.conversationPane, { width }, compact && styles.conversationPaneCompact]}>
    <View style={styles.paneHeader}><View style={styles.paneHeaderCopy}><ClaireText variant="screenTitle" numberOfLines={1}>Inbox</ClaireText><ClaireText variant="bodySmall" numberOfLines={1} style={styles.muted}>Your conversations, in one place</ClaireText></View><View style={styles.paneHeaderActions}><ClaireIconButton accessibilityLabel="New conversation" onPress={() => setShowNewConversation((current) => !current)}><Plus size={18} color={colors.ink} /></ClaireIconButton><ClaireIconButton accessibilityLabel="Refresh conversations" disabled={loading} onPress={onRefresh}>{loading ? <ActivityIndicator size="small" color={colors.ink} /> : <RefreshCw size={17} color={colors.ink} />}</ClaireIconButton></View></View>
    {showNewConversation ? <View style={styles.newConversationPicker}><View style={styles.newConversationHeader}><View><ClaireText variant="sectionTitle">New conversation</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Choose someone from your synced chats.</ClaireText></View><ClaireButton variant="quiet" onPress={() => setShowNewConversation(false)}>Close</ClaireButton></View>{conversations.slice(0, 4).map((conversation) => <Pressable key={conversation.id} accessibilityRole="button" onPress={() => { setShowNewConversation(false); onSelect(conversation.id); }} style={({ pressed }) => [styles.newConversationRow, pressed && styles.pressed]}><ClaireAvatar initials={conversation.initials} source={conversation.avatarUrl ? { uri: conversation.avatarUrl } : undefined} tone={conversation.tone} size={34} /><View style={styles.newConversationRowCopy}><ClaireText variant="body" numberOfLines={1}>{conversation.name}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{conversation.platform}</ClaireText></View><ClaireText variant="label" style={styles.replyLabel}>Message</ClaireText></Pressable>)}<ClaireText variant="bodySmall" style={styles.newConversationHint}>To message someone new, start the chat in its source app first; Claire will add it after sync.</ClaireText></View> : null}
    <View style={styles.inboxSearch}><Search size={17} color={colors.neutral[400]} /><TextInput accessibilityLabel="Search conversations" value={query} onChangeText={setQuery} placeholder="Search everything" placeholderTextColor={colors.neutral[400]} style={[styles.inboxSearchInput, desktopShellStyles.inboxSearchInput]} /><Pressable accessibilityRole="button" accessibilityLabel="Open global search" onPress={onOpenSearch} style={({ pressed }) => [styles.searchShortcut, pressed && styles.pressed]}><ClaireText variant="monoLabel" style={styles.searchShortcutText}>⌘K</ClaireText></Pressable></View>
    <View style={styles.inboxFilters}>{([['all', 'All'], ['unread', unreadCount ? `Unread ${unreadCount}` : 'Unread'], ['groups', 'Groups']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)} style={({ pressed }) => [styles.inboxFilter, filter === value && styles.inboxFilterActive, pressed && styles.pressed]}><ClaireText variant="label" style={filter === value ? styles.inboxFilterActiveText : styles.inboxFilterText}>{label}</ClaireText></Pressable>)}</View>
    <ScrollView contentContainerStyle={styles.conversationList} showsVerticalScrollIndicator={false}>{loading ? <LoadingRow label="Loading conversations…" /> : null}{!loading && error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}{!loading && !error && conversations.length === 0 ? <ClaireText variant="bodySmall" style={styles.muted}>No conversations have synced to this account yet.</ClaireText> : null}{!loading && !error && conversations.length > 0 && visibleConversations.length === 0 ? <ClaireText variant="bodySmall" style={styles.muted}>No conversations match this view.</ClaireText> : null}{visibleConversations.map((item) => <ClaireConversationRow key={item.id} name={item.name} preview={item.preview} timestamp={item.time} platform={item.platform} unreadCount={item.unread} initials={item.initials} avatarSource={item.avatarUrl ? { uri: item.avatarUrl } : undefined} avatarTone={item.tone} selected={selectedId === item.id} onPress={() => onSelect(item.id)} />)}</ScrollView>
  </View>;
}

function ChatPane({ api, compact, onBack, selected, messages, highlightedMessageId, apiBaseUrl, loading, loadingOlder, hasMoreMessages, draft, onDraftChange, composerFocusRequest, onLoadOlder, onSend, onAskClaire, onOpenPerson, assistantPanelAvailable = false, assistantPanelVisible = false, onToggleAssistantPanel, error }: { api: ClaireApi | null; compact: boolean; onBack?: () => void; selected: Conversation | null; messages: DesktopMessage[]; highlightedMessageId: string | null; apiBaseUrl: string; loading: boolean; loadingOlder: boolean; hasMoreMessages: boolean; draft: string; onDraftChange: (value: string) => void; composerFocusRequest: number; onLoadOlder: () => void; onSend: () => void; onAskClaire: () => void; onOpenPerson: (chatId: string) => void; assistantPanelAvailable?: boolean; assistantPanelVisible?: boolean; onToggleAssistantPanel?: () => void; error: string | null }) {
  const messageListRef = useRef<ScrollView>(null);
  const composerRef = useRef<TextInput>(null);
  const messageOffsets = useRef<Record<string, number>>({});
  const [showConversationSettings, setShowConversationSettings] = useState(false);
  const [showContactDetails, setShowContactDetails] = useState(false);
  const latestIncoming = useMemo(() => [...messages].reverse().find((message) => !message.from_me && Boolean(message.content?.trim())) || null, [messages]);
  useEffect(() => {
    if (!highlightedMessageId) return;
    const offset = messageOffsets.current[highlightedMessageId];
    if (offset === undefined) return;
    const task = setTimeout(() => messageListRef.current?.scrollTo({ y: Math.max(0, offset - space[4]), animated: true }), 0);
    return () => clearTimeout(task);
  }, [highlightedMessageId, messages]);
  useEffect(() => { setShowConversationSettings(false); setShowContactDetails(false); }, [selected?.id]);
  useEffect(() => {
    if (!composerFocusRequest || !selected) return;
    const task = setTimeout(() => composerRef.current?.focus(), 0);
    return () => clearTimeout(task);
  }, [composerFocusRequest, selected]);
  if (!selected) return <View style={[styles.chatPane, compact && styles.chatPaneCompact, styles.emptyPane]}><ClaireText variant="sectionTitle">Select a conversation</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Your synced chats will appear here.</ClaireText></View>;
  return <View style={[styles.chatPane, compact && styles.chatPaneCompact]}>
    <View style={styles.chatHeader}><View style={styles.contactHeader}>{onBack ? <ClaireButton variant="quiet" onPress={onBack}>Back</ClaireButton> : null}<ClaireAvatar initials={selected.initials} source={selected.avatarUrl ? { uri: selected.avatarUrl } : undefined} size={40} tone={selected.tone} /><View><ClaireText variant="sectionTitle">{selected.name}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{selected.platform} · Active now</ClaireText></View></View><View style={styles.chatActions}><ClaireIconButton accessibilityLabel="Show contact details" onPress={() => setShowContactDetails((current) => !current)}><Users size={18} color={colors.ink} /></ClaireIconButton><ClaireIconButton accessibilityLabel="Chat settings" onPress={() => setShowConversationSettings((current) => !current)}><SlidersHorizontal size={17} color={colors.ink} /></ClaireIconButton><ClaireIconButton accessibilityLabel="Open Ask Claire" onPress={onAskClaire}><Sparkles size={17} color={colors.focus} /></ClaireIconButton>{assistantPanelAvailable ? <ClaireIconButton accessibilityLabel={assistantPanelVisible ? 'Collapse conversation assistant' : 'Show conversation assistant'} onPress={onToggleAssistantPanel}>{assistantPanelVisible ? <PanelRightClose size={17} color={colors.ink} /> : <PanelRightOpen size={17} color={colors.ink} />}</ClaireIconButton> : null}</View></View>
    <QuickContextRibbon message={latestIncoming} conversationName={selected.name} onAsk={() => assistantPanelAvailable ? onToggleAssistantPanel?.() : onAskClaire()} />
    {showContactDetails ? <ContactDetails conversation={selected} onOpenPerson={onOpenPerson} /> : null}
    {showConversationSettings ? <ConversationSettings api={api} chatId={selected.id} chatName={selected.name} onClose={() => setShowConversationSettings(false)} /> : null}
    <ScrollView ref={messageListRef} contentContainerStyle={styles.messageList}>{hasMoreMessages ? <ClaireButton variant="quiet" disabled={loadingOlder} onPress={onLoadOlder}>{loadingOlder ? 'Loading older messages…' : 'Load older messages'}</ClaireButton> : null}{loading ? <LoadingRow label="Loading messages…" /> : null}{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}{!loading && !error && messages.length === 0 ? <ClaireText variant="bodySmall" style={styles.muted}>No messages in this conversation yet.</ClaireText> : null}{messages.map((message) => <View key={message.id} onLayout={(event) => { messageOffsets.current[message.id] = event.nativeEvent.layout.y; }} style={[styles.messageWrap, message.from_me && styles.messageWrapMine, message.id === highlightedMessageId && styles.messageWrapHighlighted, message.delivery_state === 'sending' && desktopReplyStyles.sendingMessage, message.delivery_state === 'failed' && desktopReplyStyles.failedMessage]}>{!message.from_me ? <ClaireText variant="label" style={styles.messageSender}>{message.contact_name || selected.name}</ClaireText> : null}<ClaireMessageBubble fromMe={message.from_me}><MediaMessage message={message} apiBaseUrl={apiBaseUrl} /></ClaireMessageBubble><ClaireText variant="bodySmall" style={styles.messageTime}>{message.delivery_state === 'sending' ? 'Sending…' : message.delivery_state === 'failed' ? 'Not sent' : new Date(message.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</ClaireText></View>)}</ScrollView>
    <ReplyOptions api={api} target={latestIncoming} chatType={selected.isGroup ? 'group' : 'individual'} onUse={onDraftChange} />
    <View style={styles.composer}><TextInput ref={composerRef} accessibilityLabel={`Message ${selected.name}`} multiline onChangeText={onDraftChange} placeholder={`Message ${selected.name}…`} placeholderTextColor={colors.neutral[400]} style={styles.composerInput} value={draft} /><ClaireButton disabled={!draft.trim()} onPress={onSend} accessibilityLabel="Send message">Send</ClaireButton></View>
  </View>;
}

function QuickContextRibbon({ message, conversationName, onAsk }: { message: DesktopMessage | null; conversationName: string; onAsk: () => void }) {
  const summary = message?.content?.trim() ? message.content.trim() : `Use Claire to review the latest messages with ${conversationName}.`;
  return <View style={styles.quickContextRibbon}><View style={styles.quickContextMark}><Sparkles size={14} color={colors.focus} /></View><View style={styles.quickContextCopy}><ClaireText variant="monoLabel" style={styles.quickContextLabel}>QUICK CONTEXT</ClaireText><ClaireText variant="bodySmall" numberOfLines={1}>{summary}</ClaireText></View><Pressable accessibilityRole="button" accessibilityLabel={`Ask Claire about ${conversationName}`} onPress={onAsk} style={({ pressed }) => [styles.quickContextAction, pressed && styles.pressed]}><ClaireText variant="label" style={styles.quickContextActionText}>Ask Claire</ClaireText></Pressable></View>;
}

function ContactDetails({ conversation, onOpenPerson }: { conversation: Conversation; onOpenPerson: (chatId: string) => void }) {
  return <View style={styles.contactDetails}><View style={styles.contactDetailsIdentity}><ClaireAvatar initials={conversation.initials} source={conversation.avatarUrl ? { uri: conversation.avatarUrl } : undefined} size={46} tone={conversation.tone} /><View style={styles.contactDetailsCopy}><ClaireText variant="sectionTitle">{conversation.name}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{conversation.isGroup ? 'Group conversation' : 'Individual conversation'} · {conversation.platform}</ClaireText></View></View><View style={styles.contactDetailsMeta}><View><ClaireText variant="monoLabel" style={styles.contextLabel}>RELATIONSHIP</ClaireText><ClaireText variant="bodySmall">Manage how Claire helps in this conversation.</ClaireText></View><ClaireButton variant="quiet" onPress={() => onOpenPerson(conversation.id)}>Open profile</ClaireButton></View></View>;
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
  const [expanded, setExpanded] = useState(false);
  const load = useCallback(async (forceRefresh = false) => {
    if (!api || !target?.content?.trim()) return;
    setLoading(true); setError(null);
    try { setSuggestions((await api.generateReplyOptions(target.id, target.content, chatType, forceRefresh)).suggestions.slice(0, 3)); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Reply options are unavailable.'); } finally { setLoading(false); }
  }, [api, chatType, target?.content, target?.id]);
  useEffect(() => { setSuggestions([]); setError(null); setExpanded(false); load().catch(() => undefined); }, [load]);
  if (!target) return null;
  return <View style={[styles.suggestionArea, desktopReplyStyles.replyArea]}>
    {loading ? <View style={desktopReplyStyles.loadingRow}><ActivityIndicator size="small" color={colors.focus} /><ClaireText variant="bodySmall" style={styles.muted}>Claire is drafting reply ideas…</ClaireText></View> : null}
    {suggestions.length ? <>
      <View style={desktopReplyStyles.replyHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Show condensed reply options' : 'Show full reply options'} onPress={() => setExpanded((current) => !current)} style={({ pressed }) => [desktopReplyStyles.replyHeading, pressed && styles.pressed]}>
          <View style={desktopReplyStyles.replyMark}><Sparkles size={13} color={colors.focus} /></View><ClaireText variant="label" style={desktopReplyStyles.replyHeadingText}>Reply ideas</ClaireText>{expanded ? <ChevronUp size={15} color={colors.neutral[600]} /> : <ChevronDown size={15} color={colors.neutral[600]} />}
        </Pressable>
        <ClaireIconButton accessibilityLabel="Regenerate reply options" disabled={loading} onPress={() => { load(true).catch(() => undefined); }} style={desktopReplyStyles.replyIconButton}><RefreshCw size={15} color={colors.neutral[600]} /></ClaireIconButton>
      </View>
      {expanded ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={desktopReplyStyles.expandedOptions}>{suggestions.map((suggestion, index) => <Pressable key={`${target.id}-${index}-${suggestion}`} accessibilityRole="button" accessibilityLabel={`Use reply option ${index + 1}`} onPress={() => onUse(suggestion)} style={({ pressed }) => [desktopReplyStyles.expandedOption, pressed && styles.pressed]}><ClaireText variant="bodySmall" numberOfLines={3}>{suggestion}</ClaireText><ClaireText variant="label" style={styles.replyLabel}>Use</ClaireText></Pressable>)}</ScrollView> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={desktopReplyStyles.compactOptions}>{suggestions.map((suggestion, index) => <Pressable key={`${target.id}-${index}-${suggestion}`} accessibilityRole="button" accessibilityLabel={`Use reply option ${index + 1}`} onPress={() => onUse(suggestion)} style={({ pressed }) => [desktopReplyStyles.compactOption, pressed && styles.pressed]}><ClaireText variant="bodySmall" numberOfLines={1}>{suggestion}</ClaireText></Pressable>)}</ScrollView>}
    </> : null}
    {error ? <View style={desktopReplyStyles.loadingRow}><ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText><ClaireIconButton accessibilityLabel="Retry reply options" onPress={() => { load(true).catch(() => undefined); }} style={desktopReplyStyles.replyIconButton}><RefreshCw size={15} color={colors.danger} /></ClaireIconButton></View> : null}
  </View>;
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
  const { width } = useWindowDimensions();
  const stacked = width < 1100;
  const expansive = width >= 1460;
  const heroTitle = expansive ? 42 : 34;

  return <ScrollView style={styles.surfacePane} contentContainerStyle={[styles.dailyBriefContent, desktopHomeStyles.content]}>
    <View style={desktopHomeStyles.header}>
      <View style={desktopHomeStyles.headerCopy}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>{today.toUpperCase()}</ClaireText><ClaireText variant="display" style={desktopHomeStyles.greeting}>Good morning, {firstName}.</ClaireText><ClaireText variant="body" style={desktopHomeStyles.subtitle}>{unread ? `${unread} messages need your attention.` : 'Your inbox is clear for now.'}</ClaireText></View>
      <ClaireButton variant="secondary" onPress={onOpenInbox}>Open Inbox</ClaireButton>
    </View>
    <View style={[desktopHomeStyles.row, stacked && desktopHomeStyles.rowStacked]}>
      <ClaireCard tone="sky" style={[desktopHomeStyles.card, desktopHomeStyles.hero, stacked && desktopHomeStyles.cardStacked, expansive && desktopHomeStyles.heroExpansive]}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>CONTINUE CONVERSATION</ClaireText><ClaireText variant="screenTitle" style={{ fontSize: heroTitle, lineHeight: heroTitle + 5 }}>{'Pick up where\nyou left off.'}</ClaireText>{latest ? <Pressable accessibilityRole="button" onPress={() => onOpenChat(latest.id)} style={({ pressed }) => [desktopHomeStyles.actionRow, pressed && styles.pressed]}><ClaireAvatar initials={latest.initials} source={latest.avatarUrl ? { uri: latest.avatarUrl } : undefined} size={42} tone={latest.tone} /><View style={styles.dailyBriefRowCopy}><ClaireText variant="body" style={desktopHomeStyles.actionTitle}>{latest.name}</ClaireText><ClaireText variant="bodySmall" numberOfLines={1} style={desktopHomeStyles.actionDetail}>{latest.preview}</ClaireText></View><ClaireText variant="label" style={styles.replyLabel}>Continue</ClaireText></Pressable> : <ClaireText variant="body" style={styles.muted}>Your latest conversation will appear here after sync.</ClaireText>}</ClaireCard>
      <ClaireCard tone="paper" style={[desktopHomeStyles.card, desktopHomeStyles.health, stacked && desktopHomeStyles.cardStacked]}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>CONNECTION HEALTH</ClaireText><View style={desktopHomeStyles.healthRow}><View style={[styles.healthDot, companionHealthy && styles.healthDotHealthy]} /><View style={styles.dailyBriefRowCopy}><ClaireText variant="body" style={desktopHomeStyles.actionTitle}>This Mac</ClaireText><ClaireText variant="bodySmall" style={desktopHomeStyles.actionDetail}>{companionHealthy ? 'Companion ready for local connections' : 'Companion setup pending'}</ClaireText></View><ClaireStatusPill tone={companionHealthy ? 'success' : 'warning'}>{companionHealthy ? 'Healthy' : 'Action'}</ClaireStatusPill></View><ClaireText variant="bodySmall" style={styles.muted}>Platform status and recovery stay available in Connections.</ClaireText></ClaireCard>
    </View>
    <View style={[desktopHomeStyles.row, stacked && desktopHomeStyles.rowStacked]}>
      <ClaireCard tone="paper" style={[desktopHomeStyles.card, desktopHomeStyles.supportCard, stacked && desktopHomeStyles.cardStacked]}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>NEEDS A REPLY</ClaireText>{needsReply.length ? needsReply.map((conversation) => <Pressable key={conversation.id} accessibilityRole="button" onPress={() => onOpenChat(conversation.id)} style={({ pressed }) => [desktopHomeStyles.actionRow, pressed && styles.pressed]}><ClaireAvatar initials={conversation.initials} source={conversation.avatarUrl ? { uri: conversation.avatarUrl } : undefined} size={36} tone={conversation.tone} /><View style={styles.dailyBriefRowCopy}><ClaireText variant="body" style={desktopHomeStyles.actionTitle}>{conversation.name}</ClaireText><ClaireText variant="bodySmall" numberOfLines={1} style={desktopHomeStyles.actionDetail}>{conversation.preview}</ClaireText></View><ClaireText variant="label" style={styles.replyLabel}>Reply</ClaireText></Pressable>) : <ClaireText variant="body" style={styles.muted}>No unread conversations right now.</ClaireText>}</ClaireCard>
      <ClaireCard tone="paper" style={[desktopHomeStyles.card, desktopHomeStyles.promises, stacked && desktopHomeStyles.cardStacked]}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>OPEN PROMISES</ClaireText>{loadingPromises ? <LoadingRow label="Loading promises…" /> : openPromises.length ? openPromises.map((promise) => <Pressable key={promise.id} accessibilityRole={promise.chat_id ? 'button' : undefined} disabled={!promise.chat_id} onPress={() => promise.chat_id && onOpenChat(promise.chat_id)} style={({ pressed }) => [desktopHomeStyles.actionRow, pressed && promise.chat_id && styles.pressed]}><View style={styles.promiseDot} /><View style={styles.dailyBriefRowCopy}><ClaireText variant="body" style={desktopHomeStyles.actionTitle}>{promise.content}</ClaireText><ClaireText variant="bodySmall" style={desktopHomeStyles.actionDetail}>{deadlineLabel(promise.deadline) || 'Open commitment'}</ClaireText></View><ClaireText variant="label" style={styles.replyLabel}>Open</ClaireText></Pressable>) : <ClaireText variant="body" style={styles.muted}>No open promises right now.</ClaireText>}</ClaireCard>
    </View>
  </ScrollView>;
}

function PeoplePane({ api, conversations, selectedConversationId, onOpenChat }: { api: ClaireApi | null; conversations: Conversation[]; selectedConversationId: string | null; onOpenChat: (chatId: string) => void }) {
  const people = conversations.filter((conversation) => !conversation.isGroup);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(people[0]?.id || null);
  const [relationship, setRelationship] = useState('');
  const [instruction, setInstruction] = useState('');
  const [category, setCategory] = useState<'personal' | 'friend' | 'business' | 'trip' | 'romantic'>('personal');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= 1060;
  const selected = people.find((person) => person.id === selectedId) || people[0] || null;
  const filteredPeople = people.filter((person) => person.name.toLowerCase().includes(query.trim().toLowerCase()));
  const categoryOptions: Array<{ value: typeof category; label: string; description: string }> = [
    { value: 'business', label: 'Business', description: 'Clear and decisive' },
    { value: 'friend', label: 'Friend', description: 'Casual and natural' },
    { value: 'personal', label: 'Personal', description: 'Warm and direct' },
    { value: 'romantic', label: 'Romantic', description: 'Thoughtful and kind' },
    { value: 'trip', label: 'Trip', description: 'Helpful and practical' },
  ];
  useEffect(() => { if (!selectedId && people[0]) setSelectedId(people[0].id); }, [people, selectedId]);
  useEffect(() => { if (selectedConversationId && people.some((person) => person.id === selectedConversationId)) setSelectedId(selectedConversationId); }, [people, selectedConversationId]);
  useEffect(() => {
    let active = true;
    if (!api || !selected) { setRelationship(''); setInstruction(''); setError(null); return () => { active = false; }; }
    setLoading(true); setError(null);
    api.getConversationSettings(selected.id).then((settings) => {
      if (!active) return;
      setRelationship(settings.profile?.relationship_context || '');
      setInstruction(settings.profile?.ai_instruction || '');
      if (settings.category && ['personal', 'friend', 'business', 'trip', 'romantic'].includes(settings.category)) setCategory(settings.category as typeof category);
      else setCategory('personal');
    }).catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Unable to load relationship memory.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api, selected]);
  const save = async () => {
    if (!api || !selected) return;
    setSaving(true); setError(null);
    try {
      await Promise.all([
        api.updateConversationProfile(selected.id, { relationship_context: relationship.trim(), ai_instruction: instruction.trim() }),
        api.updateConversationCategory(selected.id, category),
      ]);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save relationship memory.'); } finally { setSaving(false); }
  };
  if (!people.length) return <ScrollView style={styles.surfacePane} contentContainerStyle={styles.surfaceContent}><ClaireText variant="screenTitle">People</ClaireText><ClaireText variant="body" style={styles.muted}>People will appear here once individual conversations sync.</ClaireText></ScrollView>;
  return <View style={styles.surfacePane} testID="claire-desktop-people"><View style={[desktopPeopleStyles.workspace, !isWide && desktopPeopleStyles.workspaceNarrow]}><View style={[desktopPeopleStyles.listPane, !isWide && desktopPeopleStyles.listPaneNarrow]}><ClaireText variant="screenTitle" style={desktopPeopleStyles.listTitle}>People</ClaireText><View style={desktopPeopleStyles.search}><Search size={21} color={colors.neutral[600]} /><TextInput accessibilityLabel="Search people" value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.neutral[400]} style={desktopPeopleStyles.searchInput} /></View><View style={desktopPeopleStyles.listLabel}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>RECENT</ClaireText><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>A–Z</ClaireText></View><ScrollView contentContainerStyle={desktopPeopleStyles.personList}>{filteredPeople.map((person) => <Pressable key={person.id} accessibilityRole="button" accessibilityState={{ selected: person.id === selected?.id }} onPress={() => setSelectedId(person.id)} style={({ pressed }) => [desktopPeopleStyles.personRow, person.id === selected?.id && desktopPeopleStyles.personRowSelected, pressed && styles.pressed]}><ClaireAvatar initials={person.initials} source={person.avatarUrl ? { uri: person.avatarUrl } : undefined} size={44} tone={person.tone} /><View style={desktopPeopleStyles.personCopy}><ClaireText variant="body" style={desktopPeopleStyles.personName}>{person.name}</ClaireText><ClaireText variant="bodySmall" numberOfLines={1} style={styles.muted}>Individual · {person.platform}</ClaireText></View></Pressable>)}</ScrollView></View><ScrollView style={desktopPeopleStyles.editor} contentContainerStyle={desktopPeopleStyles.editorContent}><View style={desktopPeopleStyles.personHeader}><ClaireAvatar initials={selected!.initials} source={selected!.avatarUrl ? { uri: selected!.avatarUrl } : undefined} size={72} tone={selected!.tone} /><View style={desktopPeopleStyles.personHeaderCopy}><ClaireText variant="screenTitle">{selected!.name}</ClaireText><ClaireText variant="body" style={styles.muted}>{selected!.platform} · conversation relationship</ClaireText></View><ClaireButton variant="quiet" onPress={() => onOpenChat(selected!.id)}>Open chat</ClaireButton></View><View style={desktopPeopleStyles.divider} /><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>RELATIONSHIP TYPE</ClaireText><View style={desktopPeopleStyles.categoryRow}>{categoryOptions.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ selected: category === option.value }} onPress={() => setCategory(option.value)} style={({ pressed }) => [desktopPeopleStyles.categoryChip, category === option.value && desktopPeopleStyles.categoryChipSelected, pressed && styles.pressed]}><ClaireText variant="label" style={category === option.value ? desktopPeopleStyles.categoryChipTextSelected : undefined}>{option.label}</ClaireText></Pressable>)}</View><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>WHAT SHOULD CLAIRE REMEMBER?</ClaireText><TextInput accessibilityLabel="Relationship memory" multiline value={relationship} onChangeText={setRelationship} placeholder={`Add context about ${selected!.name}, their preferences, and how you relate.`} placeholderTextColor={colors.neutral[400]} style={desktopPeopleStyles.memoryInput} /><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>DEFAULT SUGGESTION TONE</ClaireText><View style={desktopPeopleStyles.toneGrid}>{categoryOptions.slice(0, 4).map((option) => <Pressable key={option.value} accessibilityRole="button" onPress={() => setInstruction((current) => current || option.description)} style={({ pressed }) => [desktopPeopleStyles.toneCard, category === option.value && desktopPeopleStyles.toneCardSelected, pressed && styles.pressed]}><ClaireText variant="body" style={desktopPeopleStyles.toneTitle}>{option.label === 'Personal' ? 'Warm + direct' : option.label}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{option.description}</ClaireText></Pressable>)}</View><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>CLAIRE’S INSTRUCTION</ClaireText><TextInput accessibilityLabel="Claire instruction for this person" multiline value={instruction} onChangeText={setInstruction} placeholder="Keep this professional, avoid flirting, or use informal Spanish…" placeholderTextColor={colors.neutral[400]} style={desktopPeopleStyles.instructionInput} />{loading ? <LoadingRow label="Loading relationship memory…" /> : null}{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}<ClaireButton disabled={saving || loading} onPress={() => { save().catch(() => undefined); }}>{saving ? 'Saving…' : 'Save relationship memory'}</ClaireButton></ScrollView>{isWide ? <View style={desktopPeopleStyles.previewPane}><ClaireText variant="monoLabel" style={desktopPeopleStyles.previewOverline}>LIVE PREVIEW</ClaireText><ClaireText variant="screenTitle" style={desktopPeopleStyles.previewTitle}>See how Claire will help with {selected!.name}.</ClaireText><ClaireCard tone="paper" style={desktopPeopleStyles.previewCard}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>REPLY SUGGESTION</ClaireText><ClaireText variant="body">Your saved relationship context and instructions will shape reply options in this chat.</ClaireText><Pressable accessibilityRole="button" onPress={() => onOpenChat(selected!.id)} style={({ pressed }) => [desktopPeopleStyles.previewAction, pressed && styles.pressed]}><ClaireText variant="label" style={desktopPeopleStyles.previewActionText}>Open conversation</ClaireText></Pressable></ClaireCard><View style={desktopPeopleStyles.previewFocus}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>CLAIRE WILL PRIORITIZE</ClaireText><ClaireText variant="sectionTitle">{relationship.trim() || 'Your saved relationship context'}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>This is applied to replies and questions scoped to this conversation.</ClaireText></View></View> : null}</View></View>;
}

function AssistantPane({ api, selected, initialQuestion, onInitialQuestionConsumed, onOpenMessage }: { api: ClaireApi | null; selected: Conversation | null; initialQuestion: string | null; onInitialQuestionConsumed: () => void; onOpenMessage: (chatId: string, messageId: string) => void }) {
  const { width } = useWindowDimensions();
  const [threads, setThreads] = useState<AssistantThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [history, setHistory] = useState<ConversationAssistantThread | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);
  const [scopeSelected, setScopeSelected] = useState(Boolean(selected));
  const [loading, setLoading] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wide = width >= 1100;
  const reloadThreads = useCallback(async () => { if (!api) return; setLoadingThreads(true); try { setThreads(await api.listAssistantThreads()); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load saved research.'); } finally { setLoadingThreads(false); } }, [api]);
  useEffect(() => { setScopeSelected(Boolean(selected)); reloadThreads().catch(() => undefined); }, [reloadThreads, selected]);
  useEffect(() => {
    if (!initialQuestion) return;
    setQuestion(initialQuestion);
    onInitialQuestionConsumed();
  }, [initialQuestion, onInitialQuestionConsumed]);
  const openThread = async (id: string) => { if (!api) return; setLoading(true); setError(null); try { const next = await api.getAssistantThread(id); setThreadId(id); setHistory(next); setAnswer(null); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to open this research thread.'); } finally { setLoading(false); } };
  const ask = async (suggestedQuestion?: string) => {
    const prompt = (suggestedQuestion || question).trim();
    if (!api || !prompt) return;
    setLoading(true); setError(null);
    try {
      let activeThreadId = threadId;
      if (!activeThreadId) { const thread = await api.createAssistantThread(prompt.slice(0, 72)); activeThreadId = thread.id; setThreadId(thread.id); }
      const nextAnswer = await api.askAssistant(activeThreadId, prompt, scopeSelected && selected ? [selected.id] : []);
      setAnswer(nextAnswer); setQuestion('');
      const nextHistory = await api.getAssistantThread(activeThreadId); setHistory(nextHistory); await reloadThreads();
    } catch (askError) { setError(askError instanceof Error ? askError.message : 'Ask Claire could not answer right now.'); } finally { setLoading(false); }
  };
  const startNew = () => { setThreadId(null); setHistory(null); setAnswer(null); setQuestion(''); setError(null); };
  const latestTurn = [...(history?.turns || [])].reverse().find((turn) => turn.role === 'assistant');
  const latestAnswerText = answer?.answer || latestTurn?.content || null;
  const citations = answer?.citations || latestTurn?.citations || [];
  const tools = [
    { title: 'Catch me up', detail: 'Summarize the important recent context.', prompt: selected ? `Catch me up on my conversation with ${selected.name}.` : 'Catch me up on the most important recent conversations.', icon: MessageCircle },
    { title: 'Find open loops', detail: 'Promises and unanswered questions.', prompt: 'What open loops or commitments need my attention?', icon: ListTodo },
    { title: 'Check the tone', detail: 'Read the tone and suggest a constructive next step.', prompt: selected ? `What is the tone in my conversation with ${selected.name}, and how should I respond?` : 'What is the tone across my most recent important conversations?', icon: Users },
    { title: 'Find something', detail: 'Search all connected conversations.', prompt: 'Help me find something I said or received.', icon: Search },
  ];
  return <View style={styles.surfacePane} testID="claire-desktop-ask"><View style={[desktopAskStyles.workspace, !wide && desktopAskStyles.workspaceNarrow]}>{wide ? <View style={desktopAskStyles.threadRail}><View style={desktopAskStyles.threadRailHead}><View style={desktopAskStyles.threadRailTitle}><Sparkles size={16} color={colors.ink} /><ClaireText variant="monoLabel">ASK CLAIRE</ClaireText></View><ClaireIconButton accessibilityLabel="New Ask Claire thread" onPress={startNew} style={desktopAskStyles.threadNew}><Plus size={16} color={colors.paper} /></ClaireIconButton></View><ScrollView contentContainerStyle={desktopAskStyles.threadList}>{loadingThreads ? <LoadingRow label="Loading research…" /> : null}{threads.map((thread) => <Pressable key={thread.id} accessibilityRole="button" accessibilityState={{ selected: thread.id === threadId }} onPress={() => { openThread(thread.id).catch(() => undefined); }} style={({ pressed }) => [desktopAskStyles.thread, thread.id === threadId && desktopAskStyles.threadActive, pressed && styles.pressed]}><ClaireText variant="bodySmall" numberOfLines={2} style={desktopAskStyles.threadTitle}>{thread.title || 'Untitled research'}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{new Date(thread.updated_at).toLocaleDateString()}</ClaireText></Pressable>)}</ScrollView><View style={desktopAskStyles.threadNote}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>PRIVATE BY DEFAULT</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Claire cites connected messages and never sends from this workspace.</ClaireText></View></View> : null}<ScrollView style={desktopAskStyles.main} contentContainerStyle={desktopAskStyles.mainContent}><View style={desktopAskStyles.mainHead}><View style={desktopAskStyles.mainCopy}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>{selected ? `${selected.name.toUpperCase()} · ${selected.platform.toUpperCase()}` : 'ALL CONNECTED CONVERSATIONS'}</ClaireText><ClaireText variant="display">Ask Claire</ClaireText><ClaireText variant="body" style={styles.muted}>Research your conversations, plans, and relationships with cited answers.</ClaireText></View><ClaireStatusPill tone="info">Read only</ClaireStatusPill></View>{selected ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: scopeSelected }} onPress={() => setScopeSelected((current) => !current)} style={({ pressed }) => [desktopAskStyles.scope, pressed && styles.pressed]}><View style={[styles.scopeCheck, scopeSelected && styles.scopeCheckSelected]}><ClaireText variant="label">{scopeSelected ? '✓' : ''}</ClaireText></View><ClaireText variant="bodySmall">Prioritize {selected.name}; other relevant chats remain secondary.</ClaireText></Pressable> : null}<ClaireCard tone="sky" style={desktopAskStyles.suggestion}><View style={desktopAskStyles.suggestionMark}><Sparkles size={20} color={colors.paper} /></View><View style={desktopAskStyles.suggestionCopy}><ClaireText variant="monoLabel">{latestAnswerText ? 'CITED ANSWER' : 'READY WHEN YOU ARE'}</ClaireText><ClaireText variant="body" style={desktopAskStyles.suggestionText}>{latestAnswerText || 'Ask Claire about a plan, a message, or a person. Results always link back to the exact messages.'}</ClaireText>{latestAnswerText ? <View style={desktopAskStyles.suggestionActions}><ClaireButton variant="quiet" onPress={() => setQuestion('Make this shorter.')}>Make shorter</ClaireButton><ClaireButton variant="quiet" onPress={() => { const lastQuestion = [...(history?.turns || [])].reverse().find((turn) => turn.role === 'user')?.content; if (lastQuestion) ask(lastQuestion).catch(() => undefined); }}>Try again</ClaireButton></View> : null}</View></ClaireCard>{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}<ClaireText variant="monoLabel" style={desktopAskStyles.toolLabel}>MORE WAYS I CAN HELP</ClaireText><View style={desktopAskStyles.toolGrid}>{tools.map((tool) => { const Icon = tool.icon; return <Pressable key={tool.title} accessibilityRole="button" disabled={loading} onPress={() => { ask(tool.prompt).catch(() => undefined); }} style={({ pressed }) => [desktopAskStyles.tool, pressed && styles.pressed]}><Icon size={20} color={colors.ink} /><ClaireText variant="bodySmall" style={desktopAskStyles.toolTitle}>{tool.title}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{tool.detail}</ClaireText></Pressable>; })}</View>{citations.length ? <View style={desktopAskStyles.sourceList}><View style={styles.surfaceHeader}><ClaireText variant="sectionTitle">Sources</ClaireText><ClaireStatusPill tone={answer?.indexing.status === 'ready' ? 'success' : 'warning'}>{answer?.indexing.status === 'ready' ? 'Index ready' : `${citations.length} cited`}</ClaireStatusPill></View>{citations.slice(0, 3).map((citation) => <Pressable key={citation.messageId} accessibilityRole="button" onPress={() => onOpenMessage(citation.chatId, citation.messageId)} style={({ pressed }) => [styles.citationCard, pressed && styles.pressed]}><ClaireText variant="label" style={styles.citationName}>{citation.fromMe ? 'You' : citation.senderName} · {citation.platform}</ClaireText><ClaireText variant="bodySmall" numberOfLines={2}>{citation.excerpt}</ClaireText></Pressable>)}</View> : null}<View style={desktopAskStyles.composer}><Sparkles size={19} color={colors.ink} /><TextInput accessibilityLabel="Ask Claire a question" value={question} onChangeText={setQuestion} onSubmitEditing={() => { ask().catch(() => undefined); }} placeholder="Ask about a message, plan, or person…" placeholderTextColor={colors.neutral[400]} style={desktopAskStyles.composerInput} /><ClaireIconButton accessibilityLabel="Ask Claire" disabled={!question.trim() || loading} onPress={() => { ask().catch(() => undefined); }} style={desktopAskStyles.composerSend}>{loading ? <ActivityIndicator size="small" color={colors.paper} /> : <Send size={17} color={colors.paper} />}</ClaireIconButton></View></ScrollView>{wide ? <View style={desktopAskStyles.evidence}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>CLAIRE’S CONTEXT</ClaireText><ClaireCard tone="paper" style={desktopAskStyles.evidenceCard}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>SCOPE</ClaireText><ClaireText variant="bodySmall">{selected && scopeSelected ? selected.name : 'All connected conversations'}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{selected && scopeSelected ? 'Prioritized sources appear first.' : 'Ask Claire may cite any connected conversation.'}</ClaireText></ClaireCard><ClaireCard tone="paper" style={desktopAskStyles.evidenceCard}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>AVAILABLE SOURCES</ClaireText><ClaireText variant="bodySmall">{answer ? `${answer.indexing.indexedCount} indexed messages` : 'Sources appear with every answer.'}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Claire will show the exact messages behind each answer.</ClaireText></ClaireCard></View> : null}</View></View>;
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

// A safe local rendering fallback for older servers that predate
// GET /platforms/definitions. It never fabricates a connection: actions still
// use the authenticated server endpoints and unavailable services remain
// waitlist-only.
const desktopPlatformFallback: DesktopPlatformDefinition[] = [
  { id: 'whatsapp', name: 'WhatsApp', mark: 'W', accent: '#25D366', iconUrl: 'https://cdn.simpleicons.org/whatsapp/ffffff', iconTreatment: 'knockout', bridge: 'mautrix-whatsapp', supportStatus: 'available', deliveryWave: 'current', setupSurface: 'phone', setupLabel: 'Pair from your phone', runtimeHost: 'cloud', runtimeLabel: 'Cloud bridge', deviceDependency: 'pairing_only', authSummary: 'Link from WhatsApp Linked Devices.', detail: 'Your bridge keeps syncing after the phone pairing is complete.', capabilities: { desktopSetup: false, persistentDevice: false } },
  { id: 'telegram', name: 'Telegram', mark: 'T', accent: '#229ED9', iconUrl: 'https://cdn.simpleicons.org/telegram/ffffff', iconTreatment: 'knockout', bridge: 'mautrix-telegram', supportStatus: 'available', deliveryWave: 'current', setupSurface: 'phone', setupLabel: 'Approve on Telegram', runtimeHost: 'cloud', runtimeLabel: 'Cloud bridge', deviceDependency: 'pairing_only', authSummary: 'Approve a Telegram login from an existing client.', detail: 'The cloud bridge can keep syncing after setup.', capabilities: { desktopSetup: false, persistentDevice: false } },
  { id: 'imessage', name: 'iMessage', mark: 'i', accent: '#3478F6', iconUrl: 'https://cdn.simpleicons.org/imessage/ffffff', iconTreatment: 'knockout', bridge: 'mautrix-imessage', supportStatus: 'beta', deliveryWave: 'parallel_mac', setupSurface: 'mac', setupLabel: 'Local Mac setup', runtimeHost: 'paired_device', runtimeLabel: 'This Mac', deviceDependency: 'always_on_mac', authSummary: 'Claire needs Messages and Full Disk Access permissions.', detail: 'The companion runs locally with Messages on this Mac.', capabilities: { desktopSetup: true, persistentDevice: true } },
  { id: 'instagram', name: 'Instagram', mark: 'I', accent: '#D62976', iconUrl: 'https://cdn.simpleicons.org/instagram/ffffff', iconTreatment: 'knockout', bridge: 'mautrix-meta', supportStatus: 'available', deliveryWave: 'current', setupSurface: 'desktop', setupLabel: 'Claire Desktop sign-in', runtimeHost: 'cloud', runtimeLabel: 'Desktop authorization', deviceDependency: 'none', authSummary: 'Sign in in Claire’s contained Instagram window.', detail: 'Claire Desktop transfers the completed session directly to the bridge.', capabilities: { desktopSetup: true, persistentDevice: false } },
  { id: 'discord', name: 'Discord', mark: 'D', accent: '#5865F2', iconUrl: 'https://cdn.simpleicons.org/discord/ffffff', iconTreatment: 'knockout', bridge: 'future bridge', supportStatus: 'planned', deliveryWave: 'wave_2', setupSurface: 'desktop', setupLabel: 'Planned', runtimeHost: 'cloud', runtimeLabel: 'Future cloud bridge', deviceDependency: 'none', authSummary: 'Not available yet.', detail: 'Request access to help prioritize this bridge.', capabilities: { desktopSetup: false, persistentDevice: false } },
  { id: 'slack', name: 'Slack', mark: 'S', accent: '#611F69', iconUrl: 'https://api.iconify.design/logos/slack-icon.svg', iconTreatment: 'original', bridge: 'future bridge', supportStatus: 'planned', deliveryWave: 'wave_2', setupSurface: 'desktop', setupLabel: 'Planned', runtimeHost: 'cloud', runtimeLabel: 'Future cloud bridge', deviceDependency: 'none', authSummary: 'Not available yet.', detail: 'Request access to help prioritize this bridge.', capabilities: { desktopSetup: false, persistentDevice: false } },
];

function ConnectionsPane({ companion, companionNotice, api, apiUrl, accessToken, embedded = false }: { companion: CompanionStatus | null; companionNotice: string | null; api: ClaireApi | null; apiUrl: string; accessToken: string; embedded?: boolean }) {
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
      const [catalogResult, interestResult, ...statusResults] = await Promise.allSettled([
        api.getPlatformDefinitions(),
        api.getPlatformInterest(),
        ...['whatsapp', 'telegram', 'instagram'].map((platform) => api.getPlatformStatus(platform)),
      ]);
      const catalog = catalogResult.status === 'fulfilled' ? catalogResult.value : desktopPlatformFallback;
      const interests = interestResult.status === 'fulfilled' ? interestResult.value : [];
      const statuses = statusResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      setDefinitions(catalog);
      setRequestedPlatformIds(interests);
      setSelectedPlatformId((current) => current && catalog.some((item) => item.id === current) ? current : (catalog.find((item) => item.supportStatus === 'available')?.id || catalog[0]?.id || null));
      setPlatformStatuses(Object.fromEntries(statuses.map((status) => [status.platform, status])));
      setStatusError(catalogResult.status === 'rejected' ? 'Claire is using its built-in connection catalog until this server is updated.' : statusResults.some((result) => result.status === 'rejected') ? 'Some live connection statuses are temporarily unavailable.' : null);
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

  const summaryFor = (definition: DesktopPlatformDefinition) => definition.id === 'whatsapp' ? whatsapp : definition.id === 'instagram' ? instagram : definition.id === 'telegram' ? telegram : definition.id === 'imessage' ? { tone: ready ? 'success' as const : 'warning' as const, label: ready ? 'Local' : 'Set up', detail: companionNotice || companion?.detail || 'Mac companion setup required.' } : undefined;
  const activeDefinitions = definitions.filter((item) => item.supportStatus === 'available' || item.supportStatus === 'beta');
  const roadmapDefinitions = definitions.filter((item) => item.supportStatus === 'planned' || item.supportStatus === 'unavailable');

  return <ScrollView style={embedded ? desktopConnectionsStyles.embeddedScroll : styles.surfacePane} contentContainerStyle={[styles.connectionsContent, desktopConnectionsStyles.content, embedded && desktopConnectionsStyles.embeddedContent]}>
    <View style={desktopConnectionsStyles.header}>
      <View style={desktopConnectionsStyles.headerCopy}><ClaireText variant="monoLabel" style={styles.contextLabel}>ACCOUNTS &amp; BRIDGES</ClaireText><ClaireText variant="display">Connections</ClaireText><ClaireText variant="body" style={styles.muted}>{activeDefinitions.length} active networks · {ready ? 'this Mac is ready for local bridges' : 'local bridges available on this Mac'}</ClaireText></View>
      <View style={desktopConnectionsStyles.headerActions}><ClaireIconButton accessibilityLabel="Refresh connection status" disabled={loadingStatuses} onPress={() => { refreshStatuses().catch(() => undefined); }}>{loadingStatuses ? <ActivityIndicator size="small" color={colors.ink} /> : <RefreshCw size={18} color={colors.ink} />}</ClaireIconButton><ClaireButton onPress={() => setSelectedPlatformId('whatsapp')}>Add connection</ClaireButton></View>
    </View>
    <View style={desktopConnectionsStyles.localBanner}><View style={desktopConnectionsStyles.bannerMark}><ClaireText variant="sectionTitle">⌘</ClaireText></View><View style={desktopConnectionsStyles.bannerCopy}><ClaireText variant="body" style={styles.conversationName}>This Mac can host on-device connections.</ClaireText><ClaireText variant="bodySmall">iMessage is available only while Claire Desktop and Messages are running.</ClaireText></View></View>
    {statusError ? <View style={desktopConnectionsStyles.fallbackNotice}><CircleHelp size={16} color={colors.warning} /><ClaireText variant="bodySmall" style={styles.muted}>{statusError} Live setup actions will retry against your signed-in server.</ClaireText></View> : null}
    {loadingStatuses && !definitions.length ? <LoadingRow label="Loading Claire’s platform catalog…" /> : null}
    {definitions.length ? <><View style={desktopConnectionsStyles.grid}>{activeDefinitions.map((item) => <ConnectionOverviewCard key={item.id} definition={item} selected={item.id === selectedPlatformId} summary={summaryFor(item)} requested={false} onPress={() => { setSelectedPlatformId(item.id); setInterestNotice(null); }} />)}</View>
      {roadmapDefinitions.length ? <View style={desktopConnectionsStyles.roadmap}><View><ClaireText variant="monoLabel" style={styles.contextLabel}>ROADMAP</ClaireText><ClaireText variant="sectionTitle">Request a platform</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Requests express interest only—Claire never asks for credentials here.</ClaireText></View><View style={desktopConnectionsStyles.grid}>{roadmapDefinitions.map((item) => <ConnectionOverviewCard key={item.id} definition={item} selected={item.id === selectedPlatformId} requested={requestedPlatformIds.includes(item.id)} onPress={() => { setSelectedPlatformId(item.id); setInterestNotice(null); }} />)}</View></View> : null}
      {selectedPlatform ? <View style={desktopConnectionsStyles.detail}><ConnectionDetail definition={selectedPlatform} requested={requestedPlatformIds.includes(selectedPlatform.id)} companion={companion} companionNotice={companionNotice} summary={summaryFor(selectedPlatform)} whatsAppPhoneNumber={whatsAppPhoneNumber} onWhatsAppPhoneNumber={setWhatsAppPhoneNumber} connectingWhatsApp={connectingWhatsApp} pairingCode={pairingCode} whatsAppNotice={whatsAppNotice} onConnectWhatsApp={connectWhatsApp} connectingInstagram={connectingInstagram} instagramNotice={instagramNotice} onConnectInstagram={connectInstagram} onOpenMacPermissions={() => { companionBridge.openSystemSettings('full_disk_access').catch(() => undefined); }} requestingInterest={requestingInterest} interestNotice={interestNotice} onRequestInterest={requestInterest} /></View> : null}
    </> : null}
  </ScrollView>;
}

function ConnectionOverviewCard({ definition, selected, summary, requested, onPress }: { definition: DesktopPlatformDefinition; selected: boolean; summary?: { tone: 'success' | 'warning' | 'neutral'; label: string; detail: string }; requested: boolean; onPress: () => void }) {
  const status = summary?.label || (requested ? 'Requested' : definition.supportStatus === 'planned' ? 'Planned' : 'Unavailable');
  const detail = summary?.detail || definition.detail;
  const local = definition.id === 'imessage' || definition.id === 'instagram';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${definition.name}`} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [desktopConnectionsStyles.card, local && desktopConnectionsStyles.cardLocal, selected && desktopConnectionsStyles.cardSelected, pressed && styles.pressed]}>
    <View style={desktopConnectionsStyles.cardHead}><View style={[desktopConnectionsStyles.cardIcon, { backgroundColor: definition.accent }]}><PlatformGlyph definition={definition} size={30} /></View><View style={desktopConnectionsStyles.cardTitle}><ClaireText variant="sectionTitle">{definition.name}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{definition.runtimeLabel}</ClaireText></View><ClaireText variant="monoLabel" style={[desktopConnectionsStyles.cardStatus, summary?.tone === 'warning' && desktopConnectionsStyles.cardStatusWarning]}>{status.toUpperCase()}</ClaireText></View>
    {local ? <ClaireStatusPill tone="info">{definition.id === 'imessage' ? 'On-device · Mac only' : 'Desktop auth'}</ClaireStatusPill> : null}
    <ClaireText variant="bodySmall" numberOfLines={2} style={styles.muted}>{detail}</ClaireText>
    <View style={desktopConnectionsStyles.cardFooter}><ClaireText variant="label" style={styles.replyLabel}>{requested ? 'Requested' : definition.supportStatus === 'planned' ? 'Join waitlist' : definition.id === 'instagram' ? 'Reconnect' : definition.id === 'imessage' ? 'Permissions' : 'Manage'}</ClaireText></View>
  </Pressable>;
}

function ConnectionDetail({ definition, requested, companion, companionNotice, summary, whatsAppPhoneNumber, onWhatsAppPhoneNumber, connectingWhatsApp, pairingCode, whatsAppNotice, onConnectWhatsApp, connectingInstagram, instagramNotice, onConnectInstagram, onOpenMacPermissions, requestingInterest, interestNotice, onRequestInterest }: { definition: DesktopPlatformDefinition; requested: boolean; companion: CompanionStatus | null; companionNotice: string | null; summary?: { tone: 'success' | 'warning' | 'neutral'; label: string; detail: string }; whatsAppPhoneNumber: string; onWhatsAppPhoneNumber: (value: string) => void; connectingWhatsApp: boolean; pairingCode: string | null; whatsAppNotice: string | null; onConnectWhatsApp: () => Promise<void>; connectingInstagram: boolean; instagramNotice: string | null; onConnectInstagram: () => Promise<void>; onOpenMacPermissions: () => void; requestingInterest: boolean; interestNotice: string | null; onRequestInterest: () => Promise<void> }) {
  const isConnectableHere = definition.id === 'whatsapp' || definition.id === 'instagram' || definition.id === 'imessage';
  return <ClaireCard tone="paper" style={styles.connectionDetail}><View style={styles.connectionDetailHead}><View style={[styles.platformIcon, { backgroundColor: definition.accent }]}><PlatformGlyph definition={definition} /></View><View style={styles.connectionDetailCopy}><ClaireText variant="sectionTitle">{definition.name}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{definition.runtimeLabel}</ClaireText></View></View><ClaireText variant="bodySmall" style={styles.muted}>{definition.detail}</ClaireText><View style={styles.connectionMeta}><ClaireText variant="monoLabel" style={styles.contextLabel}>SETUP</ClaireText><ClaireText variant="bodySmall">{definition.authSummary}</ClaireText></View>{summary ? <ClaireStatusPill tone={summary.tone}>{summary.label}</ClaireStatusPill> : null}{definition.id === 'whatsapp' && summary?.label !== 'Connected' ? <><ClaireField accessibilityLabel="WhatsApp phone number" autoCapitalize="none" keyboardType="phone-pad" onChangeText={onWhatsAppPhoneNumber} placeholder="+15166100494" style={styles.connectionInput} value={whatsAppPhoneNumber} /><ClaireButton disabled={connectingWhatsApp || !whatsAppPhoneNumber.trim()} onPress={() => { onConnectWhatsApp().catch(() => undefined); }}>{connectingWhatsApp ? 'Starting pairing…' : pairingCode ? 'Get a new code' : 'Connect WhatsApp'}</ClaireButton>{pairingCode ? <View style={styles.pairingCode}><ClaireText variant="label" style={styles.pairingCodeLabel}>Pairing code</ClaireText><ClaireText variant="screenTitle" style={styles.pairingCodeText}>{pairingCode}</ClaireText></View> : null}{whatsAppNotice ? <ClaireText variant="bodySmall" style={whatsAppNotice.startsWith('Enter this') || whatsAppNotice.startsWith('Waiting') ? styles.successText : styles.errorText}>{whatsAppNotice}</ClaireText> : null}</> : null}{definition.id === 'instagram' ? <><ClaireText variant="bodySmall" style={styles.muted}>Sign in in Claire’s private Instagram window. Claire never asks you to copy cookies or share a password with us.</ClaireText><ClaireButton disabled={connectingInstagram || summary?.label === 'Connected'} onPress={() => { onConnectInstagram().catch(() => undefined); }}>{connectingInstagram ? 'Waiting for Instagram…' : summary?.label === 'Connected' ? 'Instagram connected' : 'Connect Instagram'}</ClaireButton>{instagramNotice ? <ClaireText variant="bodySmall" style={instagramNotice.startsWith('Instagram connected') ? styles.successText : styles.errorText}>{instagramNotice}</ClaireText> : null}</> : null}{definition.id === 'imessage' ? <><ClaireStatusPill tone={companion?.health === 'healthy' ? 'success' : 'warning'}>{companion?.health === 'healthy' ? 'This Mac is syncing' : 'Local beta setup'}</ClaireStatusPill><ClaireText variant="bodySmall" style={styles.muted}>{companionNotice || companion?.detail || 'Claire needs Messages permissions on this Mac before it can sync.'}</ClaireText><ClaireButton variant="secondary" onPress={onOpenMacPermissions}>Open Mac permissions</ClaireButton></> : null}{!isConnectableHere && definition.supportStatus === 'available' ? <ClaireText variant="bodySmall" style={styles.muted}>This integration is available in Claire, but this desktop build does not yet provide its setup flow. We won’t show a non-working connect button.</ClaireText> : null}{!isConnectableHere && (definition.supportStatus === 'planned' || definition.supportStatus === 'unavailable') ? <><ClaireText variant="bodySmall" style={styles.muted}>Joining the waitlist records only that you want {definition.name}; it does not connect an account or promise a release date.</ClaireText><ClaireButton variant={requested ? 'quiet' : 'secondary'} disabled={requested || requestingInterest} onPress={() => { onRequestInterest().catch(() => undefined); }}>{requested ? 'Requested' : requestingInterest ? 'Saving…' : 'Join waitlist'}</ClaireButton>{interestNotice ? <ClaireText variant="bodySmall" style={interestNotice.startsWith('You’re') ? styles.successText : styles.errorText}>{interestNotice}</ClaireText> : null}</> : null}</ClaireCard>;
}

/** Bundled vector marks keep catalog cards legible offline; unknown catalog IDs fall back to their server-provided mark. */
function PlatformGlyph({ definition, size = 22 }: { definition: DesktopPlatformDefinition; size?: number }) {
  if (definition.id === 'telegram') return <Send size={size} color={colors.paper} />;
  if (definition.id === 'discord') return <Users size={size} color={colors.paper} />;
  if (definition.id === 'imessage' || definition.id === 'whatsapp') return <MessageCircle size={size} color={colors.paper} />;
  if (definition.id === 'instagram') return <View style={[desktopConnectionsStyles.instagramGlyph, { width: size, height: size }]}><View style={desktopConnectionsStyles.instagramLens} /></View>;
  return <ClaireText variant="label" style={desktopConnectionsStyles.cardMark}>{definition.mark}</ClaireText>;
}

function SettingsPane({ api, companion, companionNotice, apiUrl, accessToken, onNotificationPreferenceChange }: { api: ClaireApi | null; companion: CompanionStatus | null; companionNotice: string | null; apiUrl: string; accessToken: string; onNotificationPreferenceChange: (enabled: boolean) => void }) {
  const [preferences, setPreferences] = useState<DesktopPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<'not_determined' | 'authorized' | 'provisional' | 'denied'>('not_determined');
  const [section, setSection] = useState<'profile' | 'connections' | 'ai' | 'relationships' | 'notifications' | 'appearance' | 'shortcuts' | 'privacy' | 'about'>('connections');
  const [account, setAccount] = useState<DesktopAccountProfile | null>(null);
  useEffect(() => {
    if (!api) return;
    let active = true;
    Promise.allSettled([api.getPreferences(), api.getAccountProfile(), companionBridge.getNotificationRegistration()]).then(([preferencesResult, profileResult, notificationResult]) => {
      if (!active) return;
      if (preferencesResult.status === 'fulfilled') setPreferences(preferencesResult.value);
      else setError('Settings could not be loaded right now.');
      if (profileResult.status === 'fulfilled') setAccount(profileResult.value);
      // Existing deployed servers may not have the additive account endpoint
      // yet. The Profile form remains usable instead of exposing a raw 404.
      else setAccount({ email: '', name: null, avatar_url: null });
      if (notificationResult.status === 'fulfilled') {
        setNotificationPermission(notificationResult.value.status);
        if (notificationResult.value.error) setError(notificationResult.value.error);
      }
    }).finally(() => active && setLoading(false));
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
  const extra = preferences?.preferences || {};
  const saveExtra = (nextExtra: NonNullable<DesktopPreferences['preferences']>) => save({ preferences: { ...extra, ...nextExtra } });
  const items: Array<[typeof section, string]> = [['profile', 'Profile'], ['connections', 'Connections'], ['ai', 'AI behavior'], ['relationships', 'Relationships'], ['notifications', 'Notifications'], ['appearance', 'Appearance'], ['shortcuts', 'Shortcuts'], ['privacy', 'Privacy & data'], ['about', 'About']];
  const updateAccount = async () => { if (!api || !account) return; setSaving(true); try { setAccount(await api.updateAccountProfile({ name: account.name || '', avatar_url: account.avatar_url || '' })); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save your profile.'); } finally { setSaving(false); } };
  const shortcutDefaults: Record<string, string> = { Home: '⌘1', Inbox: '⌘2', Promises: '⌘3', People: '⌘4', 'Ask Claire': '⌘K', Search: '⌘⇧F', Settings: '⌘,', 'New message': '⌘N' };
  const shortcuts = { ...shortcutDefaults, ...(extra.desktop_shortcuts || {}) };
  return <View style={styles.surfacePane} testID="claire-desktop-settings"><View style={desktopSettingsStyles.workspace}><View style={desktopSettingsStyles.sidebar}><ClaireText variant="screenTitle" style={desktopSettingsStyles.sidebarTitle}>Settings</ClaireText>{items.map(([id, label]) => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: section === id }} onPress={() => setSection(id)} style={({ pressed }) => [desktopSettingsStyles.sideItem, section === id && desktopSettingsStyles.sideItemActive, pressed && styles.pressed]}><ClaireText variant="body" style={section === id ? desktopSettingsStyles.sideItemTextActive : undefined}>{label}</ClaireText></Pressable>)}</View><ScrollView style={desktopSettingsStyles.main} contentContainerStyle={desktopSettingsStyles.mainContent}>{loading ? <LoadingRow label="Loading settings…" /> : null}{error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}{section === 'connections' ? <ConnectionsPane companion={companion} companionNotice={companionNotice} api={api} apiUrl={apiUrl} accessToken={accessToken} embedded /> : null}{section === 'profile' ? <ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="screenTitle">Profile</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{account?.email || 'Your Claire account'}</ClaireText><ClaireField label="Name" value={account?.name || ''} onChangeText={(value) => setAccount((current) => current ? { ...current, name: value } : current)} placeholder="Your name" /><ClaireField label="Avatar URL" value={account?.avatar_url || ''} onChangeText={(value) => setAccount((current) => current ? { ...current, avatar_url: value } : current)} placeholder="https://…" /><ClaireButton disabled={saving || !account} onPress={() => { updateAccount().catch(() => undefined); }}>{saving ? 'Saving…' : 'Save profile'}</ClaireButton></ClaireCard> : null}{section === 'ai' && preferences ? <View style={styles.surfaceSection}><ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="screenTitle">AI behavior</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>These defaults guide replies when a conversation does not override them.</ClaireText><View style={styles.settingsActions}><ClaireButton variant="quiet" disabled={saving} onPress={() => { save({ tone: nextTone() }).catch(() => undefined); }}>Tone: {preferences.tone}</ClaireButton><ClaireButton variant="quiet" disabled={saving} onPress={() => { save({ response_style: nextStyle() }).catch(() => undefined); }}>Length: {preferences.response_style}</ClaireButton></View></ClaireCard></View> : null}{section === 'relationships' ? <ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="screenTitle">Relationships</ClaireText><ClaireText variant="body" style={styles.muted}>Set context and AI instructions for each person in the People workspace.</ClaireText><ClaireText variant="bodySmall">Open People from the navigation rail to edit relationship memory.</ClaireText></ClaireCard> : null}{section === 'notifications' && preferences ? <ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="screenTitle">Notifications</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>macOS permission: {notificationPermission.replace('_', ' ')}.</ClaireText><View style={styles.settingsActions}><ClaireButton variant={preferences.notification_enabled ? 'secondary' : 'quiet'} disabled={saving} onPress={() => { save({ notification_enabled: !preferences.notification_enabled }).catch(() => undefined); }}>{preferences.notification_enabled ? 'Notifications on' : 'Notifications off'}</ClaireButton><ClaireButton variant="quiet" onPress={() => { requestMacNotificationPermission().catch(() => undefined); }}>Manage macOS alerts</ClaireButton></View></ClaireCard> : null}{section === 'appearance' && preferences ? <ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="screenTitle">Appearance</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>These settings sync to your Claire desktop workspaces.</ClaireText><View style={styles.settingsActions}>{(['system', 'light', 'dark'] as const).map((theme) => <ClaireButton key={theme} variant={extra.desktop_appearance?.theme === theme || (!extra.desktop_appearance?.theme && theme === 'system') ? 'secondary' : 'quiet'} onPress={() => { saveExtra({ desktop_appearance: { ...extra.desktop_appearance, theme } }).catch(() => undefined); }}>{theme}</ClaireButton>)}</View><View style={styles.settingsActions}>{(['comfortable', 'compact'] as const).map((density) => <ClaireButton key={density} variant={extra.desktop_appearance?.density === density || (!extra.desktop_appearance?.density && density === 'comfortable') ? 'secondary' : 'quiet'} onPress={() => { saveExtra({ desktop_appearance: { ...extra.desktop_appearance, density } }).catch(() => undefined); }}>{density}</ClaireButton>)}</View><View style={styles.settingsActions}>{([0.9, 1, 1.15] as const).map((scale) => <ClaireButton key={scale} variant={extra.desktop_appearance?.scale === scale || (!extra.desktop_appearance?.scale && scale === 1) ? 'secondary' : 'quiet'} onPress={() => { saveExtra({ desktop_appearance: { ...extra.desktop_appearance, scale } }).catch(() => undefined); }}>{Math.round(scale * 100)}%</ClaireButton>)}</View></ClaireCard> : null}{section === 'shortcuts' ? <ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="screenTitle">Shortcuts</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Change workspace shortcuts. Duplicate combinations are rejected before they can be saved.</ClaireText><View style={desktopSettingsStyles.shortcutGrid}>{Object.entries(shortcuts).map(([action, binding]) => <View key={action} style={desktopSettingsStyles.shortcutRow}><ClaireText variant="bodySmall" style={desktopSettingsStyles.shortcutLabel}>{action}</ClaireText><TextInput accessibilityLabel={`${action} shortcut`} value={binding} onChangeText={(value) => { const next = { ...shortcuts, [action]: value }; setPreferences((current) => current ? { ...current, preferences: { ...(current.preferences || {}), desktop_shortcuts: next } } : current); }} onSubmitEditing={() => { saveExtra({ desktop_shortcuts: shortcuts }).catch(() => undefined); }} style={desktopSettingsStyles.shortcutInput} /></View>)}</View><ClaireButton disabled={saving} onPress={() => { saveExtra({ desktop_shortcuts: shortcuts }).catch(() => undefined); }}>Save shortcuts</ClaireButton></ClaireCard> : null}{section === 'privacy' ? <ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="screenTitle">Privacy & data</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Claire stores your device credential in Keychain. Ask Claire is read-only and every answer cites the messages it used.</ClaireText></ClaireCard> : null}{section === 'about' ? <ClaireCard tone="paper" style={styles.settingsCard}><ClaireText variant="screenTitle">About Claire Desktop</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Desktop companion and unified messaging workspace.</ClaireText></ClaireCard> : null}</ScrollView></View></View>;
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

  const ask = async (suggestedQuestion?: string) => {
    const prompt = suggestedQuestion || question.trim();
    if (!api || !selected || !prompt) return;
    setLoading(true); setError(null);
    try {
      const next = await api.askConversationAssistant(selected.id, prompt);
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

  return <View style={[styles.inspector, desktopAssistantStyles.inspector, { width }]} testID="conversation-assistant-inspector">
    <View style={[styles.inspectorHeader, desktopAssistantStyles.header]}><View style={styles.inspectorHeaderCopy}><View style={styles.inspectorTitleRow}><View style={[styles.inspectorMark, desktopAssistantStyles.mark]}><Sparkles size={15} color={colors.focus} /></View><ClaireText variant="sectionTitle">Ask Claire</ClaireText></View><ClaireText variant="bodySmall" numberOfLines={1} style={styles.muted}>{selected ? `Private thread · ${selected.name}` : 'Select a conversation to ask Claire about it.'}</ClaireText></View><View style={styles.inspectorHeaderActions}>{history ? <ClaireIconButton accessibilityLabel="Clear Claire chat" disabled={clearing} onPress={confirmClear} style={desktopAssistantStyles.headerIcon}><Trash2 size={15} color={colors.neutral[600]} /></ClaireIconButton> : null}<ClaireIconButton accessibilityLabel="Collapse conversation assistant" onPress={onCollapse} style={desktopAssistantStyles.headerIcon}><PanelRightClose size={16} color={colors.ink} /></ClaireIconButton></View></View>
    <ScrollView contentContainerStyle={styles.inspectorContent} keyboardShouldPersistTaps="handled">
      {!selected ? <View style={styles.inspectorEmpty}><MessageCircle size={22} color={colors.neutral[400]} /><ClaireText variant="body">Pick a conversation</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Claire will keep a private, saved thread for that chat.</ClaireText></View> : null}
      {selected && loadingHistory ? <LoadingRow label="Loading Claire’s notes…" /> : null}
      {selected && !loadingHistory && !history ? <View style={[styles.inspectorEmpty, desktopAssistantStyles.empty]}><View style={desktopAssistantStyles.emptyMark}><Sparkles size={23} color={colors.focus} /></View><ClaireText variant="body">What can I help with?</ClaireText><ClaireText variant="bodySmall" style={[styles.muted, desktopAssistantStyles.emptyCopy]}>Claire searches only this conversation and cites every answer.</ClaireText><View style={desktopAssistantStyles.promptStack}>{['Summarize the recent context', 'What should I say next?', 'Find plans we made'].map((prompt) => <Pressable key={prompt} accessibilityRole="button" accessibilityLabel={prompt} disabled={loading} onPress={() => { ask(prompt).catch(() => undefined); }} style={({ pressed }) => [desktopAssistantStyles.promptChip, pressed && styles.pressed]}><ClaireText variant="bodySmall">{prompt}</ClaireText></Pressable>)}</View></View> : null}
      {history?.turns.map((turn) => <AssistantTurnCard key={turn.id} turn={turn} onOpenMessage={onOpenMessage} />)}
      {loading ? <View style={styles.inspectorThinking}><ActivityIndicator size="small" color={colors.focus} /><ClaireText variant="bodySmall" style={styles.muted}>Claire is reading this conversation…</ClaireText></View> : null}
      {error ? <ClaireText variant="bodySmall" style={styles.errorText}>{error}</ClaireText> : null}
    </ScrollView>
    {selected ? <View style={[styles.inspectorComposer, desktopAssistantStyles.composer]}><TextInput accessibilityLabel={`Ask Claire about ${selected.name}`} multiline value={question} onChangeText={setQuestion} placeholder={`Ask about ${selected.name}…`} placeholderTextColor={colors.neutral[400]} style={[styles.inspectorInput, desktopAssistantStyles.input]} /><ClaireIconButton accessibilityLabel="Ask Claire" disabled={!question.trim() || loading} onPress={() => { ask().catch(() => undefined); }} style={desktopAssistantStyles.sendButton}><Send size={15} color={colors.focus} /></ClaireIconButton></View> : null}
  </View>;
}

function ConversationContactInspector({ api, selected, width, onOpenAssistant, onOpenPerson }: { api: ClaireApi | null; selected: Conversation | null; width: number; onOpenAssistant: () => void; onOpenPerson: (chatId: string) => void }) {
  const [settings, setSettings] = useState<DesktopConversationSettings | null>(null);
  const [promises, setPromises] = useState<DesktopPromise[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setSettings(null); setPromises([]);
    if (!api || !selected) return () => { active = false; };
    setLoading(true);
    Promise.all([api.getConversationSettings(selected.id), api.getPromises()])
      .then(([nextSettings, nextPromises]) => {
        if (!active) return;
        setSettings(nextSettings);
        setPromises(nextPromises.filter((item) => item.chat_id === selected.id && item.status !== 'completed').slice(0, 3));
      })
      .catch(() => active && setSettings(null))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [api, selected]);

  if (!selected) return <View style={[styles.inspector, desktopContactInspectorStyles.root, { width }]}><View style={styles.inspectorEmpty}><Users size={22} color={colors.neutral[400]} /><ClaireText variant="body">Pick a conversation</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Contact details appear here.</ClaireText></View></View>;
  const memory = settings?.profile?.relationship_context || settings?.profile?.ai_instruction;
  return <View style={[styles.inspector, desktopContactInspectorStyles.root, { width }]} testID="conversation-contact-inspector">
    <View style={desktopContactInspectorStyles.head}>
      <ClaireAvatar initials={selected.initials} source={selected.avatarUrl ? { uri: selected.avatarUrl } : undefined} size={72} tone={selected.tone} />
      <ClaireText variant="screenTitle" style={desktopContactInspectorStyles.name}>{selected.name}</ClaireText>
      <ClaireText variant="bodySmall" style={styles.muted}>{settings?.category || (selected.isGroup ? 'Group conversation' : 'Conversation')} · {selected.platform}</ClaireText>
      <View style={desktopContactInspectorStyles.actions}><ClaireButton variant="quiet" onPress={() => onOpenPerson(selected.id)}>Profile</ClaireButton><ClaireButton variant="quiet" onPress={onOpenAssistant}>Ask Claire</ClaireButton></View>
    </View>
    <ScrollView contentContainerStyle={desktopContactInspectorStyles.content}>
      {loading ? <LoadingRow label="Loading conversation context…" /> : null}
      <View style={desktopContactInspectorStyles.section}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>RELATIONSHIP MEMORY</ClaireText><ClaireCard tone="sky" style={desktopContactInspectorStyles.memory}><ClaireText variant="bodySmall">{memory || 'Add relationship context in People to guide Claire’s replies for this conversation.'}</ClaireText></ClaireCard></View>
      <View style={desktopContactInspectorStyles.section}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>OPEN PROMISES</ClaireText>{promises.length ? promises.map((promise) => <Pressable key={promise.id} accessibilityRole="button" onPress={() => onOpenPerson(selected.id)} style={({ pressed }) => [desktopContactInspectorStyles.promise, pressed && styles.pressed]}><View style={desktopContactInspectorStyles.promiseDot} /><View style={desktopContactInspectorStyles.promiseCopy}><ClaireText variant="bodySmall" numberOfLines={2}>{promise.content}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{promise.deadline ? new Date(promise.deadline).toLocaleDateString() : 'No due date'}</ClaireText></View></Pressable>) : <ClaireText variant="bodySmall" style={styles.muted}>No open promises in this conversation.</ClaireText>}</View>
      <View style={desktopContactInspectorStyles.section}><ClaireText variant="monoLabel" style={styles.dailyBriefDate}>SHARED</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>Shared media and files will appear here as they sync.</ClaireText></View>
    </ScrollView>
  </View>;
}

function AssistantTurnCard({ turn, onOpenMessage }: { turn: AssistantTurn; onOpenMessage: (chatId: string, messageId: string) => void }) {
  const isUser = turn.role === 'user';
  return <View style={[styles.inspectorTurn, isUser && styles.inspectorTurnUser]}><ClaireText variant="label" style={isUser ? styles.inspectorTurnUserLabel : styles.inspectorTurnClaireLabel}>{isUser ? 'You' : 'Claire'}</ClaireText><ClaireCard tone={isUser ? 'sky' : 'paper'} style={styles.inspectorTurnCard}><ClaireText variant="bodySmall">{turn.content}</ClaireText></ClaireCard>{!isUser && turn.citations?.length ? <View style={styles.inspectorSources}><ClaireText variant="monoLabel" style={styles.contextLabel}>SOURCES</ClaireText>{turn.citations.slice(0, 3).map((citation) => <AssistantCitationCard key={citation.messageId} citation={citation} onOpenMessage={onOpenMessage} compact />)}</View> : null}</View>;
}

function AssistantCitationCard({ citation, onOpenMessage, compact = false }: { citation: AssistantCitation; onOpenMessage: (chatId: string, messageId: string) => void; compact?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open source from ${citation.fromMe ? 'you' : citation.senderName}`} onPress={() => onOpenMessage(citation.chatId, citation.messageId)} style={({ pressed }) => [styles.citationCard, compact && styles.citationCardCompact, pressed && styles.pressed]}><View style={styles.citationHeader}><ClaireText variant="label" style={styles.citationName}>{citation.fromMe ? 'You' : citation.senderName}</ClaireText><ClaireText variant="bodySmall" style={styles.muted}>{new Date(citation.timestamp).toLocaleDateString()} · {citation.platform}</ClaireText></View><ClaireText variant="bodySmall" numberOfLines={compact ? 3 : undefined}>{citation.excerpt}</ClaireText><ClaireText variant="label" style={styles.replyLabel}>Open conversation</ClaireText></Pressable>;
}

const desktopConversationStyles = StyleSheet.create({
  paneHeaderActions: { flexDirection: 'row', columnGap: space[1] },
  newConversationPicker: { marginHorizontal: space[3], marginBottom: space[3], padding: space[3], rowGap: space[1], borderRadius: radius.card, borderWidth: 1, borderColor: colors.focusSoft, backgroundColor: colors.sky },
  newConversationHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: space[2], marginBottom: space[1] },
  newConversationRow: { minHeight: 46, paddingHorizontal: space[2], flexDirection: 'row', alignItems: 'center', columnGap: space[2], borderRadius: radius.control, backgroundColor: colors.paper },
  newConversationRowCopy: { flex: 1, minWidth: 0 },
  newConversationHint: { color: colors.neutral[600], marginTop: space[1] },
  contactDetails: { marginHorizontal: space[5], marginTop: space[3], padding: space[3], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, rowGap: space[3] },
  contactDetailsIdentity: { flexDirection: 'row', alignItems: 'center', columnGap: space[3] },
  contactDetailsCopy: { flex: 1, minWidth: 0 },
  contactDetailsMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: space[3], paddingTop: space[3], borderTopWidth: 1, borderColor: colors.neutral[200] },
});

const styles = Object.assign(StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.cream }, desktopTitleBar: { height: 42, minHeight: 42, backgroundColor: colors.paper, borderBottomWidth: 1, borderColor: colors.neutral[200], flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3] }, titleBarBrand: { width: 140, justifyContent: 'center' }, titleBarMark: { width: 24, height: 24, borderRadius: 8, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }, titleBarTitle: { flex: 1, alignItems: 'center' }, titleBarTitleText: { fontWeight: '700', color: colors.neutral[600] }, titleBarActions: { width: 48, flexDirection: 'row', justifyContent: 'flex-end' }, appFrame: { flex: 1, flexDirection: 'row', minWidth: 0 }, navigationRail: { width: 148, backgroundColor: colors.ink, padding: space[4], justifyContent: 'space-between' }, navigationRailCompact: { width: 68, paddingHorizontal: space[2], alignItems: 'center' }, brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center', marginBottom: space[8] }, navButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: radius.control, marginBottom: space[1] }, navButtonCompact: { width: 42, alignItems: 'center', paddingHorizontal: 0 }, navButtonActive: { backgroundColor: colors.neutral[800] }, navText: { color: colors.neutral[300] }, navTextActive: { color: colors.lime }, syncDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning, alignSelf: 'center', marginBottom: space[3] }, syncDotLive: { backgroundColor: colors.success }, profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: space[4], columnGap: space[2] }, profileRowCompact: { marginTop: space[2] }, profileName: { color: colors.paper }, pressed: { opacity: 0.8 },
  conversationPane: { backgroundColor: colors.paper, borderRightWidth: 1, borderColor: colors.neutral[200], minWidth: 0 }, conversationPaneCompact: { flex: 1, width: undefined, borderRightWidth: 0 }, paneResizeHandle: { width: 8, backgroundColor: colors.neutral[100], borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.neutral[200] }, paneHeader: { padding: space[4], paddingBottom: space[3], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', columnGap: space[2] }, paneHeaderCopy: { flex: 1, minWidth: 0 }, muted: { color: colors.neutral[600] }, inboxSearch: { minHeight: 44, marginHorizontal: space[4], paddingLeft: space[3], paddingRight: space[2], borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.neutral[50], flexDirection: 'row', alignItems: 'center', columnGap: space[2] }, inboxSearchInput: { flex: 1, minWidth: 0, height: 42, color: colors.ink, fontFamily: 'Inter', fontSize: 14, lineHeight: 20, paddingTop: 11, paddingBottom: 11 }, searchShortcut: { minWidth: 32, height: 24, justifyContent: 'center', alignItems: 'center', borderRadius: 6, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }, searchShortcutText: { color: colors.neutral[600] }, inboxFilters: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[1], rowGap: space[1], paddingHorizontal: space[4], paddingTop: space[3] }, inboxFilter: { minHeight: 28, borderRadius: radius.pill, paddingHorizontal: space[3], justifyContent: 'center', backgroundColor: colors.neutral[100] }, inboxFilterActive: { backgroundColor: colors.ink }, inboxFilterText: { color: colors.neutral[600] }, inboxFilterActiveText: { color: colors.lime }, conversationList: { padding: space[2], paddingTop: space[3] }, conversationContent: { flex: 1, minWidth: 0 }, conversationName: { fontWeight: '700', flexShrink: 1 }, platformLabel: { color: colors.neutral[600], marginTop: 4 }, unread: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }, unreadText: { color: colors.lime },
  chatPane: { flex: 1, minWidth: 400, backgroundColor: colors.cream }, chatPaneCompact: { minWidth: 0 }, chatHeader: { minHeight: 76, paddingHorizontal: space[6], borderBottomWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, contactHeader: { flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, chatActions: { flexDirection: 'row', alignItems: 'center', columnGap: space[2] }, quickContextRibbon: { minHeight: 56, paddingHorizontal: space[5], backgroundColor: colors.sky, borderBottomWidth: 1, borderColor: colors.infoBorder, flexDirection: 'row', alignItems: 'center', columnGap: space[2] }, quickContextMark: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, quickContextCopy: { flex: 1, minWidth: 0, rowGap: 2 }, quickContextLabel: { color: colors.focus }, quickContextAction: { minHeight: 28, paddingHorizontal: space[3], borderWidth: 1, borderColor: colors.focusSoft, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, quickContextActionText: { color: colors.focus }, conversationSettings: { marginHorizontal: space[5], marginTop: space[3], rowGap: space[3] }, conversationField: { backgroundColor: colors.paper, fontFamily: 'System', textAlignVertical: 'center', paddingVertical: 0 }, conversationInstruction: { minHeight: 84, fontFamily: 'System', textAlignVertical: 'top', paddingVertical: space[2] }, messageList: { padding: space[6] }, contextCard: { maxWidth: 500, borderColor: colors.focusSoft, padding: space[3], marginBottom: space[4] }, contextLabel: { color: colors.neutral[600], marginBottom: space[1] }, messageWrap: { alignSelf: 'flex-start', maxWidth: '76%', marginBottom: space[4] }, messageWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' }, messageWrapHighlighted: { borderRadius: radius.card, backgroundColor: colors.sky, padding: space[2], marginHorizontal: -space[2] }, messageSender: { color: colors.neutral[600], marginLeft: space[2], marginBottom: 3 }, bubble: { borderRadius: radius.card, paddingHorizontal: space[4], paddingVertical: space[3] }, bubbleTheirs: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }, bubbleMine: { backgroundColor: colors.lime }, mediaImage: { width: 280, height: 210, borderRadius: radius.control, resizeMode: 'cover' }, messageTime: { color: colors.neutral[600], marginTop: 4, marginHorizontal: space[2] }, suggestionArea: { backgroundColor: colors.sky, borderTopWidth: 1, borderColor: colors.neutral[200], paddingVertical: space[2], rowGap: space[2] }, suggestionRow: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], paddingHorizontal: space[6], paddingBottom: space[2] }, suggestionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[6] }, suggestionOptions: { paddingHorizontal: space[6], columnGap: space[2] }, suggestionOption: { width: 218, minHeight: 76, justifyContent: 'space-between', borderRadius: radius.control, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], padding: space[3] }, composer: { flexDirection: 'row', columnGap: space[3], alignItems: 'flex-end', padding: space[5], backgroundColor: colors.paper, borderTopWidth: 1, borderColor: colors.neutral[200] }, composerInput: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[200], color: colors.ink, fontFamily: 'System', lineHeight: 20, paddingHorizontal: space[3], paddingVertical: space[2], fontSize: 14, textAlignVertical: 'top' },
  inspector: { backgroundColor: colors.paper, borderLeftWidth: 1, borderColor: colors.neutral[200], minWidth: 0 }, inspectorHeader: { minHeight: 82, padding: space[4], paddingBottom: space[3], flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: space[2], borderBottomWidth: 1, borderColor: colors.neutral[200] }, inspectorHeaderCopy: { flex: 1, minWidth: 0 }, inspectorHeaderActions: { flexDirection: 'row', columnGap: space[1] }, inspectorTitleRow: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], marginBottom: 4 }, inspectorMark: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.infoSurface, borderRadius: 9 }, inspectorContent: { padding: space[3], rowGap: space[3] }, inspectorEmpty: { paddingVertical: space[6], alignItems: 'center', rowGap: space[2], textAlign: 'center' }, inspectorThinking: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], paddingVertical: space[2] }, inspectorComposer: { borderTopWidth: 1, borderColor: colors.neutral[200], padding: space[3], flexDirection: 'row', alignItems: 'flex-end', columnGap: space[2] }, inspectorInput: { flex: 1, minHeight: 42, maxHeight: 100, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, color: colors.ink, fontFamily: 'Avenir Next', fontSize: 14, lineHeight: 20, paddingHorizontal: space[3], paddingVertical: space[2], textAlignVertical: 'top' }, inspectorTurn: { alignItems: 'flex-start', rowGap: 4 }, inspectorTurnUser: { alignItems: 'flex-end' }, inspectorTurnUserLabel: { color: colors.focus }, inspectorTurnClaireLabel: { color: colors.neutral[600] }, inspectorTurnCard: { padding: space[3], maxWidth: '100%' }, inspectorSources: { width: '100%', rowGap: space[2], marginTop: space[1] },
  emptyPane: { justifyContent: 'center', alignItems: 'center', rowGap: space[2] }, loadingRow: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], paddingVertical: space[4] }, errorText: { color: colors.danger, paddingVertical: space[2] }, successText: { color: colors.success, paddingVertical: space[2] },
  promisesPane: { flex: 1, minWidth: 620, backgroundColor: colors.cream }, promisesContent: { padding: space[6], maxWidth: 900 }, promiseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space[5] }, promiseCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderLeftWidth: 4, borderLeftColor: colors.warning, borderRadius: radius.card, padding: space[4], marginBottom: space[3] }, promiseCardOverdue: { borderLeftColor: colors.danger }, promisePerson: { flexDirection: 'row', alignItems: 'center', columnGap: space[3], marginBottom: space[3] }, promisePersonText: { flex: 1 }, replyLabel: { color: colors.focus }, promiseText: { fontWeight: '600', marginBottom: space[2] }, overdueText: { color: colors.danger },
  surfacePane: { flex: 1, minWidth: 620, backgroundColor: colors.cream }, surfaceContent: { padding: space[6], maxWidth: 920, rowGap: space[3] }, dailyBriefContent: { padding: space[6], maxWidth: 980, rowGap: space[5] }, dailyBriefHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: space[4] }, dailyBriefDate: { color: colors.neutral[600], marginBottom: space[1] }, dailyBriefGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], rowGap: space[3] }, dailyBriefCard: { width: 360, flexGrow: 1, minHeight: 190, rowGap: space[3] }, dailyBriefHero: { minHeight: 220, justifyContent: 'space-between' }, dailyBriefRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', columnGap: space[2], paddingVertical: space[1] }, dailyBriefRowCopy: { flex: 1, minWidth: 0, rowGap: 2 }, healthRow: { flexDirection: 'row', alignItems: 'center', columnGap: space[2] }, healthDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning }, healthDotHealthy: { backgroundColor: colors.success }, promiseDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.warning }, connectionsContent: { padding: space[5], rowGap: space[3] }, surfaceSection: { marginTop: space[4], rowGap: space[2] }, surfaceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', columnGap: space[3] }, surfaceHeaderCopy: { flex: 1, minWidth: 0 }, connectionsWorkspace: { flexDirection: 'row', alignItems: 'flex-start', columnGap: space[4] }, platformCatalog: { flex: 1, minWidth: 420, rowGap: space[3] }, catalogHeading: { marginTop: space[2], rowGap: 3 }, platformGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[2], rowGap: space[2] }, platformCatalogCard: { width: 210, minHeight: 88, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, padding: space[3], flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, platformCatalogCardSelected: { borderColor: colors.focus, borderWidth: 2, backgroundColor: colors.sky }, platformIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }, platformIconImage: { width: 22, height: 22, resizeMode: 'contain' }, platformCardCopy: { flex: 1, minWidth: 0, rowGap: 3 }, connectionDetail: { width: 330, minWidth: 300, rowGap: space[3] }, connectionDetailHead: { flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, connectionDetailCopy: { flex: 1, minWidth: 0 }, connectionMeta: { backgroundColor: colors.cream, borderRadius: radius.control, padding: space[3], rowGap: space[1] }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], rowGap: space[3], marginTop: space[3] }, summaryCard: { minWidth: 210, flexGrow: 1, rowGap: space[1] }, homeConversation: { minHeight: 62, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, padding: space[3], flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, peopleRow: { minHeight: 68, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, padding: space[3], flexDirection: 'row', alignItems: 'center', columnGap: space[3] }, scopeControl: { flexDirection: 'row', alignItems: 'center', columnGap: space[3], backgroundColor: colors.sky, borderRadius: radius.control, padding: space[3], marginTop: space[3] }, scopeCheck: { width: 20, height: 20, borderWidth: 1, borderColor: colors.neutral[400], borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, scopeCheckSelected: { backgroundColor: colors.lime, borderColor: colors.ink }, assistantCard: { marginTop: space[3] }, assistantInput: { minHeight: 104, color: colors.ink, fontFamily: 'System', fontSize: 15, lineHeight: 22, textAlignVertical: 'top', padding: 0 }, assistantActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: space[3], borderTopWidth: 1, borderColor: colors.neutral[200], paddingTop: space[3], marginTop: space[3] }, answerArea: { marginTop: space[4], rowGap: space[3] }, citationCard: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.infoBorder, borderRadius: radius.control, padding: space[3], rowGap: space[1] }, citationCardCompact: { padding: space[2] }, citationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', columnGap: space[3] }, citationName: { color: colors.focus }, connectionCard: { marginTop: space[3], rowGap: space[2] }, connectionInput: { minHeight: 46, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.cream, color: colors.ink, fontFamily: 'System', fontSize: 15, lineHeight: 20, paddingHorizontal: space[3], paddingVertical: 0, textAlignVertical: 'center' }, pairingCode: { alignSelf: 'flex-start', backgroundColor: colors.sky, borderRadius: radius.control, paddingHorizontal: space[3], paddingVertical: space[2], rowGap: space[1] }, pairingCodeLabel: { color: colors.neutral[600] }, pairingCodeText: { letterSpacing: 2 }, settingsCard: { rowGap: space[3] }, settingsActions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[2], rowGap: space[2] },
  authScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream, padding: space[6] }, authCard: { width: 420, maxWidth: '100%', rowGap: space[4] }, authLabel: { marginTop: space[3] }, authBody: { marginTop: space[2] }, authInput: { minHeight: 46, borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[200], color: colors.ink, fontFamily: 'Avenir Next', fontSize: 14, lineHeight: 20, paddingHorizontal: space[3], paddingVertical: 0, textAlignVertical: 'center' },
}), desktopConversationStyles);

const desktopShellStyles = StyleSheet.create({
  titleBar: { borderBottomWidth: 0 },
  titleBarSidebarSurface: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 148, backgroundColor: colors.ink },
  // Match the compact 68pt rail exactly so its black title-bar surface lines
  // up with the sidebar edge while retaining room for macOS traffic lights.
  titleBarSidebarSurfaceCollapsed: { width: 68 },
  titleBarRailSpacer: { width: 148 },
  titleBarRailSpacerCollapsed: { width: 68 },
  titleBarToggle: { width: 48, paddingLeft: space[2], justifyContent: 'center' },
  titleBarSearchArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[3] },
  titleBarSearch: { width: '56%', minWidth: 240, maxWidth: 560, height: 32, paddingLeft: space[2], paddingRight: 3, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 10, backgroundColor: colors.neutral[50], flexDirection: 'row', alignItems: 'center', columnGap: space[1] },
  titleBarSearchInput: { flex: 1, minWidth: 0, height: 30, color: colors.ink, fontFamily: 'Inter', fontSize: 13, lineHeight: 18, paddingTop: 6, paddingBottom: 6 },
  titleBarSearchShortcut: { minWidth: 28, height: 24, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] },
  titleBarSearchShortcutText: { color: colors.neutral[600], fontSize: 10 },
  titleBarDivider: { position: 'absolute', left: 148, right: 0, bottom: 0, height: 1, backgroundColor: colors.neutral[200] },
  titleBarDividerCollapsed: { left: 68 },
  titleBarIconButton: { width: 32, height: 32, borderRadius: 10 },
  navigationRail: { paddingTop: 40 },
  navigationRailCompact: { paddingTop: 32 },
  navButton: { minHeight: 44 },
  navButtonCompact: { width: 46, minHeight: 46, borderRadius: 14 },
  navEntryContent: { flexDirection: 'row', alignItems: 'center', columnGap: 10 },
  inboxSearchInput: {},
});

const desktopReplyStyles = StyleSheet.create({
  replyArea: { backgroundColor: '#eaf4ff', paddingVertical: space[1], rowGap: 0 },
  replyHeader: { minHeight: 32, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  replyHeading: { flexDirection: 'row', alignItems: 'center', columnGap: 6, minHeight: 30 },
  replyMark: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: colors.paper },
  replyHeadingText: { color: colors.focus },
  replyIconButton: { width: 28, height: 28, borderRadius: 8 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34, columnGap: space[2], paddingHorizontal: space[4] },
  compactOptions: { paddingHorizontal: space[4], paddingBottom: space[1], columnGap: space[2] },
  compactOption: { width: 190, minHeight: 30, justifyContent: 'center', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.pill, paddingHorizontal: space[3] },
  expandedOptions: { paddingHorizontal: space[4], paddingBottom: space[2], columnGap: space[2] },
  expandedOption: { width: 196, minHeight: 66, justifyContent: 'space-between', borderRadius: radius.control, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], padding: space[2] },
  sendingMessage: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  failedMessage: { opacity: 0.9 },
});

const desktopAssistantStyles = StyleSheet.create({
  inspector: { backgroundColor: '#fcfcfb' },
  header: { minHeight: 74, paddingHorizontal: space[3], paddingVertical: space[3] },
  mark: { backgroundColor: '#eef3ff', width: 24, height: 24, borderRadius: 8 },
  headerIcon: { width: 28, height: 28, borderRadius: 8 },
  empty: { paddingHorizontal: space[4], paddingTop: space[8], paddingBottom: space[5] },
  emptyMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#eef3ff', alignItems: 'center', justifyContent: 'center', marginBottom: space[1] },
  emptyCopy: { textAlign: 'center', maxWidth: 230 },
  promptStack: { width: '100%', alignItems: 'center', rowGap: space[2], marginTop: space[3] },
  promptChip: { minHeight: 31, justifyContent: 'center', alignItems: 'center', borderRadius: radius.control, backgroundColor: '#f2f4fa', paddingHorizontal: space[3] },
  composer: { padding: space[2], backgroundColor: colors.paper },
  input: { minHeight: 38, maxHeight: 80, borderColor: colors.neutral[200], backgroundColor: '#fcfcfb', paddingVertical: space[2] },
  sendButton: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#eef3ff' },
});

const desktopAskStyles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', minWidth: 0, backgroundColor: colors.cream },
  workspaceNarrow: { flexDirection: 'column' },
  threadRail: { width: 270, backgroundColor: '#fcfcfb', borderRightWidth: 1, borderRightColor: colors.neutral[200], padding: space[3] },
  threadRailHead: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', columnGap: space[2] },
  threadRailTitle: { flexDirection: 'row', alignItems: 'center', columnGap: space[2] },
  threadNew: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.ink },
  threadList: { rowGap: space[1], paddingTop: space[3] },
  thread: { minHeight: 62, borderRadius: radius.control, paddingHorizontal: space[2], paddingVertical: space[2], rowGap: 3 },
  threadActive: { backgroundColor: colors.lime },
  threadTitle: { fontWeight: '700' },
  threadNote: { borderTopWidth: 1, borderColor: colors.neutral[200], paddingTop: space[3], rowGap: space[1] },
  main: { flex: 1, minWidth: 0 },
  mainContent: { width: '100%', maxWidth: 1020, alignSelf: 'center', paddingHorizontal: space[6], paddingVertical: space[6], rowGap: space[4] },
  mainHead: { minHeight: 112, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: space[3] },
  mainCopy: { flex: 1, minWidth: 0, rowGap: space[1] },
  scope: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], backgroundColor: '#eef7ff', borderRadius: radius.control, padding: space[3] },
  suggestion: { minHeight: 168, flexDirection: 'row', alignItems: 'flex-start', columnGap: space[3], borderWidth: 1, borderColor: colors.ink, padding: space[4] },
  suggestionMark: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  suggestionCopy: { flex: 1, minWidth: 0, rowGap: space[2] },
  suggestionText: { fontSize: 18, lineHeight: 26 },
  suggestionActions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[2], rowGap: space[2] },
  toolLabel: { marginTop: space[1] },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[2], rowGap: space[2] },
  tool: { flexBasis: 260, flexGrow: 1, minHeight: 102, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.paper, padding: space[3], rowGap: space[1] },
  toolTitle: { fontWeight: '700' },
  sourceList: { rowGap: space[2] },
  composer: { minHeight: 60, flexDirection: 'row', alignItems: 'center', columnGap: space[3], borderWidth: 1, borderColor: colors.ink, borderRadius: radius.card, backgroundColor: colors.paper, paddingLeft: space[3], paddingRight: space[2] },
  composerInput: { flex: 1, minWidth: 0, color: colors.ink, fontFamily: 'Inter', fontSize: 16, lineHeight: 22, paddingTop: 18, paddingBottom: 18 },
  composerSend: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.ink },
  evidence: { width: 280, backgroundColor: '#fcfcfb', borderLeftWidth: 1, borderColor: colors.neutral[200], padding: space[4], paddingTop: space[6], rowGap: space[3] },
  evidenceCard: { padding: space[3], rowGap: space[2] },
});

const desktopSettingsStyles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', minWidth: 0, backgroundColor: colors.cream },
  sidebar: { width: 280, backgroundColor: '#fcfcfb', borderRightWidth: 1, borderColor: colors.neutral[200], paddingHorizontal: space[5], paddingVertical: space[6], rowGap: space[1] },
  sidebarTitle: { marginBottom: space[4] },
  sideItem: { minHeight: 48, borderRadius: radius.control, justifyContent: 'center', paddingHorizontal: space[3] },
  sideItemActive: { backgroundColor: colors.ink },
  sideItemTextActive: { color: colors.paper },
  main: { flex: 1, minWidth: 0 },
  mainContent: { paddingHorizontal: space[8], paddingVertical: space[6], rowGap: space[4], maxWidth: 1480, width: '100%', alignSelf: 'center' },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[2], rowGap: space[2] },
  shortcutRow: { flexBasis: 250, flexGrow: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', columnGap: space[2], borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.cream, paddingHorizontal: space[3] },
  shortcutLabel: { flex: 1, minWidth: 0 },
  shortcutInput: { width: 76, color: colors.ink, fontFamily: 'DM Mono', fontSize: 13, lineHeight: 18, textAlign: 'right', paddingTop: 8, paddingBottom: 8 },
});

const desktopContactInspectorStyles = StyleSheet.create({
  root: { backgroundColor: '#fcfcfb' },
  head: { alignItems: 'center', borderBottomWidth: 1, borderColor: colors.neutral[200], paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[4], rowGap: space[1] },
  name: { textAlign: 'center', marginTop: space[1] },
  actions: { flexDirection: 'row', columnGap: space[2], marginTop: space[2] },
  content: { padding: space[4], rowGap: space[5] },
  section: { rowGap: space[2] },
  memory: { padding: space[3] },
  promise: { minHeight: 52, flexDirection: 'row', alignItems: 'flex-start', columnGap: space[2], borderBottomWidth: 1, borderColor: colors.neutral[200], paddingVertical: space[2] },
  promiseDot: { width: 14, height: 14, marginTop: 3, borderRadius: 7, borderWidth: 2, borderColor: colors.warning },
  promiseCopy: { flex: 1, minWidth: 0, rowGap: 2 },
});

const desktopPeopleStyles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', minWidth: 0, backgroundColor: colors.cream },
  workspaceNarrow: { flexDirection: 'column' },
  listPane: { width: 300, backgroundColor: '#fcfcfb', borderRightWidth: 1, borderRightColor: colors.neutral[200], paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[3] },
  listPaneNarrow: { width: '100%', maxHeight: 270, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] },
  listTitle: { marginBottom: space[3] },
  search: { height: 52, borderRadius: radius.control, backgroundColor: '#f1f0eb', flexDirection: 'row', alignItems: 'center', columnGap: space[2], paddingHorizontal: space[3], marginBottom: space[3] },
  searchInput: { flex: 1, minWidth: 0, color: colors.ink, fontFamily: 'Inter', fontSize: 16, lineHeight: 21, paddingTop: 14, paddingBottom: 14 },
  listLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2] },
  personList: { rowGap: space[1], paddingBottom: space[4] },
  personRow: { minHeight: 68, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', columnGap: space[3], paddingHorizontal: space[2], paddingVertical: space[2] },
  personRowSelected: { backgroundColor: '#d8c9ff' },
  personCopy: { flex: 1, minWidth: 0, rowGap: 2 },
  personName: { fontWeight: '700' },
  editor: { flex: 1, minWidth: 440, backgroundColor: colors.cream },
  editorContent: { width: '100%', maxWidth: 900, alignSelf: 'center', paddingHorizontal: space[8], paddingVertical: space[6], rowGap: space[3] },
  personHeader: { minHeight: 94, flexDirection: 'row', alignItems: 'center', columnGap: space[3] },
  personHeaderCopy: { flex: 1, minWidth: 0, rowGap: 3 },
  divider: { height: 1, backgroundColor: colors.neutral[200], marginVertical: space[1] },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[2], rowGap: space[2] },
  categoryChip: { minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, paddingHorizontal: space[3] },
  categoryChipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  categoryChipTextSelected: { color: colors.paper },
  memoryInput: { minHeight: 112, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.card, backgroundColor: colors.paper, color: colors.ink, fontFamily: 'Inter', fontSize: 16, lineHeight: 23, textAlignVertical: 'top', padding: space[3] },
  toneGrid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[2], rowGap: space[2] },
  toneCard: { flexGrow: 1, flexBasis: 230, minHeight: 84, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.paper, padding: space[3], rowGap: 3 },
  toneCardSelected: { backgroundColor: colors.lime, borderColor: colors.ink },
  toneTitle: { fontWeight: '700' },
  instructionInput: { minHeight: 88, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.paper, color: colors.ink, fontFamily: 'Inter', fontSize: 15, lineHeight: 22, textAlignVertical: 'top', padding: space[3] },
  previewPane: { width: 320, backgroundColor: '#acd2fb', paddingHorizontal: space[4], paddingTop: space[8], paddingBottom: space[4], rowGap: space[4] },
  previewOverline: { color: colors.neutral[800] },
  previewTitle: { fontSize: 29, lineHeight: 33, letterSpacing: -0.7 },
  previewCard: { padding: space[4], rowGap: space[3], borderWidth: 1, borderColor: colors.ink },
  previewAction: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.ink, paddingHorizontal: space[3] },
  previewActionText: { color: colors.paper },
  previewFocus: { rowGap: space[2], borderTopWidth: 1, borderTopColor: '#88b6e3', paddingTop: space[4] },
});

const desktopConnectionsStyles = StyleSheet.create({
  embeddedScroll: { flex: 1, minWidth: 0, backgroundColor: colors.cream },
  embeddedContent: { paddingHorizontal: 0, paddingVertical: 0 },
  content: { paddingHorizontal: space[8], paddingVertical: space[6], maxWidth: 1380, alignSelf: 'center', width: '100%', rowGap: space[5] },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', columnGap: space[5] },
  headerCopy: { flex: 1, minWidth: 0, rowGap: space[1] },
  headerActions: { flexDirection: 'row', alignItems: 'center', columnGap: space[2] },
  localBanner: { minHeight: 86, borderRadius: radius.card, backgroundColor: colors.successSurface, paddingHorizontal: space[5], paddingVertical: space[4], flexDirection: 'row', alignItems: 'center', columnGap: space[3] },
  bannerMark: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  bannerCopy: { flex: 1, minWidth: 0, rowGap: 3 },
  fallbackNotice: { flexDirection: 'row', alignItems: 'center', columnGap: space[2], borderRadius: radius.control, backgroundColor: colors.warningSurface, paddingHorizontal: space[3], paddingVertical: space[2] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[3], rowGap: space[3] },
  card: { flexBasis: 360, flexGrow: 1, minHeight: 212, maxWidth: 560, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.card, padding: space[4], justifyContent: 'space-between', rowGap: space[3] },
  cardLocal: { backgroundColor: '#fff8dd', borderColor: '#d5bd68' },
  cardSelected: { borderWidth: 2, borderColor: colors.ink },
  cardHead: { flexDirection: 'row', alignItems: 'center', columnGap: space[3] },
  cardIcon: { width: 56, height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  instagramGlyph: { borderWidth: 2, borderColor: colors.paper, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  instagramLens: { width: 8, height: 8, borderWidth: 2, borderColor: colors.paper, borderRadius: 4 },
  cardMark: { color: colors.paper, fontWeight: '800' },
  cardTitle: { flex: 1, minWidth: 0, rowGap: 2 },
  cardStatus: { color: colors.success, textAlign: 'right', maxWidth: 88 },
  cardStatusWarning: { color: colors.warning },
  cardFooter: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.pill, paddingHorizontal: space[3], paddingVertical: space[2], backgroundColor: colors.paper },
  roadmap: { rowGap: space[3], paddingTop: space[3] },
  detail: { maxWidth: 620, alignSelf: 'stretch' },
});

const desktopHomeStyles = StyleSheet.create({
  content: { paddingHorizontal: space[8], paddingVertical: space[6], maxWidth: 1480, alignSelf: 'center', width: '100%', rowGap: space[4] },
  header: { minHeight: 136, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', columnGap: space[5] },
  headerCopy: { flex: 1, minWidth: 0, rowGap: space[1] },
  greeting: { fontSize: 46, lineHeight: 52, letterSpacing: -1.8 },
  subtitle: { color: colors.neutral[600], fontSize: 17, lineHeight: 25 },
  row: { flexDirection: 'row', alignItems: 'stretch', columnGap: space[3] },
  rowStacked: { flexDirection: 'column', rowGap: space[3] },
  card: { flex: 1, minWidth: 0, padding: space[5], rowGap: space[4] },
  cardStacked: { flexBasis: undefined, width: '100%' },
  hero: { flex: 1.45, minHeight: 276, justifyContent: 'space-between', backgroundColor: colors.sky },
  heroExpansive: { minHeight: 324 },
  health: { minHeight: 276, justifyContent: 'flex-start' },
  supportCard: { flex: 1.45, minHeight: 228 },
  promises: { minHeight: 228 },
  actionRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', columnGap: space[3], paddingVertical: space[1] },
  actionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  actionDetail: { fontSize: 14, lineHeight: 20, color: colors.neutral[600] },
  healthRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', columnGap: space[3] },
});
