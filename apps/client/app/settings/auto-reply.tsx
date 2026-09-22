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
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import { Check, ChevronLeft, Plus, Trash2, Zap } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileHeader, MobileIconButton, SectionLabel } from '../../components/mobile/claire-mobile';
import { FeedbackPressable } from '../../components/mobile/pressable-feedback';
import { SettingsSkeleton } from '../../components/claire/skeleton';
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
    <View testID={`auto-reply-rule-${rule.id}`} style={{ padding: space[4], gap: space[3], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
      <FeedbackPressable
        testID={`auto-reply-toggle-${rule.id}`}
        accessibilityRole="switch"
        accessibilityState={{ checked: rule.enabled }}
        onPress={() => onToggle(rule.id, !rule.enabled)}
        style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space[3], opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}><Zap size={20} color={colors.ink} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text testID={`auto-reply-rule-name-${rule.id}`} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{rule.name}</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{triggerLabel}{keywordSummary ? ` · ${keywordSummary}` : ''}</Text>
        </View>
        <View style={{ width: 49, height: 29, borderRadius: radius.pill, padding: 3, alignItems: rule.enabled ? 'flex-end' : 'flex-start', backgroundColor: rule.enabled ? colors.lime : colors.neutral[300] }}>
          <View style={{ width: 23, height: 23, borderRadius: radius.pill, backgroundColor: colors.paper }} />
        </View>
      </FeedbackPressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingTop: space[3], borderTopWidth: 1, borderColor: colors.neutral[200] }}>
        <Text numberOfLines={2} style={{ ...mobileType.bodySmall, flex: 1, color: colors.neutral[600] }}>“{rule.reply_template}”</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${rule.name}`} onPress={() => onDelete(rule.id)} testID={`auto-reply-delete-${rule.id}`} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={18} color={colors.ink} /></Pressable>
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
  onSave: (form: NewRuleForm) => Promise<boolean>;
  saving: boolean;
}) {
  const [form, setForm] = useState<NewRuleForm>(DEFAULT_FORM);

  const update = (patch: Partial<NewRuleForm>) =>
    setForm((f) => ({ ...f, ...patch }));

  const handleSave = async () => {
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
    if (await onSave(form)) setForm(DEFAULT_FORM);
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
        style={{ flex: 1, backgroundColor: colors.cream }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        <MobileHeader
          title="New rule"
          subtitle="Claire can answer for you when a message matches."
          leading={<MobileIconButton label="Close" testID="auto-reply-modal-close" onPress={onClose}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>}
          actions={
            <Pressable testID="auto-reply-modal-save" onPress={() => void handleSave()} disabled={saving} style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
              {saving ? <ActivityIndicator size="small" color={colors.lime} /> : <Text style={{ ...mobileType.label, color: colors.paper }}>Save</Text>}
            </Pressable>
          }
        />
        <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
          <View style={{ gap: space[2] }}>
          <SectionLabel title="Rule name" />
          <TextInput
            value={form.name}
            onChangeText={(v) => update({ name: v })}
            placeholder="e.g. Out of office"
            placeholderTextColor={colors.neutral[400]}
            style={{ minHeight: 52, paddingHorizontal: space[4], borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.paper, ...mobileType.body, color: colors.ink }}
            testID="auto-reply-name-input"
          />
          </View>

          <View style={{ gap: space[2] }}>
          <SectionLabel title="Trigger" />
            {TRIGGER_OPTIONS.map((t) => (
              <FeedbackPressable
                key={t}
                onPress={() => update({ trigger_type: t })}
                accessibilityRole="radio"
                accessibilityState={{ selected: form.trigger_type === t }}
                style={({ pressed }) => ({ minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], borderRadius: radius.control, borderWidth: form.trigger_type === t ? 1.5 : 1, borderColor: form.trigger_type === t ? colors.ink : colors.neutral[200], backgroundColor: pressed ? colors.sky : colors.paper })}
                testID={`auto-reply-trigger-${t}`}
              >
                <Text style={{ ...mobileType.body, flex: 1, fontWeight: '700', color: colors.ink }}>{TRIGGER_LABELS[t]}</Text>
                <View style={{ width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: form.trigger_type === t ? colors.lime : colors.neutral[100] }}>{form.trigger_type === t ? <Check size={16} color={colors.ink} /> : null}</View>
              </FeedbackPressable>
            ))}
          </View>

          {form.trigger_type === 'keyword' && (
            <View style={{ gap: space[2] }}>
              <SectionLabel title="Keywords" />
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Separate multiple keywords with commas.</Text>
              <TextInput
                value={form.keywords}
                onChangeText={(v) => update({ keywords: v })}
                placeholder="e.g. vacation, away, OOO"
                placeholderTextColor={colors.neutral[400]}
                style={{ minHeight: 52, paddingHorizontal: space[4], borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.paper, ...mobileType.body, color: colors.ink }}
                testID="auto-reply-keywords-input"
                autoCapitalize="none"
              />
            </View>
          )}

          <View style={{ gap: space[2] }}>
          <SectionLabel title="Reply message" />
          <TextInput
            value={form.reply_template}
            onChangeText={(v) => update({ reply_template: v })}
            placeholder="e.g. I'm currently out of office and will reply soon."
            placeholderTextColor={colors.neutral[400]}
            style={{ minHeight: 100, padding: space[4], textAlignVertical: 'top', borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.control, backgroundColor: colors.paper, ...mobileType.body, color: colors.ink }}
            multiline
            numberOfLines={3}
            testID="auto-reply-template-input"
          />
          </View>

          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
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
  const [loadError, setLoadError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const getToken = async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const loadRules = useCallback(async () => {
    setLoadError(false);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const data = await fetchRules(token);
      setRules(data);
    } catch {
      setLoadError(true);
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
      return true;
    } catch {
      Alert.alert('Error', 'Failed to create rule. Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.cream }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingBottom: 112 }}
      testID="auto-reply-settings-screen"
    >
      <MobileHeader
        safeArea
        title="Auto-reply rules"
        subtitle="Review automation and safety limits"
        leading={<MobileIconButton label="Back to Settings" testID="auto-reply-back" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>}
        actions={
          <Pressable testID="auto-reply-add-rule" accessibilityRole="button" accessibilityLabel="Add auto-reply rule" onPress={() => setShowModal(true)} style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color={colors.paper} />
          </Pressable>
        }
      />
      {loading ? <SettingsSkeleton testID="auto-reply-loading" /> : (
      <View style={{ paddingHorizontal: space[4], gap: space[4] }}>
        {loadError ? (
          <View style={{ padding: space[5], gap: space[3], alignItems: 'center', borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
            <Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>Could not load rules</Text>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'center' }}>Your rules are unchanged. Try again when the connection is ready.</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadRules()} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: colors.ink }}><Text style={{ ...mobileType.label, color: colors.paper }}>Try again</Text></Pressable>
          </View>
        ) : rules.length === 0 ? (
          <View
            style={{ padding: space[5], alignItems: 'center', gap: space[3], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}
            testID="auto-reply-empty"
          >
            <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}><Zap size={26} color={colors.ink} /></View>
            <Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>No rules yet</Text>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'center' }}>Create a rule to automatically reply to messages that match specific triggers.</Text>
            <Pressable
              onPress={() => setShowModal(true)}
              accessibilityRole="button"
              style={{ minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
              testID="auto-reply-create-first"
            >
              <Text style={{ ...mobileType.label, color: colors.paper }}>Create rule</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <SectionLabel title="Your rules" />
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
              {rules.filter((r) => r.enabled).length} of {rules.length} rule
              {rules.length !== 1 ? 's' : ''} active
            </Text>
            <View testID="auto-reply-rules-list" style={{ gap: space[3] }}>
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

        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
          Auto-replies are rate-limited to protect your conversations.
        </Text>
      </View>
      )}

      <CreateRuleModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleCreate}
        saving={saving}
      />
    </ScrollView>
  );
}
