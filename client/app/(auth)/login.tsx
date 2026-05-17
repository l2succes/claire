/**
 * Platform Connection Screen
 *
 * Allows users to connect multiple messaging platforms.
 * Shows platform selector grid and handles authentication flows.
 */

import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { ArrowRight, MessageCircle } from 'lucide-react-native';
import { PlatformSelector } from '../../components/PlatformSelector';
import { PlatformAuthModal } from '../../components/PlatformAuthModal';
import { Button } from '../../components/ui/Button';
import { Platform, PlatformStatus } from '../../types/platform';
import { usePlatformStore, useHasAnyConnection } from '../../stores/platformStore';

export default function LoginScreen() {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { connectedSessions, initialize, isInitialized } = usePlatformStore();
  const hasConnection = useHasAnyConnection();

  // Initialize platform store on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

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
    <View className="flex-1 bg-white dark:bg-gray-900" testID="platform-login-screen">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, padding: 24 }}
      >
        {/* Header */}
        <View className="items-center mb-8 pt-8">
          <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-4">
            <MessageCircle size={32} color="#10b981" />
          </View>
          <Text className="text-3xl font-bold text-gray-900 dark:text-white">
            Claire
          </Text>
          <Text className="text-gray-600 dark:text-gray-400 text-center mt-2">
            Connect your messaging platforms
          </Text>
        </View>

        {/* Platform Selector */}
        <View className="mb-8">
          <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Select a platform to connect
          </Text>
          <PlatformSelector
            onPlatformSelect={handlePlatformSelect}
            selectedPlatform={selectedPlatform}
            showDescriptions={true}
            columns={2}
          />
        </View>

        {/* Connection Status */}
        {connectedCount > 0 && (
          <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-6">
            <Text className="text-green-800 dark:text-green-300 font-medium text-center">
              {connectedCount} platform{connectedCount !== 1 ? 's' : ''} connected
            </Text>
            <Text className="text-green-600 dark:text-green-400 text-sm text-center mt-1">
              You can connect more platforms or continue to your inbox
            </Text>
          </View>
        )}

        {/* Continue Button */}
        <View className="mt-auto pb-4">
          {hasConnection ? (
            <Button
              variant="primary"
              onPress={handleContinue}
              className="w-full"
              testID="platform-login-continue"
            >
              <View className="flex-row items-center justify-center">
                <Text className="text-white font-semibold text-lg mr-2">
                  Continue to Inbox
                </Text>
                <ArrowRight size={20} color="white" />
              </View>
            </Button>
          ) : (
            <View className="items-center">
              <Text className="text-gray-500 dark:text-gray-400 text-sm text-center">
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
      />
    </View>
  );
}
