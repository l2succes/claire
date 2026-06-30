/**
 * Notification Preferences Screen
 *
 * Quiet hours, per-type toggles, and DND.
 * Persists to /preferences on the server.
 */

import { View, Text, ScrollView, Switch, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotificationPrefs {
  notification_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string; // 'HH:MM'
  quiet_hours_end: string;   // 'HH:MM'
  notify_messages: boolean;
  notify_promises: boolean;
  notify_ai_suggestions: boolean;
}

const DEFAULTS: NotificationPrefs = {
  notification_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  notify_messages: true,
  notify_promises: true,
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
  if (typeof extra.notify_promises === 'boolean') prefs.notify_promises = extra.notify_promises;
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
        notify_promises: prefs.notify_promises,
        notify_ai_suggestions: prefs.notify_ai_suggestions,
      },
    }),
  });
  if (!res.ok) throw new Error('Failed to save preferences');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  testID,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row items-center bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-2">
      <View className="flex-1 mr-3">
        <Text className={`font-semibold ${disabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
          {label}
        </Text>
        {description ? (
          <Text className="text-sm text-gray-500 dark:text-gray-400">{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: '#d1d5db', true: '#10b981' }}
        thumbColor={value ? '#fff' : '#f9fafb'}
        testID={testID}
      />
    </View>
  );
}

function TimeSelector({
  label,
  value,
  onChange,
  testID,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testID?: string;
  disabled?: boolean;
}) {
  const index = QUIET_HOURS_OPTIONS.indexOf(value);

  const step = (dir: 1 | -1) => {
    const next = (index + dir + QUIET_HOURS_OPTIONS.length) % QUIET_HOURS_OPTIONS.length;
    onChange(QUIET_HOURS_OPTIONS[next]);
  };

  return (
    <View className="flex-row items-center bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-2">
      <Text className={`flex-1 font-semibold ${disabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>
        {label}
      </Text>
      <View className="flex-row items-center" testID={testID}>
        <TouchableOpacity
          onPress={() => step(-1)}
          disabled={disabled}
          className="px-3 py-1"
          testID={testID ? `${testID}-dec` : undefined}
        >
          <Text className={`text-xl ${disabled ? 'text-gray-300' : 'text-green-500'}`}>‹</Text>
        </TouchableOpacity>
        <Text className={`w-14 text-center font-mono ${disabled ? 'text-gray-400' : 'text-gray-900 dark:text-white'}`}>
          {value}
        </Text>
        <TouchableOpacity
          onPress={() => step(1)}
          disabled={disabled}
          className="px-3 py-1"
          testID={testID ? `${testID}-inc` : undefined}
        >
          <Text className={`text-xl ${disabled ? 'text-gray-300' : 'text-green-500'}`}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function NotificationsSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const loaded = await fetchNotificationPrefs(token);
        setPrefs(loaded);
      } catch {
        // silently use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = (patch: Partial<NotificationPrefs>) => setPrefs((p) => ({ ...p, ...patch }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');
      await saveNotificationPrefs(token, prefs);
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save notification preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  const dndActive = !prefs.notification_enabled;

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-900"
      testID="notifications-settings-screen"
    >
      <View className="p-4">
        {/* Header */}
        <View className="flex-row items-center mb-6">
          <TouchableOpacity onPress={() => router.back()} className="mr-3" testID="notifications-settings-back">
            <ChevronLeft size={24} color="#6b7280" />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-900 dark:text-white flex-1">
            Notifications
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            className="bg-green-500 px-4 py-2 rounded-full"
            testID="notifications-settings-save"
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold">Save</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* DND — master kill-switch */}
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Do Not Disturb
        </Text>
        <ToggleRow
          label="Enable notifications"
          description="Turn off to silence all Claire notifications"
          value={prefs.notification_enabled}
          onValueChange={(v) => update({ notification_enabled: v })}
          testID="notif-toggle-enabled"
        />

        {/* Per-type toggles */}
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mt-4 mb-3">
          Notification types
        </Text>
        <ToggleRow
          label="New messages"
          value={prefs.notify_messages}
          onValueChange={(v) => update({ notify_messages: v })}
          testID="notif-toggle-messages"
          disabled={dndActive}
        />
        <ToggleRow
          label="Promise reminders"
          value={prefs.notify_promises}
          onValueChange={(v) => update({ notify_promises: v })}
          testID="notif-toggle-promises"
          disabled={dndActive}
        />
        <ToggleRow
          label="AI reply suggestions"
          value={prefs.notify_ai_suggestions}
          onValueChange={(v) => update({ notify_ai_suggestions: v })}
          testID="notif-toggle-ai-suggestions"
          disabled={dndActive}
        />

        {/* Quiet hours */}
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mt-4 mb-3">
          Quiet hours
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Silence notifications during a nightly window.
        </Text>
        <ToggleRow
          label="Enable quiet hours"
          value={prefs.quiet_hours_enabled}
          onValueChange={(v) => update({ quiet_hours_enabled: v })}
          testID="notif-toggle-quiet-hours"
          disabled={dndActive}
        />
        <TimeSelector
          label="Start time"
          value={prefs.quiet_hours_start}
          onChange={(v) => update({ quiet_hours_start: v })}
          testID="notif-quiet-start"
          disabled={dndActive || !prefs.quiet_hours_enabled}
        />
        <TimeSelector
          label="End time"
          value={prefs.quiet_hours_end}
          onChange={(v) => update({ quiet_hours_end: v })}
          testID="notif-quiet-end"
          disabled={dndActive || !prefs.quiet_hours_enabled}
        />

        <Text className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">
          These settings control when and how Claire sends you push notifications.
        </Text>
      </View>
    </ScrollView>
  );
}
