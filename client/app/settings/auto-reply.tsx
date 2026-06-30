/**
 * Auto-Reply Rules Settings Screen (issue #40)
 *
 * Allows users to create, toggle, and delete auto-reply rules.
 * Talks to /auto-reply CRUD API (issue #39 / PR #89).
 */

import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { ChevronLeft, Plus, Trash2, Zap } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggerType = 'keyword' | 'birthday' | 'thanks';

interface AutoReplyRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger_type: TriggerType;
  keywords?: string[];
  reply_template: string;
  platforms?: string[];
  max_per_hour: number;
  max_per_day: number;
  created_at: string;
}

interface NewRuleForm {
  name: string;
  trigger_type: TriggerType;
  keywords: string;
  reply_template: string;
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  keyword: 'Keyword match',
  birthday: 'Birthday message',
  thanks: 'Thank-you message',
};

const DEFAULT_FORM: NewRuleForm = {
  name: '',
  trigger_type: 'keyword',
  keywords: '',
  reply_template: '',
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchRules(token: string): Promise<AutoReplyRule[]> {
  const res = await fetch(`${API_BASE_URL}/auto-reply`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch rules');
  const body = await res.json();
  return body.rules ?? [];
}

async function createRule(
  token: string,
  form: NewRuleForm
): Promise<AutoReplyRule> {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    trigger_type: form.trigger_type,
    reply_template: form.reply_template.trim(),
  };
  if (form.trigger_type === 'keyword' && form.keywords.trim()) {
    payload.keywords = form.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
  }
  const res = await fetch(`${API_BASE_URL}/auto-reply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create rule');
  const body = await res.json();
  return body.rule;
}

async function toggleRule(
  token: string,
  id: string,
  enabled: boolean
): Promise<AutoReplyRule> {
  const res = await fetch(`${API_BASE_URL}/auto-reply/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error('Failed to update rule');
  const body = await res.json();
  return body.rule;
}

async function deleteRule(token: string, id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auto-reply/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to delete rule');
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule: AutoReplyRule;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const triggerLabel = TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type;
  const keywordSummary =
    rule.trigger_type === 'keyword' && rule.keywords?.length
      ? rule.keywords.slice(0, 3).join(', ') +
        (rule.keywords.length > 3 ? ` +${rule.keywords.length - 3}` : '')
      : null;

  return (
    <View
      className="bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-3"
      testID={`auto-reply-rule-${rule.id}`}
    >
      <View className="flex-row items-center mb-1">
        <View className="flex-1 mr-2">
          <Text
            className="font-semibold text-gray-900 dark:text-white"
            testID={`auto-reply-rule-name-${rule.id}`}
          >
            {rule.name}
          </Text>
          <Text className="text-xs text-green-600 dark:text-green-400 mt-0.5">
            {triggerLabel}
          </Text>
          {keywordSummary ? (
            <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Keywords: {keywordSummary}
            </Text>
          ) : null}
        </View>
        <Switch
          value={rule.enabled}
          onValueChange={(v) => onToggle(rule.id, v)}
          trackColor={{ false: '#d1d5db', true: '#10b981' }}
          thumbColor={rule.enabled ? '#fff' : '#f9fafb'}
          testID={`auto-reply-toggle-${rule.id}`}
        />
      </View>
      <View className="flex-row items-start mt-2">
        <Text
          className="text-sm text-gray-600 dark:text-gray-300 flex-1 italic"
          numberOfLines={2}
        >
          "{rule.reply_template}"
        </Text>
        <TouchableOpacity
          onPress={() => onDelete(rule.id)}
          className="ml-3 p-1"
          testID={`auto-reply-delete-${rule.id}`}
        >
          <Trash2 size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CreateRuleModal({
  visible,
  onClose,
  onSave,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (form: NewRuleForm) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<NewRuleForm>(DEFAULT_FORM);

  const update = (patch: Partial<NewRuleForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const handleSave = () => {
    if (!form.name.trim()) {
      Alert.alert('Validation', 'Rule name is required.');
      return;
    }
    if (!form.reply_template.trim()) {
      Alert.alert('Validation', 'Reply template is required.');
      return;
    }
    if (
      form.trigger_type === 'keyword' &&
      !form.keywords.trim()
    ) {
      Alert.alert('Validation', 'At least one keyword is required for keyword rules.');
      return;
    }
    onSave(form);
    setForm(DEFAULT_FORM);
  };

  const TRIGGER_OPTIONS: TriggerType[] = ['keyword', 'birthday', 'thanks'];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      testID="auto-reply-create-modal"
    >
      <ScrollView
        className="flex-1 bg-gray-50 dark:bg-gray-900"
        keyboardShouldPersistTaps="handled"
      >
        <View className="p-4">
          {/* Header */}
          <View className="flex-row items-center mb-6">
            <TouchableOpacity
              onPress={onClose}
              className="mr-3"
              testID="auto-reply-modal-close"
            >
              <ChevronLeft size={24} color="#6b7280" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900 dark:text-white flex-1">
              New Rule
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="bg-green-500 px-4 py-2 rounded-full"
              testID="auto-reply-modal-save"
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-semibold">Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Rule name */}
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Rule name
          </Text>
          <TextInput
            value={form.name}
            onChangeText={(v) => update({ name: v })}
            placeholder="e.g. Out of office"
            placeholderTextColor="#9ca3af"
            className="bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-4 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
            testID="auto-reply-name-input"
          />

          {/* Trigger type */}
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Trigger
          </Text>
          <View className="mb-4">
            {TRIGGER_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => update({ trigger_type: t })}
                className={`flex-row items-center bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-2 ${
                  form.trigger_type === t
                    ? 'border-2 border-green-500'
                    : 'border border-gray-200 dark:border-gray-700'
                }`}
                testID={`auto-reply-trigger-${t}`}
              >
                <Text className="flex-1 font-medium text-gray-900 dark:text-white">
                  {TRIGGER_LABELS[t]}
                </Text>
                {form.trigger_type === t && (
                  <View className="w-4 h-4 rounded-full bg-green-500" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Keywords (only for keyword trigger) */}
          {form.trigger_type === 'keyword' && (
            <>
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Keywords (comma-separated)
              </Text>
              <TextInput
                value={form.keywords}
                onChangeText={(v) => update({ keywords: v })}
                placeholder="e.g. vacation, away, OOO"
                placeholderTextColor="#9ca3af"
                className="bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-4 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
                testID="auto-reply-keywords-input"
                autoCapitalize="none"
              />
            </>
          )}

          {/* Reply template */}
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
            Reply message
          </Text>
          <TextInput
            value={form.reply_template}
            onChangeText={(v) => update({ reply_template: v })}
            placeholder="e.g. I'm currently out of office and will reply soon."
            placeholderTextColor="#9ca3af"
            className="bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-4 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700"
            multiline
            numberOfLines={3}
            testID="auto-reply-template-input"
          />

          <Text className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2">
            Rules are limited to 5 replies/hour and 20 replies/day by default.
          </Text>
        </View>
      </ScrollView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AutoReplySettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<AutoReplyRule[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const getToken = async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const loadRules = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const data = await fetchRules(token);
      setRules(data);
    } catch {
      // silently show empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleToggle = async (id: string, enabled: boolean) => {
    // Optimistic update
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled } : r))
    );
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      await toggleRule(token, id, enabled);
    } catch {
      // Revert on failure
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r))
      );
      Alert.alert('Error', 'Failed to update rule. Please try again.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Rule', 'Are you sure you want to delete this rule?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Optimistic removal
          setRules((prev) => prev.filter((r) => r.id !== id));
          try {
            const token = await getToken();
            if (!token) throw new Error('Not authenticated');
            await deleteRule(token, id);
          } catch {
            // Reload to restore accurate state
            loadRules();
            Alert.alert('Error', 'Failed to delete rule. Please try again.');
          }
        },
      },
    ]);
  };

  const handleCreate = async (form: NewRuleForm) => {
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const rule = await createRule(token, form);
      setRules((prev) => [...prev, rule]);
      setShowModal(false);
    } catch {
      Alert.alert('Error', 'Failed to create rule. Please try again.');
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

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-900"
      testID="auto-reply-settings-screen"
    >
      <View className="p-4">
        {/* Header */}
        <View className="flex-row items-center mb-6">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-3"
            testID="auto-reply-back"
          >
            <ChevronLeft size={24} color="#6b7280" />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-900 dark:text-white flex-1">
            Auto-Reply Rules
          </Text>
          <TouchableOpacity
            onPress={() => setShowModal(true)}
            className="bg-green-500 rounded-full p-2"
            testID="auto-reply-add-rule"
          >
            <Plus size={20} color="white" />
          </TouchableOpacity>
        </View>

        {/* Empty state */}
        {rules.length === 0 ? (
          <View
            className="bg-white dark:bg-gray-800 rounded-xl p-8 items-center"
            testID="auto-reply-empty"
          >
            <Zap size={40} color="#10b981" />
            <Text className="text-gray-900 dark:text-white font-semibold text-lg mt-4">
              No rules yet
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 text-sm text-center mt-2 mb-5">
              Create a rule to automatically reply to messages that match specific triggers.
            </Text>
            <TouchableOpacity
              onPress={() => setShowModal(true)}
              className="bg-green-500 px-5 py-2.5 rounded-full"
              testID="auto-reply-create-first"
            >
              <Text className="text-white font-semibold">Create Rule</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {rules.filter((r) => r.enabled).length} of {rules.length} rule
              {rules.length !== 1 ? 's' : ''} active
            </Text>
            <View testID="auto-reply-rules-list">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </View>
          </>
        )}

        <Text className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">
          Auto-replies are rate-limited to protect your conversations.
        </Text>
      </View>

      <CreateRuleModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleCreate}
        saving={saving}
      />
    </ScrollView>
  );
}
