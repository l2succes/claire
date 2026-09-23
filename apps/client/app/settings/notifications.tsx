/**
 * Notification Preferences Screen
 *
 * Quiet hours, per-type toggles, and DND.
 * Persists to /preferences on the server.
 */

import { View, Text, ScrollView, Alert, Linking, Platform, Pressable } from 'react-native';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { router } from 'expo-router';
import { BellRing, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileHeader, MobileIconButton, SectionLabel } from '../../components/mobile/claire-mobile';
import { SettingsSkeleton } from '../../components/claire/skeleton';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';
import { useAuthStore } from '../../stores/authStore';
import { readQuerySnapshot, writeQuerySnapshot } from '../../services/mobile-cache';
import { getNativeNotificationPermission, registerNotificationDevice, requestNativeNotificationPermission, requestWebNotificationPermission, supportsWebNotifications } from '../../services/notifications';
import { createSerialSaveQueue } from '../../features/settings/serial-save-queue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationPrefs {
  notification_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // 'HH:MM'
  quiet_hours_end: string;   // 'HH:MM'
  notify_messages: boolean;
  notify_loops: boolean;
  notify_ai_suggestions: boolean;
}

const DEFAULTS: NotificationPrefs = {
  notification_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  notify_messages: true,
  notify_loops: true,
  notify_ai_suggestions: false,
};

const QUIET_HOURS_OPTIONS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchNotificationPrefs(token: string): Promise<NotificationPrefs> {
  const res = await fetch(`${API_BASE_URL}/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch preferences');
  const { data } = await res.json();
  // Merge server fields into defaults (server uses notification_* prefix in JSONB)
  const prefs: Partial<NotificationPrefs> = {};
  if (typeof data.notification_enabled === 'boolean') {
    prefs.notification_enabled = data.notification_enabled;
  }
  const extra = data.preferences ?? {};
  if (typeof extra.quiet_hours_enabled === 'boolean') prefs.quiet_hours_enabled = extra.quiet_hours_enabled;
  if (typeof extra.quiet_hours_start === 'string') prefs.quiet_hours_start = extra.quiet_hours_start;
  if (typeof extra.quiet_hours_end === 'string') prefs.quiet_hours_end = extra.quiet_hours_end;
  if (typeof extra.notify_messages === 'boolean') prefs.notify_messages = extra.notify_messages;
  if (typeof extra.notify_loops === 'boolean') prefs.notify_loops = extra.notify_loops;
  if (typeof extra.notify_ai_suggestions === 'boolean') prefs.notify_ai_suggestions = extra.notify_ai_suggestions;
  return { ...DEFAULTS, ...prefs };
}

async function saveNotificationPrefs(token: string, prefs: NotificationPrefs): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/preferences`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      notification_enabled: prefs.notification_enabled,
      preferences: {
        quiet_hours_enabled: prefs.quiet_hours_enabled,
        quiet_hours_start: prefs.quiet_hours_start,
        quiet_hours_end: prefs.quiet_hours_end,
        notify_messages: prefs.notify_messages,
        notify_loops: prefs.notify_loops,
        notify_ai_suggestions: prefs.notify_ai_suggestions,
      },
    }),
  });
  if (!res.ok) throw new Error('Failed to save preferences');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function SettingsSection({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <SectionLabel title={title} />
      {detail ? <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], paddingHorizontal: 2 }}>{detail}</Text> : null}
      <View style={{ backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 16, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

function ClaireSwitchTrack({ value, disabled }: { value: boolean; disabled?: boolean }) {
  return (
    <View
      style={{ width: 48, height: 28, flexShrink: 0, justifyContent: 'center', padding: 2, borderRadius: radius.pill, backgroundColor: value ? colors.lime : colors.neutral[200], opacity: disabled ? 0.45 : 1 }}
    >
      <View style={{ width: 24, height: 24, alignSelf: value ? 'flex-end' : 'flex-start', borderRadius: radius.pill, backgroundColor: colors.ink }} />
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  testID,
  disabled = false,
  divided = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
  disabled?: boolean;
  divided?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderTopWidth: divided ? 1 : 0, borderTopColor: colors.neutral[200], backgroundColor: pressed ? colors.sky : colors.paper }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ ...mobileType.body, fontWeight: '700', color: disabled ? colors.neutral[400] : colors.ink }}>
          {label}
        </Text>
        {description ? (
          <Text style={{ ...mobileType.bodySmall, color: disabled ? colors.neutral[400] : colors.neutral[600], marginTop: 2 }}>{description}</Text>
        ) : null}
      </View>
      <ClaireSwitchTrack value={value} disabled={disabled} />
    </Pressable>
  );
}

