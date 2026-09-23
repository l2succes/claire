/**
 * AI Settings Screen
 *
 * Allows users to configure their tone and personality preferences
 * which are persisted server-side and injected into AI prompt context.
 */

import { View, Text, ScrollView, ActivityIndicator, Alert, TextInput, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Bot, Check, ChevronLeft, Pencil, RefreshCw } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileHeader, MobileIconButton, SectionLabel } from '../../components/mobile/claire-mobile';
import { FeedbackPressable } from '../../components/mobile/pressable-feedback';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';
import { useAuthStore } from '../../stores/authStore';
import { readQuerySnapshot, writeQuerySnapshot } from '../../services/mobile-cache';
import { SettingsSkeleton } from '../../components/claire/skeleton';

const TONES = [
  { value: 'friendly', label: 'Friendly', description: 'Warm and approachable' },
  { value: 'professional', label: 'Professional', description: 'Formal and business-like' },
  { value: 'casual', label: 'Casual', description: 'Relaxed and informal' },
  { value: 'formal', label: 'Formal', description: 'Polite and structured' },
  { value: 'empathetic', label: 'Empathetic', description: 'Caring and understanding' },
] as const;

const STYLES = [
  { value: 'concise', label: 'Concise', description: 'Short and to the point' },
  { value: 'balanced', label: 'Balanced', description: 'Neither too short nor too long' },
  { value: 'detailed', label: 'Detailed', description: 'Thorough and comprehensive' },
] as const;

type Tone = typeof TONES[number]['value'];
type Style = typeof STYLES[number]['value'];

interface Preferences {
  tone: Tone;
  response_style: Style;
  language: string;
  preferences?: { ai_enabled?: boolean };
}

interface PrivacyDisclosure { enabled: boolean; provider: string; message: string; operationsTelemetry: string; }

interface VoiceProfile {
  language: string;
  profile: string;
  sourceMessageCount: number;
  pendingMessageCount: number;
  status: 'idle' | 'building' | 'ready' | 'failed' | 'stale';
}

function ChoiceRow({ label, description, selected, onPress, testID }: {
  label: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <FeedbackPressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${description}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 68,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingHorizontal: space[4],
        paddingVertical: space[3],
        borderRadius: radius.control,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? colors.ink : colors.neutral[200],
        backgroundColor: pressed ? colors.sky : colors.paper,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{label}</Text>
        <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{description}</Text>
      </View>
      <View style={{ width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.lime : colors.neutral[100] }}>
        {selected ? <Check size={16} color={colors.ink} /> : null}
      </View>
    </FeedbackPressable>
  );
}

function voiceSummary(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.values(parsed).filter((item): item is string => typeof item === 'string').slice(0, 2).join(' · ') || 'Voice notes are ready.';
    }
  } catch {
    // Manually written voice notes are plain text.
  }
  return value || 'Voice notes are ready.';
}

function VoiceProfileCard({ profile, onSave, onReset }: {
  profile: VoiceProfile;
  onSave: (language: string, draft: string) => Promise<void>;
  onReset: (language: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.profile);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(profile.profile);
  }, [editing, profile.profile]);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(profile.language, draft);
      setEditing(false);
    } catch {
      Alert.alert('Could not save voice notes', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ padding: space[4], gap: space[3], backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: colors.lavender, alignItems: 'center', justifyContent: 'center' }}><Bot size={19} color={colors.ink} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{profile.language.toUpperCase()} voice</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{profile.sourceMessageCount} messages learned</Text>
        </View>
      </View>
      {editing ? (
        <>
          <TextInput
            testID={`voice-profile-${profile.language}`}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={1500}
            textAlignVertical="top"
            style={{ minHeight: 120, padding: space[3], borderRadius: radius.control, borderWidth: 1, borderColor: colors.neutral[300], backgroundColor: colors.cream, ...mobileType.bodySmall, color: colors.ink }}
          />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Pressable onPress={() => setEditing(false)} style={{ minHeight: 42, paddingHorizontal: space[3], justifyContent: 'center' }}><Text style={{ ...mobileType.label, color: colors.ink }}>Cancel</Text></Pressable>
            <Pressable disabled={saving} onPress={() => void save()} style={{ minHeight: 42, paddingHorizontal: space[4], borderRadius: radius.pill, justifyContent: 'center', backgroundColor: colors.ink, opacity: saving ? 0.6 : 1 }}><Text style={{ ...mobileType.label, color: colors.paper }}>{saving ? 'Saving…' : 'Save voice notes'}</Text></Pressable>
          </View>
        </>
      ) : (
        <>
          <Text numberOfLines={2} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{voiceSummary(profile.profile)}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            <Pressable testID={`voice-profile-edit-${profile.language}`} onPress={() => setEditing(true)} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.neutral[300] }}><Pencil size={14} color={colors.ink} /><Text style={{ ...mobileType.label, color: colors.ink }}>Edit voice notes</Text></Pressable>
            <Pressable testID={`voice-profile-reset-${profile.language}`} onPress={() => void onReset(profile.language)} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: space[3] }}><Text style={{ ...mobileType.label, color: colors.neutral[600] }}>Reset</Text></Pressable>
          </View>
        </>
      )}
    </View>
  );
}

