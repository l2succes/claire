import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { fitMediaSize, type VisualMedia } from '@claire/chat-core';
import { MediaImage } from './media-image';
import { useMediaDimensions } from '../../hooks/useMediaDimensions';

function clamp(value: number, bound: number) {
  'worklet';
  return Math.max(-bound, Math.min(bound, value));
}

export function MediaZoomImage({ media, onClose }: { media: VisualMedia; onClose: () => void }) {
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const dimensions = useMediaDimensions(media);
  const size = fitMediaSize(dimensions.width, dimensions.height, viewport.width, viewport.height);
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const pinch = Gesture.Pinch().onStart(() => { startScale.value = scale.value; }).onUpdate((event) => {
    scale.value = Math.max(1, Math.min(5, startScale.value * event.scale));
    x.value = clamp(x.value, Math.max(0, (size.width * scale.value - viewport.width) / 2));
    y.value = clamp(y.value, Math.max(0, (size.height * scale.value - viewport.height) / 2));
  });
  const pan = Gesture.Pan().maxPointers(1).onStart(() => { startX.value = x.value; startY.value = y.value; }).onUpdate((event) => {
    if (scale.value <= 1) return;
    x.value = clamp(startX.value + event.translationX, Math.max(0, (size.width * scale.value - viewport.width) / 2));
    y.value = clamp(startY.value + event.translationY, Math.max(0, (size.height * scale.value - viewport.height) / 2));
  }).onEnd((event) => {
    if (scale.value <= 1 && event.translationY > 100 && Math.abs(event.translationX) < 80) runOnJS(onClose)();
  });
  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd((_event, success) => {
    if (!success) return;
    scale.value = withTiming(scale.value > 1 ? 1 : 2.5);
    x.value = withTiming(0);
    y.value = withTiming(0);
  });
  const motion = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return (
    <View style={{ flex: 1, width: '100%', overflow: 'hidden' }} onLayout={({ nativeEvent }) => {
      setViewport(nativeEvent.layout);
      scale.value = 1; x.value = 0; y.value = 0;
    }}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, doubleTap))}>
        <View collapsable={false} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[size, motion]}>
            <MediaImage uri={media.uri} testID="media-viewer-image" onDimensions={dimensions.onDimensions} />
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}
