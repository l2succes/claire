import { Text, type StyleProp, type TextStyle } from 'react-native';
import { router } from 'expo-router';
import { colors, mobileType } from '@claire/design-system';

export type LegalDocument = 'terms' | 'privacy';

export function LegalConsent({ style }: { style?: StyleProp<TextStyle> }) {
  const openDocument = (document: LegalDocument) => {
    router.push({ pathname: '/(auth)/legal', params: { document } });
  };

  return (
    <Text style={[{ ...mobileType.label, color: colors.neutral[600], textAlign: 'center' }, style]}>
      By continuing, you agree to the{' '}
      <Text accessibilityRole="link" onPress={() => openDocument('terms')} style={{ color: colors.ink, fontWeight: '700', textDecorationLine: 'underline' }}>
        Terms of Service
      </Text>{' '}
      and{' '}
      <Text accessibilityRole="link" onPress={() => openDocument('privacy')} style={{ color: colors.ink, fontWeight: '700', textDecorationLine: 'underline' }}>
        Privacy Policy
      </Text>.
    </Text>
  );
}