async function fetchPreferences(token: string): Promise<Preferences> {
  const res = await fetch(`${API_BASE_URL}/preferences`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch preferences');
  const { data } = await res.json();
  return data;
}

async function savePreferences(token: string, prefs: Partial<Preferences>): Promise<Preferences> {
  const res = await fetch(`${API_BASE_URL}/preferences`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error('Failed to save preferences');
  const { data } = await res.json();
  return data;
}

export default function AISettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tone, setTone] = useState<Tone>('friendly');
  const [style, setStyle] = useState<Style>('concise');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [privacyDisclosure, setPrivacyDisclosure] = useState<PrivacyDisclosure | null>(null);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [rebuildingVoice, setRebuildingVoice] = useState(false);

  useEffect(() => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;
    let active = true;
    void readQuerySnapshot<{ tone: string; style: string }>(userId, 'preferences:ai')
      .then((snapshot) => {
        if (!active || !snapshot?.data) return;
        setTone(snapshot.data.tone as Tone);
        setStyle(snapshot.data.style as Style);
        setLoading(false);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const extras = Promise.allSettled([
          fetch(`${API_BASE_URL}/preferences/voice-profiles`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE_URL}/preferences/privacy`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        const prefs = await fetchPreferences(token);
        if (!active) return;
        setTone(prefs.tone as Tone);
        setStyle(prefs.response_style as Style);
        const cacheUserId = useAuthStore.getState().user?.id;
        if (cacheUserId) void writeQuerySnapshot(cacheUserId, 'preferences:ai', { tone: prefs.tone, style: prefs.response_style }).catch(() => undefined);
        setAiEnabled(prefs.preferences?.ai_enabled !== false);
        setLoading(false);
        const [voiceResult, privacyResult] = await extras;
        if (!active) return;
        if (voiceResult.status === 'fulfilled' && voiceResult.value.ok) setVoiceProfiles((await voiceResult.value.json()).data || []);
        if (privacyResult.status === 'fulfilled' && privacyResult.value.ok) setPrivacyDisclosure((await privacyResult.value.json()).data);
      } catch {
        // silently use defaults
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');
      await savePreferences(token, { tone, response_style: style, preferences: { ai_enabled: aiEnabled } });
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const rebuildVoice = async () => {
    setRebuildingVoice(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const response = await fetch(`${API_BASE_URL}/preferences/voice-profiles/rebuild`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error('Could not rebuild voice');
      setVoiceProfiles((await response.json()).data || voiceProfiles);
    } catch {
      Alert.alert('Error', 'Could not rebuild your voice profile.');
    } finally { setRebuildingVoice(false); }
  };

  const saveVoice = async (language: string, profile: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    const response = await fetch(`${API_BASE_URL}/preferences/voice-profiles/${encodeURIComponent(language)}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }),
    });
    if (!response.ok) throw new Error('Could not save voice profile');
    setVoiceProfiles(current => current.map(item => item.language === language ? { ...item, profile } : item));
  };

  const resetVoice = async (language: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const response = await fetch(`${API_BASE_URL}/preferences/voice-profiles/${encodeURIComponent(language)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('Could not reset voice');
      setVoiceProfiles(current => current.filter(profile => profile.language !== language));
    } catch {
      Alert.alert('Error', 'Could not reset this voice profile.');
    }
  };

  return (
    <ScrollView
      testID="ai-settings-screen"
      style={{ flex: 1, backgroundColor: colors.cream }}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 112 }}
    >
      <MobileHeader
        safeArea
        title="AI behavior"
        subtitle="How Claire responds across your conversations"
        leading={<MobileIconButton label="Back to Settings" testID="ai-settings-back" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>}
        actions={
          <Pressable testID="ai-settings-save" onPress={() => void handleSave()} disabled={saving || loading} style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: saving || loading ? 0.6 : 1 }}>
            {saving ? <ActivityIndicator size="small" color={colors.lime} /> : <Text style={{ ...mobileType.label, color: colors.paper }}>Save</Text>}
          </Pressable>
        }
      />
      {loading ? <SettingsSkeleton testID="ai-settings-loading" /> : (
        <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
          <View style={{ padding: space[4], gap: space[3], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
            <FeedbackPressable
              testID="ai-processing-toggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: aiEnabled }}
              onPress={() => setAiEnabled(current => !current)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, opacity: pressed ? 0.7 : 1 })}
            >
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}><Bot size={21} color={colors.ink} /></View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Use Claire AI</Text>
                <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{aiEnabled ? 'On across your conversations' : 'Off — messaging still works'}</Text>
              </View>
              <View style={{ width: 49, height: 29, borderRadius: radius.pill, padding: 3, alignItems: aiEnabled ? 'flex-end' : 'flex-start', backgroundColor: aiEnabled ? colors.lime : colors.neutral[300] }}>
                <View style={{ width: 23, height: 23, borderRadius: radius.pill, backgroundColor: colors.paper }} />
              </View>
            </FeedbackPressable>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Turning this off stops suggestions, summaries, Ask Claire, voice learning, and AI promise detection.</Text>
            <View style={{ borderTopWidth: 1, borderColor: colors.neutral[200], paddingTop: space[3], gap: space[2] }}>
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{privacyDisclosure?.message || 'When enabled, selected conversation context may be sent to Claire’s configured AI provider.'}</Text>
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{privacyDisclosure?.operationsTelemetry || 'Operations telemetry never includes message content.'}</Text>
            </View>
          </View>

          <View style={{ gap: space[3] }}>
            <SectionLabel title="Response tone" />
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>How suggestions should sound</Text>
            <View style={{ gap: space[2] }}>
              {TONES.map(option => <ChoiceRow key={option.value} testID={`tone-option-${option.value}`} label={option.label} description={option.description} selected={tone === option.value} onPress={() => setTone(option.value)} />)}
            </View>
          </View>

          <View style={{ gap: space[3] }}>
            <SectionLabel title="Response style" />
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>How much detail Claire should include</Text>
            <View style={{ gap: space[2] }}>
              {STYLES.map(option => <ChoiceRow key={option.value} testID={`style-option-${option.value}`} label={option.label} description={option.description} selected={style === option.value} onPress={() => setStyle(option.value)} />)}
            </View>
          </View>

          <View style={{ gap: space[3] }}>
            <SectionLabel title="Your voice" />
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Claire learns writing patterns from messages you sent. Message samples are not stored in this profile.</Text>
            <Pressable testID="voice-profile-rebuild" accessibilityRole="button" disabled={rebuildingVoice} onPress={() => void rebuildVoice()} style={{ minHeight: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: colors.ink, opacity: rebuildingVoice ? 0.6 : 1 }}>
              {rebuildingVoice ? <ActivityIndicator size="small" color={colors.lime} /> : <RefreshCw size={16} color={colors.paper} />}
              <Text style={{ ...mobileType.label, color: colors.paper }}>Rebuild voice</Text>
            </Pressable>
            {voiceProfiles.length === 0
              ? <View style={{ padding: space[4], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Rebuild to learn from your sent messages.</Text></View>
              : voiceProfiles.map(profile => <VoiceProfileCard key={profile.language} profile={profile} onSave={saveVoice} onReset={resetVoice} />)}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
