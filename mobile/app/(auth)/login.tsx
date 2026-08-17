/**
 * Platform Connection Screen
 *
 * Allows users to connect messaging platforms during onboarding
 * and later from Settings. Matches the Connected accounts mockup.
 */

import { Alert, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ChevronLeft, HelpCircle, Laptop } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PlatformAuthModal } from '../../components/PlatformAuthModal';
import { PlatformIcon } from '../../components/PlatformIcon';
import { Platform, PlatformStatus, PLATFORM_DISPLAY } from '../../types/platform';
import { useHasAnyConnection, usePlatformStore } from '../../stores/platformStore';
import { colors, mobileType, radius, space } from '@claire/design-system';

const CONNECT_COPY: Record<Platform, string> = {
  [Platform.WHATSAPP]: 'Scan a QR code from Linked Devices',
  [Platform.TELEGRAM]: 'Verify with your phone number',
  [Platform.INSTAGRAM]: 'Sign in securely with Meta',
  [Platform.IMESSAGE]: 'Connect with Claire Desktop on a Mac',
};

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { connectedSessions, initialize, fetchConnectedSessions, isInitialized } = usePlatformStore();
  const hasConnection = useHasAnyConnection();

  useEffect(() => {
    if (!isInitialized) {
      void initialize();
      return;
    }
    void fetchConnectedSessions();
  }, [fetchConnectedSessions, initialize, isInitialized]);

  const handlePlatformSelect = (platform: Platform) => {
    setSelectedPlatform(platform);
    setShowAuthModal(true);
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    setSelectedPlatform(null);
  };

  const handleAuthClose = () => {
    setShowAuthModal(false);
    setSelectedPlatform(null);
  };

  const handleContinue = () => {
    router.replace('/(tabs)/dashboard');
  };

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/signin');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }} testID="platform-login-screen">
      <View style={{ paddingTop: Math.max(insets.top, space[2]), paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', minHeight: 52 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          style={{ width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', ...mobileType.sectionTitle, color: colors.ink }}>Connected accounts</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How connecting works"
          onPress={() => Alert.alert('Your account stays yours', 'Claire connects through dedicated Matrix bridges. Disconnect at any time from Settings.')}
          style={{ width: 42, height: 42, borderRadius: 13, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}
        >
          <HelpCircle size={18} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[4], gap: space[3] }}
      >
        <View style={{ backgroundColor: colors.lime, borderRadius: radius.card, padding: space[4], gap: 6 }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>STEP 2 OF 3</Text>
          <Text style={{ ...mobileType.sectionTitle, color: colors.ink }}>Bring your conversations together.</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
            Connect one now. You can always add or remove accounts later.
          </Text>
        </View>

        {Object.values(Platform).map((platform) => {
          const connected = connectedSessions.some(
            (session) => session.platform === platform && session.status === PlatformStatus.CONNECTED
          );
          const display = PLATFORM_DISPLAY[platform];
          return (
            <Pressable
              key={platform}
              testID={`platform-selector-${platform}`}
              accessibilityRole="button"
              accessibilityLabel={`${display.name}. ${connected ? 'Connected' : `Connect. ${CONNECT_COPY[platform]}`}`}
              onPress={() => handlePlatformSelect(platform)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                padding: space[3],
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.neutral[200],
                backgroundColor: colors.paper,
              }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: display.color, alignItems: 'center', justifyContent: 'center' }}>
                <PlatformIcon platform={platform} size={18} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{display.name}</Text>
                <Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
                  {connected ? 'Connected' : CONNECT_COPY[platform]}
                </Text>
              </View>
              {connected ? (
                <Text style={{ ...mobileType.monoLabel, color: colors.success }}>CONNECTED</Text>
              ) : (
                <View style={{ borderWidth: 1, borderColor: colors.neutral[200], borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.paper }}>
                  <Text style={{ ...mobileType.label, color: colors.ink }}>Connect</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        <View style={{ flexDirection: 'row', gap: space[3], backgroundColor: colors.mint, borderRadius: 16, padding: space[3], marginTop: space[2] }}>
          <Laptop size={18} color={colors.ink} />
          <Text style={{ flex: 1, ...mobileType.bodySmall, color: colors.ink }}>
            <Text style={{ fontWeight: '700' }}>Your account stays yours.{'\n'}</Text>
            Claire connects through dedicated Matrix bridges. Disconnect at any time.
          </Text>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: Math.max(insets.bottom, space[4]), gap: space[2] }}>
        <Pressable
          testID="platform-login-continue"
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasConnection }}
          disabled={!hasConnection}
          onPress={handleContinue}
          style={{
            minHeight: 52,
            borderRadius: 16,
            backgroundColor: colors.ink,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: hasConnection ? 1 : 0.35,
          }}
        >
          <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.paper }}>Continue</Text>
        </Pressable>
        {hasConnection ? null : (
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'center' }}>
            Connect at least one platform to continue
          </Text>
        )}
        {__DEV__ && !hasConnection ? (
          <TouchableOpacity onPress={handleContinue} testID="platform-login-skip-dev" style={{ padding: space[2] }}>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[400], textAlign: 'center' }}>Skip (dev mode)</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <PlatformAuthModal
        platform={selectedPlatform}
        visible={showAuthModal}
        onClose={handleAuthClose}
        onSuccess={handleAuthSuccess}
        existingSession={selectedPlatform
          ? connectedSessions.find((session) => (
              session.platform === selectedPlatform && session.status === PlatformStatus.CONNECTED
            ))
          : null}
      />
    </View>
  );
}
