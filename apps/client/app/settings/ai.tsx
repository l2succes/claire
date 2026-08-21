/**
 * AI Settings Screen
 *
 * Allows users to configure their tone and personality preferences
 * which are persisted server-side and injected into AI prompt context.
 */

import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput, Pressable, Switch } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
import { colors, mobileType, radius } from '@claire/design-system';
import { MobileHeader, MobileIconButton } from '../../components/mobile/claire-mobile';
import { supabase } from '../../services/supabase';
import { API_BASE_URL } from '../../services/platforms';

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
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const [prefs, voiceResponse, privacyResponse] = await Promise.all([
          fetchPreferences(token),
          fetch(`${API_BASE_URL}/preferences/voice-profiles`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE_URL}/preferences/privacy`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        setTone(prefs.tone as Tone);
        setStyle(prefs.response_style as Style);
        setAiEnabled(prefs.preferences?.ai_enabled !== false);
        if (voiceResponse.ok) setVoiceProfiles((await voiceResponse.json()).data || []);
        if (privacyResponse.ok) setPrivacyDisclosure((await privacyResponse.json()).data);
      } catch {
        // silently use defaults
      } finally {
        setLoading(false);
      }
    })();
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
    if (!session?.access_token) return;
    const response = await fetch(`${API_BASE_URL}/preferences/voice-profiles/${encodeURIComponent(language)}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }),
    });
    if (!response.ok) throw new Error('Could not save voice profile');
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
      testID="ai-settings-screen"
    >
      <MobileHeader
        title="AI Settings"
        subtitle="How Claire should sound when it drafts a reply."
        leading={<MobileIconButton label="Back to Settings" testID="ai-settings-back" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>}
        actions={
          <Pressable testID="ai-settings-save" onPress={() => void handleSave()} disabled={saving} style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
            {saving ? <ActivityIndicator size="small" color={colors.lime} /> : <Text style={{ ...mobileType.label, color: colors.paper }}>Save</Text>}
          </Pressable>
        }
      />
      <View className="p-4">
        <View className="mb-6 rounded-lg border border-gray-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800">
          <View className="flex-row items-center gap-3"><View className="flex-1"><Text className="text-lg font-semibold text-gray-900 dark:text-white">Use Claire AI</Text><Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">Turn off suggestions, summaries, Ask Claire, voice learning, and AI promise detection. Messaging continues normally.</Text></View><Switch testID="ai-processing-toggle" value={aiEnabled} onValueChange={setAiEnabled} trackColor={{ true: colors.lime }} /></View>
          <Text className="mt-3 text-xs text-gray-500 dark:text-gray-400">{privacyDisclosure?.message || 'When enabled, selected conversation context may be sent to Claire’s configured AI provider.'}</Text>
          <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">{privacyDisclosure?.operationsTelemetry || 'Operations telemetry never includes message content.'}</Text>
        </View>

        {/* Tone Section */}
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Response Tone
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          How should AI suggestions sound?
        </Text>
        <View className="mb-6">
          {TONES.map((t) => (
            <TouchableOpacity
              key={t.value}
              onPress={() => setTone(t.value)}
              className={`flex-row items-center bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-2 ${
                tone === t.value ? 'border-2 border-green-500' : 'border border-gray-200 dark:border-gray-700'
              }`}
              testID={`tone-option-${t.value}`}
            >
              <View className="flex-1">
                <Text className="font-semibold text-gray-900 dark:text-white">{t.label}</Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400">{t.description}</Text>
              </View>
              {tone === t.value && <Check size={20} color="#10b981" />}
            </TouchableOpacity>
          ))}
        </View>

        <View className="mb-6">
          <View className="flex-row items-center mb-2">
            <View className="flex-1"><Text className="text-lg font-semibold text-gray-900 dark:text-white">Your voice</Text><Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">Claire learns observable writing patterns from messages you sent; it never stores message samples here.</Text></View>
            <TouchableOpacity onPress={rebuildVoice} disabled={rebuildingVoice} className="bg-indigo-600 px-3 py-2 rounded-full" testID="voice-profile-rebuild">
              {rebuildingVoice ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-white font-semibold text-xs">Rebuild</Text>}
            </TouchableOpacity>
          </View>
          {voiceProfiles.length === 0 ? <Text className="text-sm text-gray-400">Rebuild your profile to learn from your sent messages.</Text> : voiceProfiles.map(profile => (
            <View key={profile.language} className="bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-2 border border-gray-200 dark:border-gray-700">
              <Text className="font-semibold text-gray-900 dark:text-white">{profile.language.toUpperCase()} voice · {profile.sourceMessageCount} messages</Text>
              <TextInput defaultValue={profile.profile} multiline maxLength={1500} onEndEditing={(event) => void saveVoice(profile.language, event.nativeEvent.text)} testID={`voice-profile-${profile.language}`} className="text-sm text-gray-700 dark:text-gray-200 mt-2" style={{ minHeight: 72, textAlignVertical: 'top' }} />
              <TouchableOpacity onPress={() => void resetVoice(profile.language)} testID={`voice-profile-reset-${profile.language}`} className="self-start mt-2"><Text className="text-xs font-semibold text-red-600">Reset to manual preferences</Text></TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Style Section */}
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Response Style
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          How long should AI suggestions be?
        </Text>
        <View className="mb-6">
          {STYLES.map((s) => (
            <TouchableOpacity
              key={s.value}
              onPress={() => setStyle(s.value)}
              className={`flex-row items-center bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-2 ${
                style === s.value ? 'border-2 border-green-500' : 'border border-gray-200 dark:border-gray-700'
              }`}
              testID={`style-option-${s.value}`}
            >
              <View className="flex-1">
                <Text className="font-semibold text-gray-900 dark:text-white">{s.label}</Text>
                <Text className="text-sm text-gray-500 dark:text-gray-400">{s.description}</Text>
              </View>
              {style === s.value && <Check size={20} color="#10b981" />}
            </TouchableOpacity>
          ))}
        </View>

        <Text className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
          These preferences are injected into every AI suggestion prompt.
        </Text>
      </View>
    </ScrollView>
  );
}
