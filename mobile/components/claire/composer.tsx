import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AtSign, Filter, List, MessageCircle, Plus, Search, SendHorizonal, Smile, Sparkles, Trash2, ArrowUpRight } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import type { ChatPlusDefault } from '../../stores/chatPreferencesStore';

const CONTROL = 36;

export const ASK_TOOLS = [
  { id: 'catch-me-up', label: 'Catch me up', description: 'Summarize recent conversations.', prompt: 'Catch me up on the conversations that need my attention.' },
  { id: 'open-loops', label: 'Find open loops', description: 'Open loops and questions.', prompt: 'What commitments, questions, or plans are still unresolved?' },
  { id: 'tone', label: 'Check the tone', description: 'Warm, direct, or playful.', prompt: 'What patterns do you notice in the tone of my recent conversations? Distinguish observations from inference.' },
  { id: 'find', label: 'Find something', description: 'Search messages and plans.', prompt: 'Help me find something I remember saying or receiving.' },
] as const;

const toolIcons = {
  'catch-me-up': List,
  'open-loops': ArrowUpRight,
  tone: Smile,
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
    <Animated.View entering={FadeInDown.duration(180).springify().damping(18)} exiting={FadeOutUp.duration(120)} testID={testID} style={{ marginBottom: space[2], overflow: 'hidden', borderRadius: radius.card, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.paper }}>
      {items.map((item, index) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityState={{ disabled: item.disabled }}
          disabled={item.disabled}
          onPress={item.onPress}
          testID={`composer-action-${item.id}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], paddingVertical: 11, borderBottomWidth: index < items.length - 1 ? 1 : 0, borderBottomColor: colors.neutral[200], opacity: item.disabled ? 0.55 : 1 }}
        >
          {item.icon ? <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.neutral[100], alignItems: 'center', justifyContent: 'center' }}>{item.icon}</View> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ ...mobileType.label, color: item.destructive ? colors.danger : colors.ink }}>{item.label}</Text>
            {item.description ? <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{item.description}</Text> : null}
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
  inputTestID,
  sendTestID,
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
  inputTestID?: string;
  sendTestID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const armed = Boolean(value?.toString().trim()) && !sending;
  return (
    <View style={style}>
      {chips}
      {menu}
      <View style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.neutral[200], borderRadius: 18, backgroundColor: colors.paper, boxShadow: '0 5px 15px rgba(16,18,15,0.08)' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addAccessibilityLabel}
          accessibilityHint="Touch and hold to switch between attachments and reply options"
          onPress={onAddPress}
          onLongPress={onAddLongPress}
          delayLongPress={320}
          testID={addTestID}
          style={{ width: CONTROL, height: CONTROL, borderRadius: 12, backgroundColor: addActive ? colors.lime : colors.neutral[100], alignItems: 'center', justifyContent: 'center' }}
        >
          {addIcon}
        </Pressable>
        <TextInput
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          placeholder={inputProps.placeholder || (variant === 'ask' ? 'Ask about a message, plan, or @person…' : 'Write a message…')}
          placeholderTextColor={colors.neutral[400]}
          multiline
          maxFontSizeMultiplier={1}
          textAlignVertical="center"
          testID={inputTestID}
          style={{ flex: 1, minHeight: CONTROL, maxHeight: 110, paddingHorizontal: space[1], paddingTop: 8, paddingBottom: 8, ...mobileType.body, color: colors.ink }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={variant === 'ask' ? 'Ask Claire' : 'Send message'}
          disabled={!armed}
          onPress={onSend}
          testID={sendTestID}
          style={{ width: CONTROL, height: CONTROL, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: armed ? colors.ink : colors.neutral[200] }}
        >
          {sending ? <ActivityIndicator size="small" color={colors.lime} /> : sendIcon}
        </Pressable>
      </View>
    </View>
  );
}

export function AskToolGrid({ onSelect, scoped }: { onSelect: (prompt: string) => void; scoped?: boolean }) {
  return (
    <View testID="ask-tool-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
      {ASK_TOOLS.map((tool) => {
        const Icon = toolIcons[tool.id];
        const description = scoped && tool.id === 'find' ? 'Search just this chat.' : tool.description;
        return (
          <Pressable
            key={tool.id}
            accessibilityRole="button"
            onPress={() => onSelect(tool.id === 'find' && scoped ? 'Find ' : tool.prompt)}
            testID={`claire-tool-${tool.id}`}
            style={{ width: '47.8%', minHeight: 132, justifyContent: 'space-between', padding: space[3], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[400], backgroundColor: 'rgba(255,255,255,0.5)' }}
          >
            <Icon size={22} color={colors.ink} strokeWidth={2.2} />
            <View style={{ gap: 3 }}>
              <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{tool.label}</Text>
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{description}</Text>
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
  style,
  ...inputProps
}: Omit<TextInputProps, 'style'> & {
  onSend: () => void;
  sending?: boolean;
  plusDefault?: ChatPlusDefault;
  replyOptionsVisible?: boolean;
  onToggleReplyOptions?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleMenu = () => setMenuOpen((open) => !open);
  const toggleReplyOptions = () => {
    setMenuOpen(false);
    onToggleReplyOptions?.();
  };
  const onAddPress = () => plusDefault === 'menu' ? toggleMenu() : toggleReplyOptions();
  const onAddLongPress = () => plusDefault === 'menu' ? toggleReplyOptions() : toggleMenu();
  const actions: ComposerAction[] = [
    ...(onToggleReplyOptions ? [{
      id: 'reply-options',
      label: replyOptionsVisible ? 'Hide reply options' : 'Reply options',
      description: replyOptionsVisible ? 'Put Claire’s drafts away.' : 'Claire drafts a few ways to answer.',
      icon: <Sparkles size={13} color={colors.ink} />,
      onPress: toggleReplyOptions,
    }] : []),
    { id: 'photo', label: 'Attach a photo', description: 'Coming soon.', disabled: true, icon: <Plus size={13} color={colors.neutral[600]} />, onPress: () => undefined },
    { id: 'file', label: 'Attach a file', description: 'Coming soon.', disabled: true, icon: <Plus size={13} color={colors.neutral[600]} />, onPress: () => undefined },
  ];
  const armed = Boolean(value?.toString().trim()) && !sending;
  return (
    <ComposerBar
      variant="chat"
      value={value}
      onChangeText={onChangeText}
      onSend={() => { setMenuOpen(false); onSend(); }}
      sending={sending}
      onAddPress={onAddPress}
      onAddLongPress={onAddLongPress}
      addIcon={<PlusToggle open={menuOpen} />}
      sendIcon={<SendHorizonal size={18} color={armed ? colors.lime : colors.neutral[400]} strokeWidth={2.2} />}
      addAccessibilityLabel={plusDefault === 'menu' ? 'Chat actions' : 'Reply options'}
      addTestID="chat-composer-add"
      addActive={menuOpen}
      menu={menuOpen ? <ComposerMenu items={actions} testID="chat-composer-menu" /> : null}
      inputTestID="chat-input"
      sendTestID="chat-send-button"
      style={style}
      {...inputProps}
    />
  );
}

export function AskComposer({
  value,
  onChangeText,
  onSend,
  sending,
  onTagPerson,
  onFilterPlatform,
  onFocusChat,
  onFindLoops,
  onCheckTone,
  onFindSomething,
  onClear,
  onDelete,
  chips,
  style,
  ...inputProps
}: Omit<TextInputProps, 'style'> & {
  onSend: () => void;
  sending?: boolean;
  onTagPerson?: () => void;
  onFilterPlatform?: () => void;
  onFocusChat?: () => void;
  onFindLoops?: () => void;
  onCheckTone?: () => void;
  onFindSomething?: () => void;
  onClear?: () => void;
  onDelete?: () => void;
  chips?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const close = (action?: () => void) => {
    setMenuOpen(false);
    action?.();
  };
  const actions: ComposerAction[] = [
    { id: 'tag', label: 'Tag a person', description: 'Focus Claire on someone with @.', icon: <AtSign size={13} color={colors.ink} />, onPress: () => close(onTagPerson) },
    { id: 'platform', label: 'Filter by platform', description: 'WhatsApp, Telegram, Instagram, or all.', icon: <Filter size={13} color={colors.ink} />, onPress: () => close(onFilterPlatform) },
    { id: 'focus', label: 'Focus a chat', description: 'Stay inside one conversation.', icon: <MessageCircle size={13} color={colors.ink} />, onPress: () => close(onFocusChat) },
    { id: 'loops', label: 'Find open loops', description: 'Open loops, questions, and plans.', icon: <ArrowUpRight size={13} color={colors.ink} />, onPress: () => close(onFindLoops) },
    { id: 'tone', label: 'Check the tone', description: 'Observation, then a matching line.', icon: <Smile size={13} color={colors.ink} />, onPress: () => close(onCheckTone) },
    { id: 'find', label: 'Find something', description: 'Search messages and plans.', icon: <Search size={13} color={colors.ink} />, onPress: () => close(onFindSomething) },
    { id: 'clear', label: 'Clear this conversation', description: 'Wipe turns. Keep the thread.', icon: <List size={13} color={colors.ink} />, onPress: () => close(onClear) },
    { id: 'delete', label: 'Delete thread', description: 'Remove it from Recent.', destructive: true, icon: <Trash2 size={13} color={colors.danger} />, onPress: () => close(onDelete) },
  ].filter((item) => {
    if (item.id === 'tag') return Boolean(onTagPerson);
    if (item.id === 'platform') return Boolean(onFilterPlatform);
    if (item.id === 'focus') return Boolean(onFocusChat);
    if (item.id === 'loops') return Boolean(onFindLoops);
    if (item.id === 'tone') return Boolean(onCheckTone);
    if (item.id === 'find') return Boolean(onFindSomething);
    if (item.id === 'clear') return Boolean(onClear);
    if (item.id === 'delete') return Boolean(onDelete);
    return true;
  });

  return (
    <ComposerBar
      variant="ask"
      value={value}
      onChangeText={onChangeText}
      onSend={() => { setMenuOpen(false); onSend(); }}
      sending={sending}
      onAddPress={() => setMenuOpen((open) => !open)}
      addIcon={<PlusToggle open={menuOpen} />}
      sendIcon={<SendHorizonal size={18} color={value?.toString().trim() && !sending ? colors.lime : colors.neutral[400]} strokeWidth={2.2} />}
      addAccessibilityLabel="Claire chat actions"
      addActive={menuOpen}
      chips={chips}
      menu={menuOpen ? <ComposerMenu items={actions} testID="ask-composer-menu" /> : null}
      inputTestID={inputProps.testID || 'assistant-input'}
      sendTestID="assistant-send"
      style={style}
      {...inputProps}
    />
  );
}
