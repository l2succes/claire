/**
 * PlatformSelector Component
 *
 * Grid of platform icons for selecting which platform to connect.
 * Shows connection status and handles platform selection.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import { cn } from '../utils/cn';
import { PlatformIconButton } from './PlatformIcon';
import {
  Platform,
  PlatformStatus,
  PLATFORM_DISPLAY,
  isPlatformAvailable,
} from '../types/platform';
import { usePlatformStore } from '../stores/platformStore';

interface PlatformSelectorProps {
  onPlatformSelect: (platform: Platform) => void;
  selectedPlatform?: Platform | null;
  showDescriptions?: boolean;
  columns?: 2 | 4;
  className?: string;
}

export function PlatformSelector({
  onPlatformSelect,
  selectedPlatform,
  showDescriptions = true,
  columns = 2,
  className,
}: PlatformSelectorProps) {
  const connectedSessions = usePlatformStore((state) => state.connectedSessions);

  const platforms = Object.values(Platform);

  const isPlatformConnected = (platform: Platform): boolean => {
    return connectedSessions.some(
      (s) => s.platform === platform && s.status === PlatformStatus.CONNECTED
    );
  };

  return (
    <View className={cn('w-full', className)}>
      <View
        className={cn(
          'flex-row flex-wrap',
          columns === 2 ? 'justify-between' : 'justify-around'
        )}
      >
        {platforms.map((platform) => {
          const connected = isPlatformConnected(platform);
          const available = isPlatformAvailable(platform);
          const display = PLATFORM_DISPLAY[platform];
          const isSelected = selectedPlatform === platform;

          return (
            <TouchableOpacity
              key={platform}
              onPress={() => onPlatformSelect(platform)}
              disabled={!available}
              activeOpacity={0.7}
              className={cn(
                'items-center p-4 rounded-xl mb-4',
                columns === 2 ? 'w-[48%]' : 'w-[23%]',
                isSelected ? 'bg-gray-100 dark:bg-gray-800' : 'bg-white dark:bg-gray-900',
                !available && 'opacity-40'
              )}
              style={{
                borderWidth: isSelected ? 2 : 1,
                borderColor: isSelected ? display.color : '#e5e7eb',
              }}
            >
              <View className="relative">
                <PlatformIconButton
                  platform={platform}
                  size={56}
                  connected={connected}
                  disabled={!available}
                />

                {connected && (
                  <View className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5">
                    <Check size={12} color="white" strokeWidth={3} />
                  </View>
                )}
              </View>

              <Text
                className={cn(
                  'mt-2 font-semibold text-center',
                  'text-gray-900 dark:text-white'
                )}
              >
                {display.name}
              </Text>

              {showDescriptions && (
                <Text
                  className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1"
                  numberOfLines={2}
                >
                  {connected ? 'Connected' : display.description}
                </Text>
              )}

              {!available && (
                <Text className="text-xs text-orange-500 mt-1">Coming soon</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Compact platform selector for inline use
 */
export function PlatformSelectorInline({
  onPlatformSelect,
  selectedPlatform,
  className,
}: {
  onPlatformSelect: (platform: Platform) => void;
  selectedPlatform?: Platform | null;
  className?: string;
}) {
  const connectedSessions = usePlatformStore((state) => state.connectedSessions);
  const platforms = Object.values(Platform);

  const isPlatformConnected = (platform: Platform): boolean => {
    return connectedSessions.some(
      (s) => s.platform === platform && s.status === PlatformStatus.CONNECTED
    );
  };

  return (
    <View className={cn('flex-row justify-center', className)}>
      {platforms.map((platform) => {
        const connected = isPlatformConnected(platform);
        const available = isPlatformAvailable(platform);
        const display = PLATFORM_DISPLAY[platform];
        const isSelected = selectedPlatform === platform;

        return (
          <TouchableOpacity
            key={platform}
            onPress={() => onPlatformSelect(platform)}
            disabled={!available}
            activeOpacity={0.7}
            className={cn(
              'items-center mx-2 p-2 rounded-lg',
              isSelected && 'bg-gray-100 dark:bg-gray-800'
            )}
          >
            <PlatformIconButton
              platform={platform}
              size={44}
              connected={connected}
              disabled={!available}
            />
            <Text
              className={cn(
                'text-xs mt-1',
                isSelected
                  ? 'text-gray-900 dark:text-white font-medium'
                  : 'text-gray-500 dark:text-gray-400'
              )}
            >
              {display.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default PlatformSelector;
