import { ActivityIndicator, Pressable, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import { colors, mobileType, radius, space } from './tokens';
import { ClaireText } from './primitives';

export type ClaireComposerVariant = 'chat' | 'ask';

export type ClaireComposerAction = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export type ClaireToolItem = {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  onPress: () => void;
};

export function ClaireComposer({
  variant = 'chat',
  value,
  onChangeText,
  placeholder,
  onSend,
  sending = false,
  canSend,
  onAddPress,
  addIcon,
  sendIcon,
  addAccessibilityLabel = 'More actions',
  addDisabled = false,
  chips,
  menu,
  testID,
  inputTestID,
  sendTestID,
  style,
  ...inputProps
}: Omit<TextInputProps, 'style'> & {
  variant?: ClaireComposerVariant;
  onSend: () => void;
  sending?: boolean;
  canSend?: boolean;
  onAddPress?: () => void;
  addIcon: ReactNode;
  sendIcon: ReactNode;
  addAccessibilityLabel?: string;
  addDisabled?: boolean;
  chips?: ReactNode;
  menu?: ReactNode;
  testID?: string;
  inputTestID?: string;
  sendTestID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const armed = (canSend ?? Boolean(value?.toString().trim())) && !sending;
  return (
    <View testID={testID} style={style}>
      {chips}
      {menu}
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addAccessibilityLabel}
          disabled={addDisabled}
          onPress={onAddPress}
          style={[styles.add, addDisabled && styles.disabled]}
        >
          {addIcon}
        </Pressable>
        <TextInput
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || (variant === 'ask' ? 'Ask about a message, plan, or @person…' : 'Write a message…')}
          placeholderTextColor={colors.neutral[400]}
          multiline
          maxFontSizeMultiplier={1}
          testID={inputTestID}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={variant === 'ask' ? 'Ask Claire' : 'Send message'}
          disabled={!armed}
          onPress={onSend}
          testID={sendTestID}
          style={[styles.send, armed ? styles.sendArmed : styles.sendIdle]}
        >
          {sending ? <ActivityIndicator size="small" color={colors.lime} /> : sendIcon}
        </Pressable>
      </View>
    </View>
  );
}

export function ClaireComposerMenu({ items, testID }: { items: ClaireComposerAction[]; testID?: string }) {
  return (
    <View testID={testID} style={styles.menu}>
      {items.map((item, index) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityState={{ disabled: item.disabled }}
          disabled={item.disabled}
          onPress={item.onPress}
          testID={`composer-action-${item.id}`}
          style={[styles.menuRow, index < items.length - 1 && styles.menuRowBorder, item.disabled && styles.disabled]}
        >
          {item.icon ? <View style={styles.menuIcon}>{item.icon}</View> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <ClaireText variant="label" style={{ color: item.destructive ? colors.danger : colors.ink }}>{item.label}</ClaireText>
            {item.description ? <ClaireText variant="bodySmall" style={{ color: colors.neutral[600] }}>{item.description}</ClaireText> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function ClaireToolGrid({ items, testID }: { items: ClaireToolItem[]; testID?: string }) {
  return (
    <View testID={testID} style={styles.grid}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={item.onPress}
          testID={`claire-tool-${item.id}`}
          style={styles.tool}
        >
          <View>{item.icon}</View>
          <View style={{ gap: 3 }}>
            <ClaireText variant="body" style={{ fontWeight: '700' }}>{item.label}</ClaireText>
            <ClaireText variant="bodySmall" style={{ color: colors.neutral[600] }}>{item.description}</ClaireText>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const CONTROL = 36;

const styles = {
  bar: {
    minHeight: 48,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.neutral[200],
    borderRadius: 18,
    backgroundColor: colors.paper,
    boxShadow: '0 5px 15px rgba(16,18,15,0.08)',
  },
  add: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: 12,
    backgroundColor: colors.neutral[100],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  input: {
    flex: 1,
    minHeight: CONTROL,
    maxHeight: 110,
    paddingHorizontal: space[1],
    paddingTop: 8,
    paddingBottom: 8,
    ...mobileType.body,
    color: colors.ink,
  },
  send: {
    width: CONTROL,
    height: CONTROL,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendArmed: { backgroundColor: colors.ink },
  sendIdle: { backgroundColor: colors.neutral[200] },
  disabled: { opacity: 0.55 },
  menu: {
    marginBottom: space[2],
    overflow: 'hidden' as const,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.ink,
    backgroundColor: colors.paper,
  },
  menuRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: 11,
  },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.neutral[200] },
  menuIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.neutral[100],
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space[3],
  },
  tool: {
    width: '47.8%' as const,
    minHeight: 132,
    justifyContent: 'space-between' as const,
    padding: space[3],
    borderRadius: radius.card,
    borderCurve: 'continuous' as const,
    borderWidth: 1,
    borderColor: colors.neutral[400],
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
};
