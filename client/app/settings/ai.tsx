/**
 * AI Settings Screen
 *
 * Allows users to configure their tone and personality preferences
 * which are persisted server-side and injected into AI prompt context.
 */

import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { ChevronLeft, Check } from 'lucide-react-native';
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

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const prefs = await fetchPreferences(token);
        setTone(prefs.tone as Tone);
        setStyle(prefs.response_style as Style);
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
      await savePreferences(token, { tone, response_style: style });
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save settings. Please try again.');
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
      testID="ai-settings-screen"
    >
      <View className="p-4">
        {/* Header */}
        <View className="flex-row items-center mb-6">
          <TouchableOpacity onPress={() => router.back()} className="mr-3" testID="ai-settings-back">
            <ChevronLeft size={24} color="#6b7280" />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-900 dark:text-white flex-1">
            AI Settings
          </Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            className="bg-green-500 px-4 py-2 rounded-full"
            testID="ai-settings-save"
          >
            {saving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold">Save</Text>
            )}
          </TouchableOpacity>
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