function TimeSelector({
  label,
  value,
  onChange,
  testID,
  disabled = false,
  divided = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID?: string;
  disabled?: boolean;
  divided?: boolean;
}) {
  const index = QUIET_HOURS_OPTIONS.indexOf(value);

  const step = (dir: 1 | -1) => {
    const next = (index + dir + QUIET_HOURS_OPTIONS.length) % QUIET_HOURS_OPTIONS.length;
    onChange(QUIET_HOURS_OPTIONS[next]);
  };

  return (
    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: 10, borderTopWidth: divided ? 1 : 0, borderTopColor: colors.neutral[200] }}>
      <Text style={{ flex: 1, ...mobileType.body, fontWeight: '700', color: disabled ? colors.neutral[400] : colors.ink }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], opacity: disabled ? 0.4 : 1 }} testID={testID}>
        <Pressable
          onPress={() => step(-1)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Earlier ${label.toLowerCase()}`}
          hitSlop={6}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.neutral[100] }}
          testID={testID ? `${testID}-dec` : undefined}
        >
          <ChevronLeft size={16} color={colors.ink} />
        </Pressable>
        <Text style={{ width: 52, textAlign: 'center', ...mobileType.body, fontFamily: 'DM Mono', color: colors.ink }}>
          {value}
        </Text>
        <Pressable
          onPress={() => step(1)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Later ${label.toLowerCase()}`}
          hitSlop={6}
          style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.neutral[100] }}
          testID={testID ? `${testID}-inc` : undefined}
        >
          <ChevronRight size={16} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

