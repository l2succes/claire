import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronLeft, MessageSquarePlus } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileAvatar, MobileIconButton, MobileState, SectionLabel } from '../../components/mobile/claire-mobile';
import { PlatformBadge } from '../../components/PlatformIcon';
import { contactsApi, type PersonContact } from '../../services/contacts';
import { displayPersonDetails, displayPersonName } from '../../services/contact-display';
import { Platform, platformLabel } from '../../types/platform';

function identity(contact: PersonContact) {
  return {
    name: contact.name,
    inferred_name: contact.inferred_name,
    username: contact.username,
    phone_number: contact.phone_number,
    platform: contact.platform,
  };
}

/**
 * Everything Claire knows about one person, whether or not there is a
 * conversation with them.
 *
 * People rows used to be inert unless a chat already existed, which on a real
 * directory meant almost all of them: 151 of 21,366 on the account this was
 * built against. The rest were dimmed with nowhere to go. This is where they go
 * — identity, a way to start talking, and somewhere to record context that
 * reaches Claire's prompts before a first message is ever sent.
 */
export function PersonDetailScreen() {
  const { contactId } = useLocalSearchParams<{ contactId: string }>();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState('');
  const [notesLoadedFor, setNotesLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const person = useQuery({
    queryKey: ['person', contactId],
    enabled: !!contactId,
    staleTime: 60_000,
    queryFn: () => contactsApi.get(contactId!),
  });

  const contact = person.data;

  // Seed the editor once per person, so a background refetch never overwrites
  // what is being typed.
  useEffect(() => {
    if (!contact || notesLoadedFor === contact.id) return;
    setNotesLoadedFor(contact.id);
    setNotes(contact.notes || '');
  }, [contact, notesLoadedFor]);

  const name = useMemo(
    () => (contact ? displayPersonName(identity(contact), 'Unknown person') : ''),
    [contact],
  );
  const detail = useMemo(
    () => (contact ? displayPersonDetails(identity(contact)) : null),
    [contact],
  );

  const openConversation = () => {
    if (!contact?.chat) return;
    router.push({
      pathname: '/chat/[chatId]',
      params: {
        chatId: contact.chat.id,
        contact_name: name,
        chat_name: contact.chat.name || '',
        platform: contact.chat.platform || contact.platform || '',
        is_group: contact.chat.is_group ? '1' : '0',
      },
    });
  };

  const saveNotes = async () => {
    if (!contactId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await contactsApi.saveNotes(contactId, notes);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const back = (
    <View style={{ position: 'absolute', top: insets.top + space[2], left: space[4], zIndex: 1 }}>
      <MobileIconButton label="Back to People" onPress={() => router.back()}>
        <ChevronLeft size={21} color={colors.ink} />
      </MobileIconButton>
    </View>
  );

  if (person.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }} edges={['top']} testID="person-detail">
        {back}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      </SafeAreaView>
    );
  }

  if (person.error || !contact) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }} edges={['top']} testID="person-detail">
        {back}
        <View style={{ flex: 1, justifyContent: 'center', paddingTop: 64 }}>
          <MobileState
            error
            title="This person is unavailable"
            message="Try again in a moment."
          />
        </View>
      </SafeAreaView>
    );
  }

  const platform = (contact.chat?.platform || contact.platform) as Platform | null;
  const canMessage = Boolean(contact.chat) || Boolean(contact.phone_number) || Boolean(contact.username);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }} edges={['top']} testID="person-detail">
      {back}
      <ScrollView
        contentContainerStyle={{ padding: space[4], paddingBottom: 48 + insets.bottom, gap: space[5] }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', gap: space[2], paddingTop: space[5], paddingBottom: space[2] }}>
          <MobileAvatar name={name} uri={contact.avatar_url} size={72} isGroup={contact.is_group} />
          <Text maxFontSizeMultiplier={1} style={{ ...mobileType.sectionTitle, color: colors.ink }}>{name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {platform ? <PlatformBadge platform={platform} size={14} /> : null}
            <Text maxFontSizeMultiplier={1} numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
              {detail || (platform ? platformLabel(platform) : 'Contact')}
            </Text>
          </View>
        </View>

        <View style={{ gap: space[2] }}>
          <Pressable
            accessibilityRole="button"
            disabled={!canMessage}
            onPress={contact.chat ? openConversation : () => router.push('/compose')}
            testID={contact.chat ? 'person-open-conversation' : 'person-start-conversation'}
          >
            <View style={{
              minHeight: 52,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space[2],
              borderRadius: radius.control,
              backgroundColor: canMessage ? colors.ink : colors.neutral[200],
            }}>
              <MessageSquarePlus size={18} color={canMessage ? colors.paper : colors.neutral[600]} />
              <Text style={{ ...mobileType.body, fontWeight: '700', color: canMessage ? colors.paper : colors.neutral[600] }}>
                {contact.chat ? 'Open conversation' : 'Start a conversation'}
              </Text>
            </View>
          </Pressable>
          {!canMessage ? (
            // Say why rather than presenting a dead control. Thousands of rows
            // in a bridged directory arrive with neither a number nor a handle.
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'center' }}>
              Claire does not have a phone number or username for this contact yet, so there is no way to reach them.
            </Text>
          ) : null}
        </View>

        <View style={{ gap: space[2] }}>
          <SectionLabel title="What should Claire remember?" />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            textAlignVertical="top"
            placeholder="Who this person is, how you know them, or what matters when you talk."
            placeholderTextColor={colors.neutral[400]}
            maxFontSizeMultiplier={1}
            testID="person-notes"
            style={{
              minHeight: 112,
              padding: space[3],
              borderRadius: radius.card,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.neutral[200],
              backgroundColor: colors.paper,
              ...mobileType.bodySmall,
              color: colors.ink,
            }}
          />
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
            Claire uses this when drafting replies, even before your first message.
          </Text>
          {saveError ? (
            <Text style={{ ...mobileType.bodySmall, color: colors.danger }}>{saveError}</Text>
          ) : null}
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveNotes()} testID="person-save-notes">
            <View style={{
              minHeight: 46,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space[2],
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: colors.ink,
              backgroundColor: colors.paper,
              opacity: saving ? 0.6 : 1,
            }}>
              <Check size={17} color={colors.ink} />
              <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
              </Text>
            </View>
          </Pressable>
        </View>

        {contact.chat ? (
          <View style={{ gap: space[2] }}>
            <SectionLabel title="Conversation" detail="Category, tone, and what Claire has learned" />
            <Pressable
              accessibilityRole="button"
              testID="person-open-chat-settings"
              onPress={() => router.push({ pathname: '/chat/settings/[chatId]', params: { chatId: contact.chat!.id } })}
            >
              <View style={{
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: space[3],
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: colors.neutral[200],
                backgroundColor: colors.paper,
              }}>
                <Text style={{ ...mobileType.body, color: colors.ink }}>Conversation settings</Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
