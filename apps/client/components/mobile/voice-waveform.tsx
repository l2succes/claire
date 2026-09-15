import { useMemo, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent, type ViewProps } from 'react-native';
import { downsampleWaveform, sanitizeWaveform, seekSecondsForPosition } from '@claire/chat-core';

export function VoiceWaveform({
  samples,
  progress = 0,
  playedColor,
  remainingColor,
  onSeek,
  accessibilityLabel,
  style,
}: {
  samples?: number[];
  progress?: number;
  playedColor: string;
  remainingColor: string;
  onSeek?: (progress: number) => void;
  accessibilityLabel?: string;
  style?: ViewProps['style'];
}) {
  const [width, setWidth] = useState(0);
  const bars = useMemo(() => {
    const sanitized = downsampleWaveform(samples, 42);
    if (!sanitized.length) return Array.from({ length: 42 }, () => 76);
    if (sanitized.length >= 24) return sanitized;
    return Array.from({ length: 42 }, (_, index) => sanitized[Math.min(sanitized.length - 1, Math.floor(index * sanitized.length / 42))]);
  }, [samples]);
  const boundedProgress = Math.min(1, Math.max(0, progress));

  const seek = (event: GestureResponderEvent) => {
    if (!onSeek || width <= 0) return;
    onSeek(seekSecondsForPosition(event.nativeEvent.locationX, width, 1));
  };

  return (
    <View
      accessibilityRole={onSeek ? 'adjustable' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={onSeek ? { min: 0, max: 100, now: Math.round(boundedProgress * 100) } : undefined}
      accessibilityActions={onSeek ? [{ name: 'increment' }, { name: 'decrement' }] : undefined}
      onAccessibilityAction={onSeek ? (event) => {
        const delta = event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05;
        onSeek(Math.min(1, Math.max(0, boundedProgress + delta)));
      } : undefined}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => Boolean(onSeek)}
      onMoveShouldSetResponder={() => Boolean(onSeek)}
      onResponderGrant={seek}
      onResponderMove={seek}
      style={[
        { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 2 },
        style,
      ]}
    >
      {bars.map((sample, index) => {
        const normalized = sanitizeWaveform([sample])[0] ?? 0;
        const height = 4 + Math.round((normalized / 255) * 28);
        const played = bars.length <= 1 ? boundedProgress > 0 : index / (bars.length - 1) <= boundedProgress;
        return (
          <View
            key={index}
            style={{
              flex: 1,
              minWidth: 2,
              maxWidth: 3,
              height,
              borderRadius: 2,
              backgroundColor: played ? playedColor : remainingColor,
            }}
          />
        );
      })}
    </View>
  );
}
