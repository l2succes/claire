/**
 * Platform Connection Screen
 *
 * Allows users to connect multiple messaging platforms.
 * Shows platform selector grid and handles authentication flows.
 */

import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { ArrowRight, Link2, Settings } from 'lucide-react-native';
import { PlatformSelector } from '../../components/PlatformSelector';
import { PlatformAuthModal } from '../../components/PlatformAuthModal';
import { Button } from '../../components/ui/Button';
import { Platform, PlatformStatus } from '../../types/platform';
import { usePlatformStore, useHasAnyConnection } from '../../stores/platformStore';
import { colors, mobileType, radius, space } from '@claire/design-system';

export default function LoginScreen() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { connectedSessions, initialize, fetchConnectedSessions, isInitialized } = usePlatformStore();
  const hasConnection = useHasAnyConnection();

  // Initialize platform store on mount
  useEffect(() => {
    if (!isInitialized) {
      void initialize();
      return;
    }
    // Sessions are server-authoritative. Refresh on re-entry instead of
    // trusting a persisted "Connected" badge from a prior run.
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

  const connectedCount = connectedSessions.filter(
    (s) => s.status === PlatformStatus.CONNECTED
  ).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }} testID="platform-login-screen">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: space[5], gap: space[5] }}
      >
        {/* Header */}
        <View style={{ paddingTop: space[8], gap: space[3] }}>
          <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}>
            <Link2 size={25} color={colors.ink} />
          </View>
          <Text style={{ ...mobileType.display, color: colors.ink }}>Bring your chats together.</Text>
          <Text style={{ ...mobileType.body, color: colors.neutral[600] }}>Connect one account now. You can add more from Settings whenever you like.</Text>
        </View>

        {/* Platform Selector */}
        <View style={{ gap: space[3] }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[800] }}>CHOOSE A PLATFORM</Text>
          <View style={{ padding: space[3], borderRadius: radius.card, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
          <PlatformSelector
            onPlatformSelect={handlePlatformSelect}
            selectedPlatform={selectedPlatform}
            showDescriptions={true}
            columns={2}
          />
          </View>
        </View>

        {/* Connection Status */}
        {connectedCount > 0 && (
          <View style={{ backgroundColor: colors.successSurface, borderRadius: radius.card, padding: space[4] }}>
            <Text style={{ ...mobileType.body, color: colors.success, fontWeight: '700', textAlign: 'center' }}>
              {connectedCount} platform{connectedCount !== 1 ? 's' : ''} connected
            </Text>
            <Text style={{ ...mobileType.bodySmall, color: colors.success, textAlign: 'center', marginTop: 4 }}>
              You can connect more platforms or continue to your inbox
            </Text>
          </View>
        )}

        {/* Continue Button */}
        <View style={{ marginTop: 'auto', paddingBottom: space[4], gap: space[3] }}>
          {hasConnection ? (
            <Button
              variant="primary"
              onPress={handleContinue}
              className="w-full"
              testID="platform-login-continue"
            >
              <View className="flex-row items-center justify-center">
                <Text style={{ ...mobileType.body, color: colors.paper, fontWeight: '700', marginRight: space[2] }}>
                  Continue to Claire
                </Text>
                <ArrowRight size={20} color={colors.lime} />
              </View>
            </Button>
          ) : (
            <View style={{ alignItems: 'center', gap: space[2] }}>
              <Settings size={18} color={colors.neutral[400]} />
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'center' }}>
                Connect at least one platform to continue
              </Text>
            </View>
          )}

          {/* Skip for testing in dev mode */}
          {__DEV__ && !hasConnection && (
            <TouchableOpacity
              onPress={handleContinue}
              className="mt-4 p-2"
              testID="platform-login-skip-dev"
            >
              <Text className="text-gray-400 text-sm text-center">
                Skip (dev mode)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Auth Modal */}
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
