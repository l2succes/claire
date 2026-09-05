/**
 * PlatformIcon Component
 *
 * Official Simple Icons marks (same source as Connections) with a lucide fallback.
 */

import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MessageCircle, Send, Instagram, MessageSquare } from 'lucide-react-native';
import { colors, mobileType } from '@claire/design-system';
import { cn } from '../utils/cn';
import { Platform, PLATFORM_DISPLAY, platformLabel, resolvePlatform } from '../types/platform';

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

function platformIconUri(platform: Platform, color?: string) {
  const hex = (color || PLATFORM_DISPLAY[platform].color).replace('#', '');
  return `https://cdn.simpleicons.org/${PLATFORM_DISPLAY[platform].iconSlug}/${hex}`;
}

function PlatformMark({ platform, size, color }: { platform: Platform; size: number; color?: string }) {
  const [failed, setFailed] = useState(false);
  const Fallback = PLATFORM_ICONS[platform];
  const iconColor = color || PLATFORM_DISPLAY[platform].color;
  if (failed) return <Fallback size={size} color={iconColor} />;
  return (
    <Image
      source={{ uri: platformIconUri(platform, color) }}
      style={{ width: size, height: size }}
      contentFit="contain"
      onError={() => setFailed(true)}
    />
  );
}

export function PlatformIcon({
  platform,
  size = 24,
  connected = false,
  showIndicator = false,
  color,
  className,
}: PlatformIconProps) {
  const indicatorSize = Math.max(8, size * 0.35);
  const indicatorOffset = -indicatorSize * 0.25;

  return (
    <View className={cn('relative', className)} style={{ width: size, height: size, flexShrink: 0 }}>
      <PlatformMark platform={platform} size={size} color={color} />

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

export function PlatformBadge({
  platform,
  size = 14,
  className,
}: {
  platform: Platform;
  size?: number;
  className?: string;
}) {
  return (
    <View className={className} style={{ width: size, height: size, flexShrink: 0 }}>
      <PlatformMark platform={platform} size={size} />
    </View>
  );
}

export function PlatformName({
  platform,
  size = 13,
}: {
  platform?: string | null;
  size?: number;
}) {
  const resolved = resolvePlatform(platform);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
      {resolved ? <PlatformIcon platform={resolved} size={size} /> : null}
      <Text numberOfLines={1} style={{ ...mobileType.label, color: colors.neutral[600] }}>{platformLabel(platform)}</Text>
    </View>
  );
}

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
      <PlatformMark platform={platform} size={iconSize} />

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
