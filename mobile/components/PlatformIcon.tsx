/**
 * PlatformIcon Component
 *
 * Displays a platform-specific icon with optional connection indicator.
 * Used throughout the app for platform identification.
 */

import React from 'react';
import { View } from 'react-native';
import { MessageCircle, Send, Instagram, MessageSquare } from 'lucide-react-native';
import { cn } from '../utils/cn';
import { Platform, PLATFORM_DISPLAY } from '../types/platform';

interface PlatformIconProps {
  platform: Platform;
  size?: number;
  connected?: boolean;
  showIndicator?: boolean;
  color?: string;
  className?: string;
}

const PLATFORM_ICONS: Record<Platform, React.ComponentType<{ size: number; color: string }>> = {
  [Platform.WHATSAPP]: MessageCircle,
  [Platform.TELEGRAM]: Send,
  [Platform.INSTAGRAM]: Instagram,
  [Platform.IMESSAGE]: MessageSquare,
};

export function PlatformIcon({
  platform,
  size = 24,
  connected = false,
  showIndicator = false,
  color,
  className,
}: PlatformIconProps) {
  const IconComponent = PLATFORM_ICONS[platform];
  const platformDisplay = PLATFORM_DISPLAY[platform];
  const iconColor = color || platformDisplay.color;

  // Calculate indicator size relative to icon size
  const indicatorSize = Math.max(8, size * 0.35);
  const indicatorOffset = -indicatorSize * 0.25;

  return (
    <View className={cn('relative', className)} style={{ width: size, height: size }}>
      <IconComponent size={size} color={iconColor} />

      {showIndicator && (
        <View
          className={cn(
            'absolute rounded-full border-2 border-white',
            connected ? 'bg-green-500' : 'bg-gray-400'
          )}
          style={{
            width: indicatorSize,
            height: indicatorSize,
            bottom: indicatorOffset,
            right: indicatorOffset,
          }}
        />
      )}
    </View>
  );
}

/**
 * Compact platform badge for use in message lists
 */
export function PlatformBadge({
  platform,
  size = 14,
  className,
}: {
  platform: Platform;
  size?: number;
  className?: string;
}) {
  const IconComponent = PLATFORM_ICONS[platform];
  const platformDisplay = PLATFORM_DISPLAY[platform];

  return (
    <View className={cn('opacity-70', className)}>
      <IconComponent size={size} color={platformDisplay.color} />
    </View>
  );
}

/**
 * Platform icon with background circle
 */
export function PlatformIconButton({
  platform,
  size = 48,
  connected = false,
  disabled = false,
  className,
}: {
  platform: Platform;
  size?: number;
  connected?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const IconComponent = PLATFORM_ICONS[platform];
  const platformDisplay = PLATFORM_DISPLAY[platform];

  const iconSize = size * 0.5;
  const indicatorSize = size * 0.2;

  return (
    <View
      className={cn(
        'items-center justify-center rounded-full',
        disabled ? 'opacity-40' : '',
        className
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: platformDisplay.bgColor,
      }}
    >
      <IconComponent size={iconSize} color={platformDisplay.color} />

      {connected && (
        <View
          className="absolute bg-green-500 rounded-full border-2 border-white"
          style={{
            width: indicatorSize,
            height: indicatorSize,
            bottom: 0,
            right: 0,
          }}
        />
      )}
    </View>
  );
}

export default PlatformIcon;
