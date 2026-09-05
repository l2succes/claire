import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GorhomBottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Copy, Reply, X } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { QUICK_REACTIONS } from '@claire/chat-core';

// An OTA bundle may arrive before the native module in an older development
// client. Keep the long-press menu safe in that small window; the next binary
// gains native clipboard support automatically.
let clipboard: typeof import('expo-clipboard') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  clipboard = require('expo-clipboard') as typeof import('expo-clipboard');
} catch {
  clipboard = null;
}

type MessageContextMenuProps = {
  visible: boolean;
  canReact: boolean;
  canReply: boolean;
  content: string;
  activeReactionEmojis?: readonly string[];
  onReact: (emoji: string) => void;
  onReply: () => void;
  onDismiss: () => void;
};

/**
 * Long-press actions are intentionally a bottom sheet rather than a bubble
 * popover. It gives the action row a predictable, reachable hit target while
 * keeping the selected message visible behind a dimmed backdrop, like Slack's
 * mobile interaction. Only actions with an implementation are shown here.
 *
 */
export function MessageContextMenu({
  visible,
  canReact,
  canReply,
  content,
  activeReactionEmojis = [],
  onReact,
  onReply,
  onDismiss,
}: MessageContextMenuProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<GorhomBottomSheet>(null);
  const snapPoints = useMemo(() => ['34%'], []);
  const canCopy = Boolean(
    content &&
      (clipboard ||
        (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function')),
  );

  useEffect(() => {
    if (visible) sheetRef.current?.snapToIndex(0);
    else sheetRef.current?.close();
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  const copy = async () => {
    if (clipboard) await clipboard.setStringAsync(content);
    if (!clipboard && typeof navigator !== 'undefined') await navigator.clipboard?.writeText(content);
    onDismiss();
  };

  return (
    <GorhomBottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderBackdrop}
      containerStyle={[StyleSheet.absoluteFillObject, { zIndex: 50, elevation: 50 }]}
      handleIndicatorStyle={{ width: 38, height: 4, backgroundColor: 'rgba(255,255,255,0.28)' }}
      backgroundStyle={{
        backgroundColor: colors.ink,
        borderTopLeftRadius: radius.panel,
        borderTopRightRadius: radius.panel,
      }}
    >
      <BottomSheetView
        testID="message-context-menu"
        style={{
          paddingHorizontal: space[3],
          paddingBottom: Math.max(insets.bottom, space[3]),
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: space[2],
          }}
        >
          <Text style={{ ...mobileType.monoLabel, color: 'rgba(255,255,255,0.64)' }}>
            MESSAGE ACTIONS
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close message actions"
            onPress={onDismiss}
            hitSlop={8}
            style={{
              width: 32,
              height: 32,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={19} color={colors.paper} strokeWidth={2.2} />
          </Pressable>
        </View>

        {canReact ? (
          <View
            accessibilityLabel="React to message"
            style={{ flexDirection: 'row', gap: 7, marginBottom: space[3] }}
          >
            {QUICK_REACTIONS.map(({ emoji, name }) => {
              const active = activeReactionEmojis.includes(emoji);
              return (
                <Pressable
                  key={emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`React with ${name}`}
                  accessibilityState={{ selected: active }}
                  disabled={active}
                  onPress={() => onReact(emoji)}
                  style={{
                    width: 42,
                    height: 42,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 21,
                    borderWidth: active ? 1 : 0,
                    borderColor: colors.lime,
                    backgroundColor: active ? colors.lime : 'rgba(255,255,255,0.10)',
                    opacity: active ? 0.7 : 1,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{emoji}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {canReply ? (
            <ActionCard
              icon={<Reply size={21} color={colors.paper} strokeWidth={2.1} />}
              label="Reply"
              onPress={onReply}
              testID="message-context-reply"
            />
          ) : null}
          <ActionCard
            icon={<Copy size={21} color={colors.paper} strokeWidth={2.1} />}
            label="Copy"
            onPress={() => void copy()}
            disabled={!canCopy}
            testID="message-context-copy"
          />
        </View>
      </BottomSheetView>
    </GorhomBottomSheet>
  );
}

function ActionCard({
  icon,
  label,
  onPress,
  disabled = false,
  testID,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label === 'Copy' ? 'Copy message' : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 82,
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        borderRadius: radius.control,
        backgroundColor: 'rgba(255,255,255,0.10)',
        opacity: disabled ? 0.38 : 1,
      }}
    >
      {icon}
      <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.paper }}>{label}</Text>
    </Pressable>
  );
}
