import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, space } from '@claire/design-system';
import type { LegalDocument } from './legal-consent';

const LEGAL_SITE_ROOT = 'https://useclaire.co';

const DOCUMENTS: Record<LegalDocument, { title: string; url: string }> = {
  terms: { title: 'Terms of Service', url: `${LEGAL_SITE_ROOT}/legal/terms` },
  privacy: { title: 'Privacy Policy', url: `${LEGAL_SITE_ROOT}/legal/privacy` },
};

function documentFromParam(document: string | string[] | undefined): LegalDocument {
  return document === 'privacy' ? 'privacy' : 'terms';
}

export function LegalDocumentScreen() {
  const insets = useSafeAreaInsets();
  const { document } = useLocalSearchParams<{ document?: string | string[] }>();
  const legalDocument = DOCUMENTS[documentFromParam(document)];

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }} testID="legal-document-screen">
      <View style={{ minHeight: 58 + insets.top, paddingTop: insets.top, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}>
        <View style={{ width: 44 }} />
        <Text accessibilityRole="header" style={{ flex: 1, ...mobileType.body, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>
          {legalDocument.title}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close legal document" hitSlop={8} onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' }}>
          <X size={20} color={colors.ink} />
        </Pressable>
      </View>
      <WebView
        testID="legal-document-webview"
        source={{ uri: legalDocument.url }}
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
            <ActivityIndicator color={colors.ink} />
          </View>
        )}
          onShouldStartLoadWithRequest={(request) => {
            if (
              request.url === LEGAL_SITE_ROOT ||
              request.url.startsWith(`${LEGAL_SITE_ROOT}/`)
            ) {
              return true;
            }
            void Linking.openURL(request.url);
            return false;
          }}
      />
    </View>
  );
}
