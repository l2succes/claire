import { useRef, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
  SwipeDirection,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { colors, mobileType } from '@claire/design-system';

export type SwipeRowAction = {
  id: string;
  label: string;
  icon: ReactNode;
  backgroundColor: string;
  onPress: () => void;
};

let openRow: SwipeableMethods | null = null;

function ActionStrip({
  actions,
  methods,
}: {
  actions: SwipeRowAction[];
  methods: SwipeableMethods;
}) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {actions.map((action) => (
        <Pressable
          key={action.id}
          testID={`swipe-action-${action.id}`}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            methods.close();
            action.onPress();
          }}
          style={{
            width: 76,
            minHeight: 44,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            backgroundColor: action.backgroundColor,
          }}
        >
          {action.icon}
          <Text maxFontSizeMultiplier={1} style={{ ...mobileType.monoLabel, color: colors.ink }}>
            {action.label.toUpperCase()}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Shared iOS-style row gestures. A deliberate horizontal drag reveals actions;
 * vertical motion remains the parent list's scroll gesture. Only one row stays
 * open at a time so the feed never turns into a wall of exposed controls.
 */
export function SwipeActionRow({
  children,
  leftActions = [],
  rightActions = [],
  enabled = true,
  testID,
}: {
  children: ReactNode;
  leftActions?: SwipeRowAction[];
  rightActions?: SwipeRowAction[];
  enabled?: boolean;
  testID?: string;
}) {
  const ref = useRef<SwipeableMethods | null>(null);
  const hasLeft = leftActions.length > 0;
  const hasRight = rightActions.length > 0;

  if (!enabled || (!hasLeft && !hasRight)) return children;

  return (
    <ReanimatedSwipeable
      ref={ref}
      testID={testID}
      friction={1.35}
      leftThreshold={42}
      rightThreshold={42}
      dragOffsetFromLeftEdge={12}
      dragOffsetFromRightEdge={12}
      overshootLeft={false}
      overshootRight={false}
      enableTrackpadTwoFingerGesture
      containerStyle={{ overflow: 'hidden' }}
      childrenContainerStyle={{ backgroundColor: colors.paper }}
      renderLeftActions={hasLeft ? (_progress, _translation, methods) => (
        <ActionStrip actions={leftActions} methods={methods} />
      ) : undefined}
      renderRightActions={hasRight ? (_progress, _translation, methods) => (
        <ActionStrip actions={rightActions} methods={methods} />
      ) : undefined}
      onSwipeableWillOpen={() => {
        if (openRow && openRow !== ref.current) openRow.close();
        openRow = ref.current;
      }}
      onSwipeableClose={(_direction: SwipeDirection) => {
        if (openRow === ref.current) openRow = null;
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