export default function NotificationsSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS);
  const [systemPermission, setSystemPermission] = useState('unknown');
  const prefsRef = useRef(DEFAULTS);
  const editRevisionRef = useRef(0);
  const latestSaveRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const saveQueueRef = useRef(createSerialSaveQueue<NotificationPrefs>(async (next) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    await saveNotificationPrefs(session.access_token, next);
    const userId = useAuthStore.getState().user?.id;
    if (userId) await writeQuerySnapshot(userId, 'preferences:notifications', next);
  }));

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    // Preferences change only when the user edits them, so the last known set
    // is the right first frame. Without this the screen showed a spinner on
    // every open while it re-read values it already had.
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;
    let active = true;
    void readQuerySnapshot<NotificationPrefs>(userId, 'preferences:notifications')
      .then((snapshot) => {
        if (!active || !snapshot?.data || editRevisionRef.current > 0) return;
        prefsRef.current = snapshot.data;
        setPrefs(snapshot.data);
        setLoading(false);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const revisionAtStart = editRevisionRef.current;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const loaded = await fetchNotificationPrefs(token);
        if (editRevisionRef.current === revisionAtStart) {
          prefsRef.current = loaded;
          setPrefs(loaded);
          const userId = useAuthStore.getState().user?.id;
          if (userId) void writeQuerySnapshot(userId, 'preferences:notifications', loaded).catch(() => undefined);
        }
        setLoading(false);
        setSystemPermission(await getNativeNotificationPermission());
      } catch {
        // silently use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const enqueueSave = (next: NotificationPrefs): void => {
    setSaving(true);
    setSaveFailed(false);
    const task = saveQueueRef.current(next);
    latestSaveRef.current = task;
    void task.then(() => {
      if (!mountedRef.current || latestSaveRef.current !== task) return;
      setSaving(false);
    }).catch(() => {
      if (!mountedRef.current || latestSaveRef.current !== task) return;
      setSaving(false);
      setSaveFailed(true);
      Alert.alert('Changes not saved', 'Check your connection and try again.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Try again', onPress: () => enqueueSave(prefsRef.current) },
      ]);
    });
  };

  const update = (patch: Partial<NotificationPrefs>) => {
    const next = { ...prefsRef.current, ...patch };
    editRevisionRef.current += 1;
    prefsRef.current = next;
    setPrefs(next);
    enqueueSave(next);
  };

  const handleEnableBrowserNotifications = async () => {
    const permission = await requestWebNotificationPermission();
    if (permission === 'granted') {
      Alert.alert('Browser notifications enabled', 'Claire will alert you about new messages while this web app is open.');
    } else if (permission !== 'unsupported') {
      Alert.alert('Browser notifications are off', 'Enable notifications for Claire in your browser settings to receive message alerts.');
    }
  };

  const handleNativePermission = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    if (systemPermission === 'denied') {
      await Linking.openSettings();
      return;
    }
    const permission = await requestNativeNotificationPermission();
    if (permission === 'granted') await registerNotificationDevice(session.access_token);
    setSystemPermission(await getNativeNotificationPermission());
  };

  const dndActive = !prefs.notification_enabled;

  return (
    <ScrollView
      testID="notifications-settings-screen"
      style={{ flex: 1, backgroundColor: colors.cream }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: 64 }}
    >
      <MobileHeader
        safeArea
        title="Notifications"
        subtitle="Push alerts and quiet hours. In-app notifications remain available."
        leading={<MobileIconButton label="Back to Settings" testID="notifications-settings-back" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>}
      />
      {loading ? <SettingsSkeleton testID="notifications-settings-loading" /> : (
      <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
        <SettingsSection title="Push delivery">
          <ToggleRow
            label="Push alerts"
            description="Turn off lock-screen alerts. Notifications still appear in Claire."
            value={prefs.notification_enabled}
            onValueChange={(v) => update({ notification_enabled: v })}
            testID="notif-toggle-enabled"
          />
          {supportsWebNotifications() ? (
            <Pressable
              onPress={() => void handleEnableBrowserNotifications()}
              style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderTopWidth: 1, borderTopColor: colors.neutral[200] }}
              testID="notif-enable-browser"
            >
              <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.sky }}><BellRing size={17} color={colors.ink} /></View>
              <View style={{ flex: 1, minWidth: 0 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Browser notifications</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Enable alerts while Claire is open in this browser.</Text></View>
              <ChevronRight size={18} color={colors.neutral[400]} />
            </Pressable>
          ) : null}
          {Platform.OS !== 'web' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Device notification permission"
              onPress={() => { handleNativePermission().catch(() => Alert.alert('Notifications unavailable', 'Claire could not update the system notification permission.')); }}
              style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderTopWidth: 1, borderTopColor: colors.neutral[200] }}
              testID="notif-enable-native"
            >
              <View style={{ width: 36, height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: colors.sky }}><BellRing size={17} color={colors.ink} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Device notifications</Text>
                <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], marginTop: 2 }}>
                  {systemPermission === 'granted' ? 'Allowed by iOS and registered with Claire.' : systemPermission === 'denied' ? 'Open iOS Settings to allow alerts.' : 'Tap to allow alerts on this device.'}
                </Text>
              </View>
              <View style={{ minHeight: 26, justifyContent: 'center', paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: systemPermission === 'granted' ? colors.successSurface : colors.neutral[100] }}>
                <Text style={{ ...mobileType.label, color: systemPermission === 'granted' ? colors.success : colors.neutral[600], textTransform: 'capitalize' }}>{systemPermission}</Text>
              </View>
            </Pressable>
          ) : null}
        </SettingsSection>

        <SettingsSection title="Push alert types">
          <ToggleRow
            label="New messages"
            value={prefs.notify_messages}
            onValueChange={(v) => update({ notify_messages: v })}
            testID="notif-toggle-messages"
            disabled={dndActive}
          />
          <ToggleRow
            divided
            label="Loop reminders"
            description="Timed around urgency, deadlines, and who owes the next move."
            value={prefs.notify_loops}
            onValueChange={(v) => update({ notify_loops: v })}
            testID="notif-toggle-loops"
            disabled={dndActive}
          />
          <ToggleRow
            divided
            label="AI reply suggestions"
            value={prefs.notify_ai_suggestions}
            onValueChange={(v) => update({ notify_ai_suggestions: v })}
            testID="notif-toggle-ai-suggestions"
            disabled={dndActive}
          />
        </SettingsSection>

        <SettingsSection title="Quiet hours" detail="Silence notifications during a nightly window.">
          <ToggleRow
            label="Use quiet hours"
            value={prefs.quiet_hours_enabled}
            onValueChange={(v) => update({ quiet_hours_enabled: v })}
            testID="notif-toggle-quiet-hours"
            disabled={dndActive}
          />
          <TimeSelector
            divided
            label="Start time"
            value={prefs.quiet_hours_start}
            onChange={(v) => update({ quiet_hours_start: v })}
            testID="notif-quiet-start"
            disabled={dndActive || !prefs.quiet_hours_enabled}
          />
          <TimeSelector
            divided
            label="End time"
            value={prefs.quiet_hours_end}
            onChange={(v) => update({ quiet_hours_end: v })}
            testID="notif-quiet-end"
            disabled={dndActive || !prefs.quiet_hours_enabled}
          />
        </SettingsSection>

        <Text testID="notifications-autosave-status" style={{ ...mobileType.bodySmall, color: saveFailed ? colors.danger : colors.neutral[400], textAlign: 'center', paddingHorizontal: space[4] }}>
          {saveFailed ? 'Changes could not be saved.' : saving ? 'Saving changes…' : 'Changes save automatically.'}
        </Text>
      </View>
      )}
    </ScrollView>
  );
}
