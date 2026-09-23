import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  AtSign,
  MessageCircle,
  Plus,
  Search,
  SendHorizonal,
  ArrowUpRight,
} from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { GLOBAL_ASK_ACTIONS } from '../../features/assistant/ask-actions';
import type { ChatPlusDefault } from '../../stores/chatPreferencesStore';
import { VoiceNoteControl, type VoiceNoteDraft } from './voice-note-control';

const CONTROL = 36;

const toolIcons = {
  attention: ArrowUpRight,
  find: Search,
} as const;

type ComposerAction = {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

function ComposerMenu({ items, testID }: { items: ComposerAction[]; testID?: string }) {
  return (
    <Animated.View
      entering={FadeInUp.duration(220).easing(Easing.out(Easing.cubic))}
      exiting={FadeOutDown.duration(150).easing(Easing.in(Easing.cubic))}
      testID={testID}
      style={{
        marginBottom: space[2],
        overflow: 'hidden',
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.ink,
        backgroundColor: colors.paper,
      }}
    >
      {items.map((item, index) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityState={{ disabled: item.disabled }}
          disabled={item.disabled}
          onPress={item.onPress}
          testID={`composer-action-${item.id}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            paddingHorizontal: space[3],
            paddingVertical: 11,
            borderBottomWidth: index < items.length - 1 ? 1 : 0,
            borderBottomColor: colors.neutral[200],
            opacity: item.disabled ? 0.55 : 1,
          }}
        >
          {item.icon ? (
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: colors.neutral[100],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {item.icon}
            </View>
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ ...mobileType.label, color: item.destructive ? colors.danger : colors.ink }}
            >
              {item.label}
            </Text>
            {item.description ? (
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
                {item.description}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </Animated.View>
  );
}

function PlusToggle({ open }: { open: boolean }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withTiming(open ? 45 : 0, { duration: 180 });
  }, [open, rotation]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
  return (
    <Animated.View style={spin}>
      <Plus size={18} color={colors.ink} strokeWidth={2.2} />
    </Animated.View>
  );
}

function ComposerBar({
  variant,
  value,
  onChangeText,
  onSend,
  sending,
  onAddPress,
  onAddLongPress,
  addIcon,
  sendIcon,
  addAccessibilityLabel,
  addTestID,
  addActive,
  chips,
  menu,
  voiceReview,
  trailingControl,
  inputTestID,
  sendTestID,
  inputRef,
  style,
  ...inputProps
}: Omit<TextInputProps, 'style'> & {
  variant: 'chat' | 'ask';
  onSend: () => void;
  sending?: boolean;
  onAddPress?: () => void;
  onAddLongPress?: () => void;
  addIcon: ReactNode;
  sendIcon: ReactNode;
  addAccessibilityLabel: string;
  addTestID?: string;
  addActive?: boolean;
  chips?: ReactNode;
  menu?: ReactNode;
  /** Compact review state lives above the composer; never in the timeline. */
  voiceReview?: ReactNode;
  /** A small host action immediately beside the text input (for example, mic). */
  trailingControl?: ReactNode;
  inputTestID?: string;
  sendTestID?: string;
  inputRef?: React.RefObject<TextInput | null>;
  style?: StyleProp<ViewStyle>;
}) {
  const trimmedValue = value?.toString().trim();
  const armed = Boolean(trimmedValue && (variant !== 'ask' || trimmedValue !== '@')) && !sending;
  const controlSize = variant === 'ask' ? 32 : CONTROL;
  return (
    <View style={style}>
      {chips}
      {variant === 'chat' ? menu : null}
      {voiceReview}
      <View
        style={{
          minHeight: variant === 'ask' ? 42 : 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: variant === 'ask' ? 4 : 6,
          paddingHorizontal: 8,
          borderWidth: 1,
          borderColor: colors.neutral[200],
          borderRadius: variant === 'ask' ? 16 : 18,
          backgroundColor: colors.paper,
          boxShadow: '0 5px 15px rgba(16,18,15,0.08)',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addAccessibilityLabel}
          accessibilityHint={variant === 'ask' ? 'Choose a person or chat for the next question' : 'Touch and hold to switch between attachments and reply options'}
          onPress={onAddPress}
          onLongPress={onAddLongPress}
          delayLongPress={320}
          hitSlop={variant === 'ask' ? 6 : undefined}
          testID={addTestID}
          style={{
            width: controlSize,
            height: controlSize,
            borderRadius: 12,
            backgroundColor: addActive ? colors.lime : colors.neutral[100],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {addIcon}
        </Pressable>
        <TextInput
          ref={inputRef}
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          placeholder={
            inputProps.placeholder ||
            (variant === 'ask' ? 'Ask Claire…' : 'Write a message…')
          }
          placeholderTextColor={colors.neutral[400]}
          multiline
          maxFontSizeMultiplier={1}
          textAlignVertical="center"
          testID={inputTestID}
          style={{
            flex: 1,
            minHeight: controlSize,
            maxHeight: variant === 'ask' ? 88 : 110,
            paddingHorizontal: space[1],
            paddingTop: variant === 'ask' ? 5 : 8,
            paddingBottom: variant === 'ask' ? 5 : 8,
            ...mobileType.body,
            color: colors.ink,
          }}
        />
        {trailingControl}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={variant === 'ask' ? 'Ask Claire' : 'Send message'}
          disabled={!armed}
          onPress={onSend}
          hitSlop={variant === 'ask' ? 6 : undefined}
          testID={sendTestID}
          style={{
            width: controlSize,
            height: controlSize,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: armed ? colors.ink : colors.neutral[200],
          }}
        >
          {sending ? <ActivityIndicator size="small" color={colors.lime} /> : sendIcon}
        </Pressable>
      </View>
      {variant === 'ask' && menu ? (
        <View style={{ position: 'absolute', bottom: '100%', left: 0, right: 0 }}>
          {menu}
        </View>
      ) : null}
    </View>
  );
}

export function AskToolGrid({
  onAsk,
  onFind,
}: {
  onAsk: (prompt: string) => void;
  onFind: () => void;
}) {
  return (
    <View testID="ask-tool-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
      {GLOBAL_ASK_ACTIONS.map((tool) => {
        const Icon = toolIcons[tool.id];
        return (
          <Pressable
            key={tool.id}
            accessibilityRole="button"
            onPress={() => tool.prompt ? onAsk(tool.prompt) : onFind()}
            testID={`claire-tool-${tool.id}`}
            style={{
              width: '47.8%',
              minHeight: 132,
              justifyContent: 'space-between',
              padding: space[3],
              borderRadius: radius.card,
              borderCurve: 'continuous',
              borderWidth: 1,
              borderColor: colors.neutral[400],
              backgroundColor: 'rgba(255,255,255,0.5)',
            }}
          >
            <Icon size={22} color={colors.ink} strokeWidth={2.2} />
            <View style={{ gap: 3 }}>
              <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>
                {tool.label}
              </Text>
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
                {tool.description}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChatComposer({
  value,
  onChangeText,
  onSend,
  sending,
  plusDefault = 'menu',
  replyOptionsVisible = false,
  onToggleReplyOptions,
  accessory,
  style,
  inputRef,
  voiceEnabled = false,
  onSendVoice,
  ...inputProps
}: Omit<TextInputProps, 'style'> & {
  onSend: () => void;
  sending?: boolean;
  plusDefault?: ChatPlusDefault;
  replyOptionsVisible?: boolean;
  onToggleReplyOptions?: () => void;
  /** A message-level control, such as the active native reply target. */
  accessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
  inputRef?: React.RefObject<TextInput | null>;
  voiceEnabled?: boolean;
  onSendVoice?: (draft: VoiceNoteDraft) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = () => setMenuOpen((open) => !open);
  const toggleReplyOptions = () => {
    setMenuOpen(false);
    onToggleReplyOptions?.();
  };
  const onAddPress = () => (plusDefault === 'menu' ? toggleMenu() : toggleReplyOptions());
  const onAddLongPress = () => (plusDefault === 'menu' ? toggleReplyOptions() : toggleMenu());
  const actions: ComposerAction[] = [
    ...(onToggleReplyOptions
      ? [
          {
            id: 'reply-options',
            label: replyOptionsVisible ? 'Hide reply options' : 'Reply options',
            description: replyOptionsVisible
              ? 'Put Claire’s drafts away.'
              : 'Claire drafts a few ways to answer.',
            icon: <MessageCircle size={13} color={colors.ink} />,
            onPress: toggleReplyOptions,
          },
        ]
      : []),
    {
      id: 'photo',
      label: 'Attach a photo',
      description: 'Coming soon.',
      disabled: true,
      icon: <Plus size={13} color={colors.neutral[600]} />,
      onPress: () => undefined,
    },
    {
      id: 'file',
      label: 'Attach a file',
      description: 'Coming soon.',
      disabled: true,
      icon: <Plus size={13} color={colors.neutral[600]} />,
      onPress: () => undefined,
    },
  ];
  const armed = Boolean(value?.toString().trim()) && !sending;
  const composer = (voiceReview?: ReactNode, voiceTrigger?: ReactNode) => (
    <ComposerBar
      variant="chat"
      value={value}
      onChangeText={onChangeText}
      onSend={() => {
        setMenuOpen(false);
        onSend();
      }}
      sending={sending}
      onAddPress={onAddPress}
      onAddLongPress={onAddLongPress}
      addIcon={<PlusToggle open={menuOpen} />}
      sendIcon={
        <SendHorizonal
          size={18}
          color={armed ? colors.lime : colors.neutral[400]}
          strokeWidth={2.2}
        />
      }
      addAccessibilityLabel={plusDefault === 'menu' ? 'Chat actions' : 'Reply options'}
      addTestID="chat-composer-add"
      addActive={menuOpen}
      chips={accessory}
      menu={menuOpen ? <ComposerMenu items={actions} testID="chat-composer-menu" /> : null}
      voiceReview={voiceReview}
      trailingControl={voiceTrigger}
      inputTestID="chat-input"
      inputRef={inputRef}
      sendTestID="chat-send-button"
      style={style}
      {...inputProps}
    />
  );

  if (!onSendVoice) return composer();
  return (
    <VoiceNoteControl enabled={voiceEnabled} sending={sending} onSend={onSendVoice}>
      {({ trigger, review }) => composer(review, trigger)}
    </VoiceNoteControl>
  );
}

export function AskComposer({
  value,
  onChangeText,
  onSend,
  sending,
  menuOpen,
  onMenuOpenChange,
  onTagPerson,
  inputRef,
  chips,
  style,
  ...inputProps
}: Omit<TextInputProps, 'style'> & {
  onSend: () => void;
  sending?: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onTagPerson?: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  chips?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const close = (action?: () => void) => {
    onMenuOpenChange(false);
    action?.();
  };
  const actions: ComposerAction[] = [
    {
      id: 'tag',
      label: 'Focus a person or chat',
      description: 'Choose who Claire should read for this question.',
      icon: <AtSign size={13} color={colors.ink} />,
      onPress: () => close(onTagPerson),
    },
  ].filter((item) => {
    if (item.id === 'tag') return Boolean(onTagPerson);
    return true;
  });

  return (
    <ComposerBar
      variant="ask"
      value={value}
      onChangeText={onChangeText}
      onSend={() => {
        onMenuOpenChange(false);
        onSend();
      }}
      sending={sending}
      onAddPress={() => onMenuOpenChange(!menuOpen)}
      addIcon={<PlusToggle open={menuOpen} />}
      sendIcon={
        <SendHorizonal
          size={18}
          color={value?.toString().trim() && value?.toString().trim() !== '@' && !sending ? colors.lime : colors.neutral[400]}
          strokeWidth={2.2}
        />
      }
      addAccessibilityLabel="Choose Claire scope"
      addActive={menuOpen}
      chips={chips}
      menu={menuOpen ? <ComposerMenu items={actions} testID="ask-composer-menu" /> : null}
      inputTestID={inputProps.testID || 'assistant-input'}
      inputRef={inputRef}
      sendTestID="assistant-send"
      style={style}
      {...inputProps}
    />
  );
}
