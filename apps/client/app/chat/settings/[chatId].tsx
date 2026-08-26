import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { BellOff, Check, ChevronLeft, Mail, MapPin, Phone, RefreshCw, Sparkles } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { useAuthStore } from '../../../stores/authStore';
import { useConversationSettingsStore } from '../../../stores/conversationSettingsStore';
import { supabase } from '../../../services/supabase';
import { CategoryPicker } from '../../../components/CategoryPicker';
import { MobileAvatar, MobileIconButton, SectionLabel } from '../../../components/mobile/claire-mobile';
import { PlatformBadge } from '../../../components/PlatformIcon';
import { Platform } from '../../../types/platform';
import type { ChatCategory } from '../../../types/conversationSettings';
import { formatPhoneNumber, formatPhoneNumberInput, normalizePhoneNumber } from '../../../services/phone-numbers';
import { displayContactName } from '../../../services/contact-display';
import { API_BASE_URL } from '../../../services/platforms';

const TONES = [
  { key: 'warm', title: 'Warm + direct', description: 'Clear, human, confident' },
  { key: 'professional', title: 'Professional', description: 'Polished and concise' },
  { key: 'casual', title: 'Casual', description: 'Relaxed and natural' },
  { key: 'playful', title: 'Playful', description: 'Light and expressive' },
] as const;

type ToneKey = (typeof TONES)[number]['key'];

function toneFromInstruction(instruction: string | null | undefined): ToneKey | null {
  const match = instruction?.match(/Default tone:\s*(warm \+ direct|professional|casual|playful)/i)?.[1]?.toLowerCase();
  if (match === 'warm + direct') return 'warm';
  return match === 'professional' || match === 'casual' || match === 'playful' ? match : null;
}

function Field({ icon, label, value, onChangeText, placeholder, keyboardType = 'default' }: { icon: React.ReactNode; label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: 'default' | 'phone-pad' | 'email-address' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
      {icon}
      <Text maxFontSizeMultiplier={1} style={{ ...mobileType.bodySmall, width: 58, color: colors.neutral[600] }}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.neutral[400]} keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} maxFontSizeMultiplier={1} style={{ flex: 1, minHeight: 46, paddingVertical: 0, ...mobileType.body, color: colors.ink }} />
    </View>
  );
}

