/**
 * ConnectedPlatformsList Component
 *
 * Displays a list of connected platforms in the Settings screen.
 * Shows connection status, allows disconnect/reconnect actions.
 */

import React from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { formatDistanceToNow } from 'date-fns';
import { Wifi, WifiOff, Trash2, RefreshCw, ChevronRight } from 'lucide-react-native';
import { cn } from '../utils/cn';
import { PlatformIconButton } from './PlatformIcon';
import {
  Platform,
  PlatformStatus,
  PlatformSession,
  PLATFORM_DISPLAY,
} from '../types/platform';
import { usePlatformStore } from '../stores/platformStore';

interface ConnectedPlatformsListProps {
  className?: string;
}

export function ConnectedPlatformsList({ className }: ConnectedPlatformsListProps) {
  const {
    connectedSessions,
    isLoading,
    disconnectPlatform,
    reconnectPlatform,
  } = usePlatformStore();

  const handleDisconnect = (platform: Platform, sessionId: string, platformName: string) => {
    Alert.alert(
      'Disconnect Platform',
      `Are you sure you want to disconnect ${platformName}? You'll need to re-authenticate to reconnect.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnectPlatform(platform, sessionId),
        },
      ]
    );
  };

  const handleReconnect = async (platform: Platform, sessionId: string) => {
    await reconnectPlatform(platform, sessionId);
  };

  if (connectedSessions.length === 0) {
    return (
      <View className={cn('p-4', className)} testID="connected-platforms-empty">
        <View className="items-center py-8">
          <WifiOff size={48} color="#9ca3af" />
          <Text className="text-gray-500 dark:text-gray-400 mt-4 text-center">
            No platforms connected yet
          </Text>
          <Text className="text-gray-400 dark:text-gray-500 text-sm mt-1 text-center">
            Connect a messaging platform to start receiving messages
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className={className} testID="connected-platforms-list">
      {connectedSessions.map((session) => (
        <PlatformSessionCard
          key={session.id}
          session={session}
          onDisconnect={() =>
            handleDisconnect(
              session.platform,
              session.id,
              PLATFORM_DISPLAY[session.platform].name
            )
          }
          onReconnect={() => handleReconnect(session.platform, session.id)}
          isLoading={isLoading}
        />
      ))}
    </View>
  );
}

interface PlatformSessionCardProps {
  session: PlatformSession;
  onDisconnect: () => void;
  onReconnect: () => void;
  isLoading: boolean;
}

function PlatformSessionCard({
  session,
  onDisconnect,
  onReconnect,
  isLoading,
}: PlatformSessionCardProps) {
  const display = PLATFORM_DISPLAY[session.platform];
  const isConnected = session.status === PlatformStatus.CONNECTED;
  const isFailed = session.status === PlatformStatus.FAILED;
  const isDisconnected = session.status === PlatformStatus.DISCONNECTED;

  const getStatusText = () => {
    switch (session.status) {
      case PlatformStatus.CONNECTED:
        return 'Connected';
      case PlatformStatus.DISCONNECTED:
        return 'Disconnected';
      case PlatformStatus.FAILED:
        return 'Connection failed';
      case PlatformStatus.INITIALIZING:
        return 'Initializing...';
      case PlatformStatus.AWAITING_AUTH:
        return 'Awaiting authentication';
      default:
        return session.status;
    }
  };

  const getStatusColor = () => {
    switch (session.status) {
      case PlatformStatus.CONNECTED:
        return 'text-green-600';
      case PlatformStatus.FAILED:
        return 'text-red-500';
      case PlatformStatus.DISCONNECTED:
        return 'text-gray-500';
      default:
        return 'text-yellow-500';
    }
  };

  const lastConnected = session.lastConnectedAt
    ? formatDistanceToNow(new Date(session.lastConnectedAt), { addSuffix: true })
    : null;

  return (
    <View className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700" testID={`connected-platform-${session.platform}`}>
      <View className="flex-row items-center px-4 py-3">
        {/* Platform Icon */}
        <PlatformIconButton
          platform={session.platform}
          size={48}
          connected={isConnected}
        />

        {/* Info */}
        <View className="flex-1 ml-3">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {display.name}
          </Text>

          {session.platformUsername && (
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              {session.platformUsername}
            </Text>
          )}

          {session.phoneNumber && (
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              {session.phoneNumber}
            </Text>
          )}

          <View className="flex-row items-center mt-1">
            {isConnected ? (
              <Wifi size={12} color="#22c55e" />
            ) : (
              <WifiOff size={12} color="#9ca3af" />
            )}
            <Text className={cn('text-xs ml-1', getStatusColor())}>
              {getStatusText()}
            </Text>
            {lastConnected && isConnected && (
              <Text className="text-xs text-gray-400 ml-2">
                · Last active {lastConnected}
              </Text>
            )}
          </View>

          {session.error && (
            <Text className="text-xs text-red-500 mt-1" numberOfLines={1}>
              {session.error}
            </Text>
          )}
        </View>

        {/* Actions */}
        <View className="flex-row items-center">
          {isLoading ? (
            <ActivityIndicator size="small" color="#6b7280" />
          ) : (
            <>
              {(isFailed || isDisconnected) && (
                <TouchableOpacity
                  onPress={onReconnect}
                  className="p-2 mr-1"
                  testID={`reconnect-platform-${session.platform}`}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <RefreshCw size={20} color="#3b82f6" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={onDisconnect}
                className="p-2"
                testID={`disconnect-platform-${session.platform}`}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Trash2 size={20} color="#ef4444" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

/**
 * Compact platform status row for use in other screens
 */
export function PlatformStatusRow({
  platform,
  onPress,
  className,
}: {
  platform: Platform;
  onPress?: () => void;
  className?: string;
}) {
  const sessions = usePlatformStore((state) => state.connectedSessions);
  const session = sessions.find(
    (s) => s.platform === platform && s.status === PlatformStatus.CONNECTED
  );

  const display = PLATFORM_DISPLAY[platform];
  const isConnected = !!session;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      className={cn(
        'flex-row items-center px-4 py-3 bg-white dark:bg-gray-800',
        'border-b border-gray-100 dark:border-gray-700',
        className
      )}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <PlatformIconButton platform={platform} size={40} connected={isConnected} />

      <View className="flex-1 ml-3">
        <Text className="text-base font-medium text-gray-900 dark:text-white">
          {display.name}
        </Text>
        <Text
          className={cn(
            'text-sm',
            isConnected ? 'text-green-600' : 'text-gray-500'
          )}
        >
          {isConnected ? 'Connected' : 'Not connected'}
        </Text>
      </View>

      {onPress && <ChevronRight size={20} color="#9ca3af" />}
    </TouchableOpacity>
  );
}

export default ConnectedPlatformsList;
