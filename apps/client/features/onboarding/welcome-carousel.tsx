import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { colors, mobileType } from '@claire/design-system';
import { WelcomeArtwork } from './welcome-artwork';
import { nextWelcomeScene, WELCOME_AUTO_ADVANCE_MS, WELCOME_SCENES } from './welcome-scenes';

const ACTIVE_INDICATOR_WIDTH = 22;

function PageDot({ selected, index, onPress, autoplay, cycle }: {
  selected: boolean;
  index: number;
  onPress: () => void;
  autoplay: boolean;
  cycle: number;
}) {
  const fill = useSharedValue(selected && !autoplay ? 1 : 0);
  useEffect(() => {
    cancelAnimation(fill);
    if (!selected) {
      fill.value = 0;
      return;
    }
    if (!autoplay) {
      fill.value = 1;
      return;
    }
    fill.value = 0;
    fill.value = withTiming(1, { duration: WELCOME_AUTO_ADVANCE_MS, easing: Easing.linear });
    return () => cancelAnimation(fill);
  }, [autoplay, cycle, fill, selected]);
  const fillStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -(ACTIVE_INDICATOR_WIDTH / 2) * (1 - fill.value) },
      { scaleX: fill.value },
    ],
  }));

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Show ${WELCOME_SCENES[index].accessibilityLabel}`} accessibilityState={{ selected }} onPress={onPress} style={{ minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      {selected ? (
        <View testID={`welcome-indicator-${index}`} style={{ height: 6, width: ACTIVE_INDICATOR_WIDTH, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(16,18,15,0.2)' }}>
          <Animated.View testID={`welcome-indicator-fill-${index}`} style={[{ width: ACTIVE_INDICATOR_WIDTH, height: 6, borderRadius: 3, backgroundColor: colors.ink }, fillStyle]} />
        </View>
      ) : (
        <View testID={`welcome-indicator-${index}`} style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: colors.ink, opacity: 0.25 }} />
      )}
    </Pressable>
  );
}

export function WelcomeCarousel({ progress, animate, reduceMotion }: {
  progress: SharedValue<number>; animate: boolean; reduceMotion: boolean;
}) {
  const ref = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [cycle, setCycle] = useState(0);
  const pageRef = useRef(0);
  const autoplay = animate && !dragging && width > 0;
  const onScroll = useAnimatedScrollHandler((event) => {
    if (width > 0 && !reduceMotion) progress.value = event.contentOffset.x / width;
  });
  useEffect(() => {
    // Preserve the selected story when rotating or resizing the window.
    ref.current?.scrollTo({ x: pageRef.current * width, animated: false });
    progress.value = pageRef.current;
  }, [width, progress]);
  const select = useCallback((index: number) => {
    pageRef.current = index;
    setPage(index);
    setCycle((value) => value + 1);
    if (reduceMotion) progress.value = index;
    ref.current?.scrollTo({ x: index * width, animated: !reduceMotion });
  }, [progress, reduceMotion, width]);
  const settleAtOffset = useCallback((offset: number) => {
    if (width <= 0) return;
    const index = Math.max(0, Math.min(WELCOME_SCENES.length - 1, Math.round(offset / width)));
    pageRef.current = index;
    setPage(index);
    setDragging(false);
    setCycle((value) => value + 1);
    progress.value = index;
  }, [progress, width]);
  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => select(nextWelcomeScene(pageRef.current)), WELCOME_AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [autoplay, cycle, page, select]);
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ width: '100%', maxWidth: 460, alignSelf: 'center' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <WelcomeArtwork progress={progress} animate={animate} />
      </View>
      <Animated.ScrollView
        ref={ref}
        testID="welcome-carousel"
        style={{ flexGrow: 0, flexShrink: 0 }}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          setDragging(true);
          setCycle((value) => value + 1);
        }}
        onScrollEndDrag={(event) => {
          if (Math.abs(event.nativeEvent.velocity?.x ?? 0) < 0.01) settleAtOffset(event.nativeEvent.contentOffset.x);
        }}
        onMomentumScrollEnd={(event) => {
          settleAtOffset(event.nativeEvent.contentOffset.x);
        }}
      >
        {width > 0 && WELCOME_SCENES.map((scene, index) => (
          <View key={scene.id} style={{ width, paddingTop: 270, paddingHorizontal: 20, gap: 8 }} aria-hidden={page !== index} accessibilityElementsHidden={page !== index} importantForAccessibility={page === index ? 'auto' : 'no-hide-descendants'}>
            {scene.title ? <Text style={{ ...mobileType.sectionTitle, textAlign: 'center', color: colors.ink }}>{scene.title}</Text> : null}
            <Text numberOfLines={scene.compactDescription ? 1 : undefined} adjustsFontSizeToFit={scene.compactDescription} minimumFontScale={0.9} style={{ ...(scene.compactDescription ? mobileType.bodySmall : mobileType.body), textAlign: 'center', color: colors.neutral[600] }}>{scene.description}</Text>
          </View>
        ))}
      </Animated.ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10 }}>
        {WELCOME_SCENES.map((scene, index) => <PageDot key={scene.id} index={index} selected={page === index} autoplay={autoplay} cycle={cycle} onPress={() => select(index)} />)}
      </View>
    </View>
  );
}