export default function ConversationSettingsScreen() {
  const { chatId, platform, contact_name, chat_name, is_group } = useLocalSearchParams<{ chatId: string; platform?: string; contact_name?: string; chat_name?: string; is_group?: string }>();
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.token);
  const insets = useSafeAreaInsets();
  const { settings, fetchSettings, setCategory, updateProfile, refreshInsights } = useConversationSettingsStore();
  const chatSettings = settings[chatId];
  const isLoading = chatSettings?.isLoading ?? true;
  const [sourcePhone, setSourcePhone] = useState('');
  const [details, setDetails] = useState({ phone: '', email: '', location: '' });
  const [memory, setMemory] = useState('');
  const [instruction, setInstruction] = useState('');
  const [tone, setTone] = useState<ToneKey | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSavingMute, setIsSavingMute] = useState(false);
  const displayName =
    is_group === '1'
      ? chat_name || contact_name || 'Group'
      : displayContactName(contact_name || chat_name, platform, sourcePhone, 'Contact');

  useEffect(() => { if (chatId) void fetchSettings(chatId); }, [chatId, fetchSettings]);

  useEffect(() => {
    let active = true;
    if (!chatId) return undefined;
    void (async () => {
      // Contacts own the canonical phone number. A Matrix sender identifier can
      // instead be a WhatsApp LID, so only fall back to message metadata when
      // the contact record has not been populated yet.
      const { data: chat } = await supabase.from('chats').select('contact_id,is_muted').eq('id', chatId).maybeSingle();
      if (active) setIsMuted(chat?.is_muted === true);
      let phone = '';
      if (chat?.contact_id) {
        const { data: contact } = await supabase.from('contacts').select('phone_number').eq('id', chat.contact_id).maybeSingle();
        phone = contact?.phone_number || '';
      }
      if (!phone) {
        const { data: latestMessage } = await supabase.from('messages').select('contact_phone').eq('chat_id', chatId).not('contact_phone', 'is', null).order('timestamp', { ascending: false }).limit(1).maybeSingle();
        phone = latestMessage?.contact_phone || '';
      }
      if (active) setSourcePhone(formatPhoneNumber(phone));
    })();
    return () => { active = false; };
  }, [chatId]);

  useEffect(() => {
    const profile = chatSettings?.profile;
    setDetails({ phone: profile?.phone_number || sourcePhone, email: profile?.email || '', location: profile?.location || '' });
    setMemory(profile?.relationship_context || '');
    setInstruction(profile?.ai_instruction || '');
    setTone(toneFromInstruction(profile?.ai_instruction));
  }, [chatSettings?.profile, sourcePhone]);

  const subtitle = useMemo(() => {
    const detail = details.phone || details.email || sourcePhone;
    return [platform ? platform[0].toUpperCase() + platform.slice(1) : null, detail || 'Contact details'] .filter(Boolean).join(' · ');
  }, [details.email, details.phone, platform, sourcePhone]);

  const handleCategorySelect = (category: ChatCategory) => { if (user?.id) void setCategory(chatId, user.id, category); };
  const updateMute = async (muted: boolean) => {
    if (!accessToken || isSavingMute) return;
    const previous = isMuted;
    setIsMuted(muted);
    setIsSavingMute(true);
    try {
      const response = await fetch(`${API_BASE_URL}/messages/chats/${encodeURIComponent(chatId)}/mute`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ muted }),
      });
      if (!response.ok) throw new Error(`Mute update failed (${response.status})`);
    } catch {
      setIsMuted(previous);
      Alert.alert('Could not update notifications', 'Please check your connection and try again.');
    } finally {
      setIsSavingMute(false);
    }
  };
  const selectTone = (nextTone: ToneKey) => {
    setTone(nextTone);
    if (!instruction.trim()) {
      const selected = TONES.find((item) => item.key === nextTone)!;
      setInstruction(`Default tone: ${selected.title}. ${selected.description}.`);
    }
  };
  const save = async () => {
    if (!user?.id) return;
    setIsSaving(true);
    await updateProfile(chatId, user.id, {
      display_name: displayName,
      // Store valid entries canonically so the same contact is recognized
      // across WhatsApp, Telegram, and Instagram. Preserve malformed legacy
      // data rather than discarding it while someone saves another field.
      phone_number: normalizePhoneNumber(details.phone) ?? (details.phone.trim() || null),
      email: details.email.trim() || null,
      location: details.location.trim() || null,
      relationship_context: memory.trim() || null,
      ai_instruction: instruction.trim() || null,
    });
    setIsSaving(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }} edges={['top']}>
      {isLoading && !chatSettings ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.ink} /></View> : (
        <ScrollView contentContainerStyle={{ padding: space[4], paddingBottom: 132 + insets.bottom, gap: space[5] }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: space[2], paddingTop: space[5], paddingBottom: space[2] }}>
            <MobileAvatar name={displayName} size={72} isGroup={is_group === '1'} />
            <Text maxFontSizeMultiplier={1} style={{ ...mobileType.sectionTitle, color: colors.ink }}>{displayName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {platform ? <PlatformBadge platform={platform as Platform} size={14} /> : null}
              <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{subtitle}</Text>
            </View>
          </View>

          <CategoryPicker selected={chatSettings?.category ?? null} onSelect={handleCategorySelect} />

          <View style={{ gap: space[2] }}>
            <SectionLabel title="Chat settings" />
            <View testID="conversation-notification-settings" style={{ minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}>
              <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, backgroundColor: isMuted ? colors.neutral[100] : colors.sky }}><BellOff size={19} color={colors.ink} /></View>
              <View style={{ flex: 1, gap: 2 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Mute notifications</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{isMuted ? 'Notifications are muted for this chat.' : `Receive alerts for this ${is_group === '1' ? 'group' : 'conversation'}.`}</Text></View>
              {/* Switch does not report a usable intrinsic height here, so the row's
                  alignItems: 'center' had nothing to centre: it laid out as a
                  full-height box and drew the control at the top, clipping the
                  card's border. A fixed box it cannot outgrow centres it for real. */}
              <View style={{ height: 40, justifyContent: 'center' }}>
                <Switch testID="conversation-mute-notifications" accessibilityLabel={`Mute notifications for ${displayName}`} value={isMuted} disabled={isSavingMute || !accessToken} onValueChange={(value) => void updateMute(value)} trackColor={{ false: colors.neutral[200], true: colors.ink }} thumbColor={isMuted ? colors.lime : colors.paper} />
              </View>
            </View>
          </View>

          <View style={{ gap: space[2] }}>
            <SectionLabel title="What should Claire remember?" />
            <TextInput value={memory} onChangeText={setMemory} multiline textAlignVertical="top" placeholder="Add useful context about this person, your relationship, or what matters in this chat." placeholderTextColor={colors.neutral[400]} maxFontSizeMultiplier={1} style={{ minHeight: 112, padding: space[3], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, ...mobileType.bodySmall, color: colors.ink }} />
          </View>

          <View style={{ gap: space[2] }}>
            <SectionLabel title="Default tone for suggestions" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {TONES.map((item) => {
                const selected = tone === item.key;
                return <Pressable key={item.key} onPress={() => selectTone(item.key)} style={{ width: '48.5%' }}><View style={{ minHeight: 74, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2], borderRadius: radius.control, borderCurve: 'continuous', borderWidth: 1, borderColor: selected ? colors.ink : colors.neutral[200], backgroundColor: selected ? colors.lime : colors.paper }}><Text maxFontSizeMultiplier={1} style={{ ...mobileType.label, color: colors.ink }}>{item.title}</Text><Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.bodySmall, fontSize: 11, lineHeight: 14, color: colors.neutral[600] }}>{item.description}</Text></View></Pressable>;
              })}
            </View>
          </View>

          <View style={{ gap: space[2] }}>
            <SectionLabel title="Claire's instruction for this chat" />
            <TextInput value={instruction} onChangeText={setInstruction} multiline textAlignVertical="top" placeholder="e.g. Keep this warm and casual. Don't suggest flirting." placeholderTextColor={colors.neutral[400]} maxFontSizeMultiplier={1} style={{ minHeight: 88, padding: space[3], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, ...mobileType.bodySmall, color: colors.ink }} />
          </View>

          <View style={{ gap: space[1] }}>
            <SectionLabel title="Contact details" />
            <View style={{ paddingHorizontal: space[3], borderRadius: radius.card, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}>
              <Field icon={<Phone size={17} color={colors.neutral[600]} />} label="Phone" value={details.phone} onChangeText={(phone) => setDetails((current) => ({ ...current, phone: formatPhoneNumberInput(phone, current.phone) }))} placeholder="+52 931 193 7748" keyboardType="phone-pad" />
              <Field icon={<Mail size={17} color={colors.neutral[600]} />} label="Email" value={details.email} onChangeText={(email) => setDetails((current) => ({ ...current, email }))} placeholder="Add email" keyboardType="email-address" />
              <Field icon={<MapPin size={17} color={colors.neutral[600]} />} label="Location" value={details.location} onChangeText={(location) => setDetails((current) => ({ ...current, location }))} placeholder="Add location" />
            </View>
          </View>

          <View style={{ gap: space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><SectionLabel title="What Claire knows" /><Pressable accessibilityRole="button" onPress={() => void refreshInsights(chatId)}><View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.neutral[100] }}><RefreshCw size={14} color={colors.ink} /><Text style={{ ...mobileType.label, color: colors.ink }}>Refresh</Text></View></Pressable></View>
            {chatSettings?.profile?.key_facts?.length ? chatSettings.profile.key_facts.slice(0, 3).map((fact, index) => <View key={`${fact.fact}-${index}`} style={{ flexDirection: 'row', gap: space[2], padding: space[3], borderRadius: radius.control, backgroundColor: colors.sky }}><Sparkles size={16} color={colors.ink} /><Text style={{ ...mobileType.bodySmall, flex: 1, color: colors.ink }}>{fact.fact}</Text></View>) : <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Save a relationship memory, then refresh when you want Claire to look for useful context.</Text>}
          </View>
        </ScrollView>
      )}
      {/* The back control lives over the identity header rather than in a bar of
          its own: a full-width chrome row with a separator existed only to hold
          this one button. Kept outside the ScrollView so it stays put while the
          settings scroll, and outside the loading branch so it is always a way out. */}
      <View style={{ position: 'absolute', top: insets.top + space[2], left: space[4] }}>
        <MobileIconButton label="Back to chat" onPress={() => router.back()}><ChevronLeft size={21} color={colors.ink} /></MobileIconButton>
      </View>
      {!isLoading || chatSettings ? <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: Math.max(insets.bottom, space[3]), backgroundColor: colors.cream, borderTopWidth: 1, borderTopColor: colors.neutral[200] }}><Pressable disabled={isSaving} accessibilityRole="button" onPress={() => void save()}><View style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[2], borderRadius: radius.control, backgroundColor: colors.ink, opacity: isSaving ? 0.6 : 1 }}><Check size={18} color={colors.paper} /><Text maxFontSizeMultiplier={1.4} style={{ ...mobileType.body, fontWeight: '700', color: colors.paper }}>{isSaving ? 'Saving…' : 'Save'}</Text></View></Pressable></View> : null}
    </SafeAreaView>
  );
}
