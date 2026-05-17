/**
 * Settings Screen
 *
 * Allows users to manage their account, connected platforms,
 * and application preferences.
 */

import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import {
  ChevronRight,
  Bell,
  User,
  Sparkles,
  LogOut,
  Plus,
  RefreshCw,
} from 'lucide-react-native';
import { useAuthStore } from '../../stores/authStore';
import { usePlatformStore } from '../../stores/platformStore';
import { ConnectedPlatformsList } from '../../components/ConnectedPlatformsList';
import { PlatformSelector } from '../../components/PlatformSelector';
import { PlatformAuthModal } from '../../components/PlatformAuthModal';
import { Platform, PlatformStatus } from '../../types/platform';

export default function SettingsScreen() {
  const [showPlatformSelector, setShowPlatformSelector] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const {
    connectedSessions,
    initialize,
    isInitialized,
    fetchConnectedSessions,
    reset: resetPlatformStore,
  } = usePlatformStore();

  // Initialize platform store on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? You will need to reconnect your messaging platforms.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            resetPlatformStore();
            await logout();
            router.replace('/(auth)/signin');
          },
        },
      ]
    );
  };

  const handleRefreshPlatforms = async () => {
    await fetchConnectedSessions();
  };

  const handleAddPlatform = () => {
    setShowPlatformSelector(true);
  };

  const handlePlatformSelect = (platform: Platform) => {
    // Check if already connected
    const existingSession = connectedSessions.find(
      (s) => s.platform === platform && s.status === PlatformStatus.CONNECTED
    );

    if (existingSession) {
      Alert.alert(
        'Already Connected',
        `You already have a ${platform} connection. Would you like to disconnect it first?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              setSelectedPlatform(platform);
              setShowPlatformSelector(false);
              setShowAuthModal(true);
            },
          },
        ]
      );
    } else {
      setSelectedPlatform(platform);
      setShowPlatformSelector(false);
      setShowAuthModal(true);
    }
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    setSelectedPlatform(null);
    fetchConnectedSessions();
  };

  const handleAuthClose = () => {
    setShowAuthModal(false);
    setSelectedPlatform(null);
  };

  const connectedCount = connectedSessions.filter(
    (s) => s.status === PlatformStatus.CONNECTED
  ).length;

  const SettingsSection = ({
    icon: Icon,
    title,
    description,
    onPress,
    danger = false,
  }: {
    icon: typeof User;
    title: string;
    description: string;
    onPress?: () => void;
    danger?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      className="bg-white dark:bg-gray-800 rounded-lg px-4 py-3 mb-3 flex-row items-center"
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View
        className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
          danger ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-700'
        }`}
      >
        <Icon size={20} color={danger ? '#ef4444' : '#6b7280'} />
      </View>
      <View className="flex-1">
        <Text
          className={`font-semibold ${
            danger ? 'text-red-600' : 'text-gray-900 dark:text-white'
          }`}
        >
          {title}
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400">
          {description}
        </Text>
      </View>
      {onPress && <ChevronRight size={20} color="#9ca3af" />}
    </TouchableOpacity>
  );

  return (
    <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-900" testID="settings-screen">
      <View className="p-4">
        {/* Header */}
        <Text className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Settings
        </Text>

        {/* User Info */}
        {user && (
          <View className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-6">
            <View className="flex-row items-center">
              <View className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 items-center justify-center">
                <User size={28} color="#10b981" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                  {user.name || 'User'}
                </Text>
                <Text className="text-gray-500 dark:text-gray-400">
                  {user.email}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Connected Platforms Section */}
        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-lg font-semibold text-gray-900 dark:text-white">
              Connected Platforms
            </Text>
            <View className="flex-row">
              <TouchableOpacity
                onPress={handleRefreshPlatforms}
                className="p-2 mr-1"
                testID="settings-refresh-platforms"
              >
                <RefreshCw size={18} color="#6b7280" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddPlatform}
                className="bg-green-500 rounded-full p-2"
                testID="settings-add-platform"
              >
                <Plus size={18} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          {connectedCount > 0 ? (
            <View className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
              <ConnectedPlatformsList />
            </View>
          ) : (
            <View className="bg-white dark:bg-gray-800 rounded-lg p-6 items-center" testID="settings-no-platforms">
              <Text className="text-gray-500 dark:text-gray-400 text-center mb-3">
                No platforms connected
              </Text>
              <TouchableOpacity
                onPress={handleAddPlatform}
                className="bg-green-500 px-4 py-2 rounded-full"
                testID="settings-connect-platform"
              >
                <Text className="text-white font-semibold">Connect Platform</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Platform Selector Modal */}
        {showPlatformSelector && (
          <View className="mb-6">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                Select Platform
              </Text>
              <TouchableOpacity onPress={() => setShowPlatformSelector(false)}>
                <Text className="text-green-500 font-medium">Cancel</Text>
              </TouchableOpacity>
            </View>
            <View className="bg-white dark:bg-gray-800 rounded-lg p-4">
              <PlatformSelector
                onPlatformSelect={handlePlatformSelect}
                showDescriptions={false}
                columns={4}
              />
            </View>
          </View>
        )}

        {/* Settings Sections */}
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Preferences
        </Text>

        <SettingsSection
          icon={User}
          title="Account"
          description="Manage your account settings"
        />

        <SettingsSection
          icon={Bell}
          title="Notifications"
          description="Configure notification preferences"
        />

        <SettingsSection
          icon={Sparkles}
          title="AI Settings"
          description="Customize AI response behavior"
        />

        {/* Logout */}
        <View className="mt-6">
          <SettingsSection
            icon={LogOut}
            title="Logout"
            description="Sign out of your account"
            onPress={handleLogout}
            danger
          />
        </View>

        {/* Version Info */}
        <Text className="text-center text-gray-400 dark:text-gray-500 text-sm mt-8">
          Claire v1.0.0
        </Text>
      </View>

      {/* Auth Modal */}
      <PlatformAuthModal
        platform={selectedPlatform}
        visible={showAuthModal}
        onClose={handleAuthClose}
        onSuccess={handleAuthSuccess}
      />
    </ScrollView>
  );
}
