import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect } from 'react';
import { ChevronLeft } from 'lucide-react-native';
import { useAuthStore } from '../../../stores/authStore';
import { useConversationSettingsStore } from '../../../stores/conversationSettingsStore';
import { PlatformBadge } from '../../../components/PlatformIcon';
import { CategoryPicker } from '../../../components/CategoryPicker';
import { EditableField } from '../../../components/EditableField';
import { SmartCardList } from '../../../components/SmartCardList';
import { Platform } from '../../../types/platform';
import type { ChatCategory } from '../../../types/conversationSettings';

export default function ConversationSettingsScreen() {
  const { chatId, platform, contact_name, chat_name, is_group } = useLocalSearchParams<{
    chatId: string;
    contact_name?: string;
    chat_name?: string;
    platform?: string;
    is_group?: string;
  }>();

  const user = useAuthStore((state) => state.user);
  const { settings, fetchSettings, setCategory, updateProfile, dismissCard, markCardActed, generateSmartCards, refreshInsights } = useConversationSettingsStore();

  const chatSettings = settings[chatId];
  const isLoading = chatSettings?.isLoading ?? true;

  const displayName = is_group === '1'
    ? (chat_name || contact_name || 'Group')
    : (contact_name || chat_name || 'Unknown');

  useEffect(() => {
    if (chatId) {
      fetchSettings(chatId);
    }
  }, [chatId, fetchSettings]);

  const handleCategorySelect = (category: ChatCategory) => {
    if (!user?.id) return;
    setCategory(chatId, user.id, category);
  };

  const handleProfileUpdate = (field: string, value: string) => {
    if (!user?.id) return;
    updateProfile(chatId, user.id, { [field]: value });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }} edges={['top']}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
      }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 8, padding: 4 }}>
          <ChevronLeft size={24} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
            Conversation Settings
          </Text>
        </View>
      </View>

      {isLoading && !chatSettings ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {/* Contact Header */}
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <View style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: '#e5e7eb',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 8,
            }}>
              <Text style={{ fontSize: 28, fontWeight: '600', color: '#6b7280' }}>
                {displayName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>{displayName}</Text>
            {platform && (
              <View style={{ marginTop: 6 }}>
                <PlatformBadge platform={platform as Platform} size={14} />
              </View>
            )}
          </View>

          {/* Editable Profile Fields */}
          <View style={{ backgroundColor: '#ffffff', marginBottom: 12 }}>
            <Text style={{
              fontSize: 13,
              fontWeight: '600',
              color: '#6b7280',
              paddingHorizontal: 16,
              paddingBottom: 4,
              paddingTop: 12,
            }}>
              Contact Info
            </Text>
            <EditableField
              label="Name"
              value={chatSettings?.profile?.display_name ?? contact_name ?? null}
              placeholder="Add name"
              onSave={(v) => handleProfileUpdate('display_name', v)}
            />
            <EditableField
              label="Phone"
              value={chatSettings?.profile?.phone_number ?? null}
              placeholder="Add phone number"
              onSave={(v) => handleProfileUpdate('phone_number', v)}
              keyboardType="phone-pad"
            />
            <EditableField
              label="Email"
              value={chatSettings?.profile?.email ?? null}
              placeholder="Add email"
              onSave={(v) => handleProfileUpdate('email', v)}
              keyboardType="email-address"
            />
            <EditableField
              label="Location"
              value={chatSettings?.profile?.location ?? null}
              placeholder="Add location"
              onSave={(v) => handleProfileUpdate('location', v)}
            />
          </View>

          {/* Category Picker */}
          <CategoryPicker
            selected={chatSettings?.category ?? null}
            onSelect={handleCategorySelect}
          />

          {/* Smart Cards */}
          <SmartCardList
            cards={chatSettings?.smartCards ?? []}
            onDismiss={(cardId) => dismissCard(chatId, cardId)}
            onActed={(cardId) => markCardActed(chatId, cardId)}
            onRefresh={() => generateSmartCards(chatId)}
          />

          {/* What Claire Knows */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280', flex: 1 }}>
                What Claire Knows
              </Text>
              <TouchableOpacity
                onPress={() => refreshInsights(chatId)}
                style={{
                  backgroundColor: '#f3f4f6',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: 12, color: '#6366f1', fontWeight: '500' }}>Refresh</Text>
              </TouchableOpacity>
            </View>
            {chatSettings?.profile?.key_facts && chatSettings.profile.key_facts.length > 0 ? (
              chatSettings.profile.key_facts.map((fact, i) => (
                <View key={i} style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  paddingVertical: 4,
                  gap: 8,
                }}>
                  <View style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: fact.confidence > 0.7 ? '#10b981' : '#f59e0b',
                    marginTop: 6,
                  }} />
                  <Text style={{ fontSize: 14, color: '#374151', flex: 1 }}>{fact.fact}</Text>
                </View>
              ))
            ) : (
              <Text style={{ fontSize: 13, color: '#9ca3af' }}>
                Tap Refresh to analyze this conversation
              </Text>
            )}
          </View>

          {/* Platform Info */}
          {platform && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 40 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 8 }}>
                Platform Info
              </Text>
              <Text style={{ fontSize: 14, color: '#374151' }}>
                Platform: {platform}
              </Text>
              {is_group === '1' && (
                <Text style={{ fontSize: 14, color: '#374151', marginTop: 2 }}>Group conversation</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
