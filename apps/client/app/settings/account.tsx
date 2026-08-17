import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, KeyRound, Mail } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { MobileIconButton, SectionLabel } from '../../components/mobile/claire-mobile';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../stores/authStore';

const MIN_PASSWORD_LENGTH = 12;

export default function AccountSecurityScreen() {
  const user = useAuthStore((state) => state.user);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active || error) return;
      setHasPassword(data.user?.app_metadata.providers?.includes('email') ?? false);
    });
    return () => { active = false; };
  }, []);

  const savePassword = async () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('Choose a longer password', `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      Alert.alert('Passwords do not match', 'Enter the same password in both fields.');
      return;
    }

    setSaving(true);
    try {
      // Supabase attaches email/password authentication to this same user, so
      // Google and password login keep one Claire account and one data set.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setConfirmation('');
      setHasPassword(true);
      Alert.alert(
        hasPassword ? 'Password updated' : 'Password added',
        'You can now sign in with your email and this password on any Claire client.'
      );
    } catch (error) {
      Alert.alert('Could not save password', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      testID="account-security-screen"
      style={{ flex: 1, backgroundColor: colors.cream }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: 64 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[3], minHeight: 52 }}>
        <MobileIconButton label="Back to Settings" onPress={() => router.back()}><ChevronLeft size={20} color={colors.ink} /></MobileIconButton>
        <Text style={{ flex: 1, textAlign: 'center', ...mobileType.sectionTitle, color: colors.ink }}>Account & security</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={{ paddingHorizontal: space[4], gap: space[5] }}>
        <View style={{ backgroundColor: colors.sky, borderRadius: radius.card, padding: space[4], gap: space[2] }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.lime }}>
            <Mail size={19} color={colors.ink} />
          </View>
          <Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>{user?.email || 'Your Claire account'}</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
            Your Claire account is shared by the web, desktop, iOS, and Android clients. Your connected messaging accounts and synced data remain attached to it.
          </Text>
        </View>

        <View>
          <SectionLabel title={hasPassword ? 'Change password' : 'Add a password'} />
          <View style={{ backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.card, padding: space[4], gap: space[3], marginTop: 6 }}>
            <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
              <KeyRound size={18} color={colors.ink} />
              <Text style={{ flex: 1, ...mobileType.bodySmall, color: colors.neutral[600] }}>
                {hasPassword
                  ? 'Choose a new password for email sign-in.'
                  : 'Add email and password sign-in without removing Google. Both methods open the same Claire account.'}
              </Text>
            </View>

            <PasswordField label="New password" value={password} onChangeText={setPassword} editable={!saving} testID="account-password" />
            <PasswordField label="Confirm new password" value={confirmation} onChangeText={setConfirmation} editable={!saving} testID="account-password-confirmation" />
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>At least {MIN_PASSWORD_LENGTH} characters.</Text>

            <Pressable
              testID="account-save-password"
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void savePassword()}
              style={({ pressed }) => ({ minHeight: 52, borderRadius: radius.control, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', opacity: saving || pressed ? 0.6 : 1 })}
            >
              <Text style={{ ...mobileType.body, color: colors.paper, fontWeight: '700' }}>{saving ? 'Saving…' : hasPassword ? 'Update password' : 'Add password'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function PasswordField({ label, value, onChangeText, editable, testID }: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable: boolean;
  testID: string;
}) {
  return (
    <View style={{ gap: space[1] }}>
      <Text style={{ ...mobileType.label, color: colors.neutral[800] }}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder="••••••••••••"
        placeholderTextColor={colors.neutral[400]}
        style={{ minHeight: 50, borderRadius: radius.control, backgroundColor: colors.neutral[100], paddingHorizontal: space[3], ...mobileType.body, color: colors.ink }}
      />
    </View>
  );
}
