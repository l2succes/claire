import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { X } from 'lucide-react-native';
import { colors, mobileType, space } from '@claire/design-system';
import { MobileIconButton } from './claire-mobile';

// The floating tab bar is absolutely positioned at the bottom of the screen and
// is 58pt tall above the safe-area inset. A sheet that ignores it renders its
// last row underneath the bar, so reserve that space.
const TAB_BAR_HEIGHT = 58;
const TAB_BAR_GAP = 12;

export function bottomSheetInset(safeAreaBottom: number) {
  return Math.max(safeAreaBottom, 8) + TAB_BAR_HEIGHT + TAB_BAR_GAP;
}

const SNAP_POINTS = ['50%'];

/**
 * Shared bottom-sheet chrome: a backdrop that only fades, a rounded surface that
 * slides up, a grabber, and a titled header with a close control.
 *
 * RN's Modal could not do this: its `animationType` is one setting for the whole
 * modal, so the scrim either slid with the sheet or faded with it. Here the
 * backdrop is a separate layer animating opacity while the surface translates.
 */
export function BottomSheet({
  visible,
  title,
  onClose,
  children,
  testID,
  snapPoints = SNAP_POINTS,
  scrollable = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
  snapPoints?: string[];
  scrollable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<GorhomBottomSheet>(null);

  useEffect(() => {
    if (visible) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        // Fade in as the sheet reaches its snap point and out as it closes; the
        // backdrop itself never moves.
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.35}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    <GorhomBottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderBackdrop}
      // Non-modal sheets render in place, so the container has to cover the
      // screen for the backdrop to fill it.
      containerStyle={StyleSheet.absoluteFillObject}
      handleIndicatorStyle={{ width: 40, height: 4, backgroundColor: colors.neutral[200] }}
      backgroundStyle={{
        backgroundColor: colors.paper,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      }}
    >
      {scrollable ? (
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: bottomSheetInset(insets.bottom) }}>
          <View
            testID={testID}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[2],
              paddingHorizontal: space[4],
              paddingTop: space[3],
              paddingBottom: space[2],
            }}
          >
            <Text style={{ ...mobileType.sectionTitle, flex: 1, color: colors.ink }}>{title}</Text>
            <MobileIconButton
              label="Close"
              testID={testID ? `${testID}-close` : undefined}
              onPress={onClose}
            >
              <X size={19} color={colors.ink} />
            </MobileIconButton>
          </View>
          {children}
        </BottomSheetScrollView>
      ) : (
      <BottomSheetView style={{ paddingBottom: bottomSheetInset(insets.bottom) }}>
        <View
          testID={testID}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            paddingHorizontal: space[4],
            paddingTop: space[3],
            paddingBottom: space[2],
          }}
        >
          <Text style={{ ...mobileType.sectionTitle, flex: 1, color: colors.ink }}>{title}</Text>
          <MobileIconButton
            label="Close"
            testID={testID ? `${testID}-close` : undefined}
            onPress={onClose}
          >
            <X size={19} color={colors.ink} />
          </MobileIconButton>
        </View>
        {children}
      </BottomSheetView>
      )}
    </GorhomBottomSheet>
  );
}
