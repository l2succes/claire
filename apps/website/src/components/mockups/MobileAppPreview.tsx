'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  EllipsisHorizontalIcon,
  HomeIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { colors, mobileType, radius, space } from '@claire/design-system';

type Screen = 'home' | 'inbox' | 'chat' | 'promises' | 'search';

const tabItems = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'inbox', label: 'Inbox', Icon: ChatBubbleLeftRightIcon },
  { key: 'chat', label: 'Ask Claire', Icon: SparklesIcon },
  { key: 'promises', label: 'Promises', Icon: CheckBadgeIcon },
  { key: 'search', label: 'More', Icon: EllipsisHorizontalIcon },
] as const;

const screenFor: Record<string, Screen> = {
  'daily-brief': 'home',
  'unified-inbox': 'inbox',
  chat: 'chat',
  promises: 'promises',
  'global-search': 'search',
};

const conversations = [
  { name: 'Maya Kim', message: 'Can you send that deck?', time: '2m', unread: '2' },
  { name: 'Sofia Ortega', message: 'That place looks perfect ✨', time: '3h' },
  { name: 'Noah Williams', message: 'I can make the introduction.', time: 'Yesterday' },
];

function ConversationRow({ name, message, time, unread }: (typeof conversations)[number]) {
  const initials = name.split(' ').map((part) => part[0]).join('');
  return <Pressable style={({ pressed }) => ({ minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200], opacity: pressed ? 0.7 : 1 })}>
    <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.blush }}><Text style={{ ...mobileType.label, color: colors.ink }}>{initials}</Text></View>
    <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ ...mobileType.body, color: colors.ink, fontWeight: unread ? '700' : '600' }}>{name}</Text><Text numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{message}</Text></View>
    <View style={{ alignItems: 'flex-end', gap: 5 }}><Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>{time}</Text>{unread ? <View style={{ minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.lime }}><Text style={{ ...mobileType.label, color: colors.ink }}>{unread}</Text></View> : null}</View>
  </Pressable>;
}

export function MobileAppPreview() {
  const params = useSearchParams();
  const requested = params.get('screen') || 'unified-inbox';
  const [screen, setScreen] = useState<Screen>(screenFor[requested] || 'inbox');
  const [filter, setFilter] = useState('All');
  const title = screen === 'home' ? 'Good morning,\nLuc.' : screen === 'inbox' ? 'Inbox' : screen === 'chat' ? 'Maya Kim' : screen === 'promises' ? 'Promises' : 'Search';
  return <View style={{ width: 393, height: 852, overflow: 'hidden', backgroundColor: colors.cream }}>
    <View style={{ paddingHorizontal: space[4], paddingTop: 75, paddingBottom: space[3] }}><Text style={{ ...mobileType.screenTitle, color: colors.ink }}>{title}</Text>{screen === 'chat' ? <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>WhatsApp · active now</Text> : null}</View>
    <View style={{ flex: 1, paddingHorizontal: space[4], gap: space[3] }}>
      {screen === 'home' ? <><Pressable onPress={() => setScreen('inbox')} style={{ minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.card, borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.lime }}><Text style={{ fontSize: 23 }}>↗</Text><View style={{ flex: 1 }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>NEEDS A REPLY</Text><Text style={{ ...mobileType.body, color: colors.ink, fontWeight: '700' }}>3 conversations are waiting</Text></View><Text style={{ ...mobileType.label, color: colors.ink }}>View</Text></Pressable><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>YOUR DAY</Text>{conversations.slice(0, 2).map((item) => <ConversationRow key={item.name} {...item} />)}<View style={{ padding: space[3], gap: 5, borderRadius: radius.card, backgroundColor: colors.sky }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>CLAIRE’S TAKE</Text><Text style={{ ...mobileType.body, color: colors.ink, fontWeight: '700' }}>Your morning is quiet after these.</Text></View></> : null}
      {screen === 'inbox' ? <><View style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[3], borderRadius: 13, backgroundColor: colors.neutral[100] }}><TextInput placeholder="Search conversations" placeholderTextColor={colors.neutral[400]} style={{ flex: 1, ...mobileType.body, color: colors.ink }} /></View><View style={{ flexDirection: 'row', gap: 8 }}>{['All', 'Unread', 'Needs reply'].map((item) => <Pressable key={item} onPress={() => setFilter(item)} style={{ minHeight: 32, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: filter === item ? colors.ink : colors.neutral[200], backgroundColor: filter === item ? colors.ink : colors.paper }}><Text style={{ ...mobileType.label, color: filter === item ? colors.paper : colors.neutral[800] }}>{item}</Text></Pressable>)}</View>{conversations.map((item) => <ConversationRow key={item.name} {...item} />)}</> : null}
      {screen === 'chat' ? <><View style={{ alignSelf: 'flex-start', maxWidth: '82%', padding: 12, borderRadius: 16, backgroundColor: colors.paper }}><Text style={{ ...mobileType.body, color: colors.ink }}>Are we still good for tomorrow?</Text><Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>9:12</Text></View><View style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: 12, borderRadius: 16, backgroundColor: colors.lime }}><Text style={{ ...mobileType.body, color: colors.ink }}>I’ll send the deck before 10.</Text><Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>9:14 · ✓✓</Text></View><View style={{ padding: 12, gap: 4, borderRadius: radius.control, backgroundColor: colors.infoSurface }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>PROMISE FOUND</Text><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Send the deck tomorrow before 10</Text></View></> : null}
      {screen === 'promises' ? <>{['Send updated deck', 'Confirm dinner with Dad', 'Review Noah’s introduction'].map((item, index) => <View key={item} style={{ minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.neutral[200] }}><Text style={{ fontSize: 20, color: index === 0 ? colors.warning : colors.neutral[400] }}>{index === 0 ? '!' : '○'}</Text><View style={{ flex: 1 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{item}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{index === 0 ? 'WhatsApp · due today' : 'Added from a conversation'}</Text></View><Text style={{ ...mobileType.monoLabel, color: index === 0 ? colors.warning : colors.neutral[400] }}>{index === 0 ? 'NOW' : 'FRI'}</Text></View>)}</> : null}
      {screen === 'search' ? <><View style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: 13, backgroundColor: colors.neutral[100] }}><Text style={{ ...mobileType.body, color: colors.neutral[400] }}>Search messages, people, and promises</Text></View><View style={{ padding: space[3], gap: 5, borderRadius: radius.card, backgroundColor: colors.lavender }}><Text style={{ ...mobileType.monoLabel, color: colors.ink }}>CLAIRE’S ANSWER</Text><Text style={{ ...mobileType.body, color: colors.ink }}>Maya said the deck will be ready before tomorrow morning.</Text></View>{conversations.map((item) => <ConversationRow key={item.name} {...item} />)}</> : null}
    </View>
    <View style={{ position: 'absolute', left: 18, right: 18, bottom: 10, height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderRadius: 22, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>{tabItems.map(({ key, label, Icon }) => <Pressable key={key} accessibilityLabel={label} onPress={() => setScreen(key)} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: key === 'chat' ? 1 : 0, borderColor: key === 'chat' ? colors.ink : 'transparent', backgroundColor: screen === key || key === 'chat' ? colors.lime : 'transparent' }}><Icon aria-hidden="true" width={24} height={24} strokeWidth={1.7} style={{ color: colors.ink }} /></Pressable>)}</View>
  </View>;
}
