import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ArrowLeft, ArrowRight } from 'lucide-react-native';
import Animated, { useAnimatedScrollHandler, type SharedValue } from 'react-native-reanimated';
import { colors, mobileType } from '@claire/design-system';
import { WelcomeArtwork } from './welcome-artwork';
import { WELCOME_SCENES } from './welcome-scenes';

function PageDot({ selected, index, onPress }: { selected: boolean; index: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Show ${WELCOME_SCENES[index].title}`} accessibilityState={{ selected }} onPress={onPress} style={{ minWidth: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ height: 6, width: selected ? 22 : 6, borderRadius: 3, backgroundColor: colors.ink, opacity: selected ? 1 : 0.25 }} />
    </Pressable>
  );
}

export function WelcomeCarousel({ progress, animate, reduceMotion }: {
  progress: SharedValue<number>; animate: boolean; reduceMotion: boolean;
}) {
  const ref = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const pageRef = useRef(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    if (width > 0 && !reduceMotion) progress.value = event.contentOffset.x / width;
  });
  useEffect(() => {
    // Preserve the selected story when rotating or resizing the window.
    ref.current?.scrollTo({ x: pageRef.current * width, animated: false });
    progress.value = pageRef.current;
  }, [width, progress]);
  const select = (index: number) => {
    pageRef.current = index;
    setPage(index);
    if (reduceMotion) progress.value = index;
    ref.current?.scrollTo({ x: index * width, animated: !reduceMotion });
  };
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
        onMomentumScrollEnd={(event) => {
          const index = Math.max(0, Math.min(2, Math.round(event.nativeEvent.contentOffset.x / width)));
          pageRef.current = index;
          setPage(index);
          progress.value = index;
        }}
      >
        {width > 0 && WELCOME_SCENES.map((scene, index) => (
          <View key={scene.title} style={{ width, paddingTop: 270, paddingHorizontal: 20, gap: 8 }} aria-hidden={page !== index} accessibilityElementsHidden={page !== index} importantForAccessibility={page === index ? 'auto' : 'no-hide-descendants'}>
            <Text style={{ ...mobileType.sectionTitle, textAlign: 'center', color: colors.ink }}>{scene.title}</Text>
            <Text style={{ ...mobileType.body, textAlign: 'center', color: colors.neutral[600] }}>{scene.description}</Text>
          </View>
        ))}
      </Animated.ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 10 }}>
        <Pressable testID="welcome-previous" accessibilityRole="button" accessibilityLabel="Previous introduction" disabled={page === 0} accessibilityState={{ disabled: page === 0 }} onPress={() => select(page - 1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: page === 0 ? 0.2 : 1 }}>
          <ArrowLeft size={17} color={colors.ink} />
        </Pressable>
        <View style={{ flexDirection: 'row' }}>
          {WELCOME_SCENES.map((scene, index) => <PageDot key={scene.title} index={index} selected={page === index} onPress={() => select(index)} />)}
        </View>
        <Pressable testID="welcome-next" accessibilityRole="button" accessibilityLabel="Next introduction" disabled={page === 2} accessibilityState={{ disabled: page === 2 }} onPress={() => select(page + 1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: page === 2 ? 0.2 : 1 }}>
          <ArrowRight size={17} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}
