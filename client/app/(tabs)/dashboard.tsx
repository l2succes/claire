import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { UrgentCard, UrgentOverflowItem } from '../../components/UrgentCard';
import type { UrgentMessage } from '../../components/UrgentCard';
import { HomeSection } from '../../components/HomeSection';
import { MorningBrief } from '../../components/MorningBrief';
import { NudgeCard } from '../../components/NudgeCard';
import { PlatformBadge } from '../../components/PlatformIcon';
import { Platform } from '../../types/platform';
import type { ChatCategory } from '../../types/conversationSettings';
import { formatWaitTime } from '../../utils/urgency';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatchUpGroup {
  id: string;
  chat_id: string;
  chat_name: string;
  unread_count: number;
  platform?: Platform;
  last_active: string;
  summary: string;
}

interface Nudge {
  id: string;
  chat_id: string;
  contact_name: string;
  category: ChatCategory;
  message: string;
}

// ---------------------------------------------------------------------------
// Dummy data (Phase 1 — replace with real data in Phase 2)
// ---------------------------------------------------------------------------

const DUMMY_MORNING_BRIEF =
  '3 conversations are waiting for your reply. Sarah has been waiting 2.5 hours about the proposal. Mom texted last night. The Vegas trip group is planning April dates.';

const DUMMY_URGENT: UrgentMessage[] = [
  {
    id: 'u1',
    chat_id: 'chat-sarah',
    contact_name: 'Sarah Chen',
    content: 'Can we reschedule our call to tomorrow? Also need your input on the proposal ASAP',
    timestamp: new Date(Date.now() - 2.5 * 3_600_000).toISOString(),
    from_me: false,
    is_group: false,
    platform: Platform.WHATSAPP,
    urgency_score: 78,
    quick_replies: [
      { text: 'Sure, what time works for you?', tone: 'warm' },
      { text: "I'll review the proposal tonight", tone: 'professional' },
      { text: 'Can we do 2pm tomorrow?', tone: 'casual' },
    ],
  },
  {
    id: 'u2',
    chat_id: 'chat-mom',
    contact_name: 'Mom',
    content: 'Just checking in! How are you doing?',
    timestamp: new Date(Date.now() - 18 * 3_600_000).toISOString(),
    from_me: false,
    is_group: false,
    platform: Platform.WHATSAPP,
    urgency_score: 48,
    quick_replies: [
      { text: 'Hey! Doing well, talk soon', tone: 'warm' },
      { text: "All good! I'll call you this weekend", tone: 'casual' },
    ],
  },
  {
    id: 'u3',
    chat_id: 'chat-vegas',
    chat_name: 'Vegas Trip',
    content: 'Jordan: Everyone still good for April 18-21?',
    timestamp: new Date(Date.now() - 45 * 60_000).toISOString(),
    from_me: false,
    is_group: true,
    platform: Platform.WHATSAPP,
    urgency_score: 55,
    quick_replies: [
      { text: "I'm in!", tone: 'casual' },
      { text: 'Can confirm those dates work', tone: 'brief' },
    ],
  },
];

const DUMMY_CATCHUP: CatchUpGroup[] = [
  {
    id: 'g1',
    chat_id: 'chat-design',
    chat_name: 'Design Team',
    unread_count: 24,
    platform: Platform.TELEGRAM,
    last_active: new Date(Date.now() - 20 * 60_000).toISOString(),
    summary: 'Discussing the new onboarding flow. Lena shared mockups and feedback was requested.',
  },
  {
    id: 'g2',
    chat_id: 'chat-nyc',
    chat_name: 'NYC Friends',
    unread_count: 11,
    platform: Platform.WHATSAPP,
    last_active: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    summary: 'Planning dinner for Friday. Still deciding on a spot.',
  },
];

const DUMMY_NUDGES: Nudge[] = [
  {
    id: 'n1',
    chat_id: 'chat-emma',
    contact_name: 'Emma',
    category: 'romantic',
    message: "Haven't texted in 3 days — say good morning?",
  },
  {
    id: 'n2',
    chat_id: 'chat-alex',
    contact_name: 'Alex Rivera',
    category: 'business',
    message: 'You offered to send a proposal 4 days ago. Follow up?',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CatchUpCard({ group, onPress }: { group: CatchUpGroup; onPress: () => void }) {
  const minsAgo = Math.floor((Date.now() - new Date(group.last_active).getTime()) / 60_000);
  const timeLabel = minsAgo < 60 ? `${minsAgo}m ago` : `${Math.floor(minsAgo / 60)}h ago`;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      className="mx-4 mb-2 bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700"
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-row items-center flex-1 mr-3">
          <View className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 items-center justify-center mr-2.5">
            <Text className="text-sm font-bold text-gray-600 dark:text-gray-300">
              {group.chat_name[0].toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-gray-900 dark:text-white text-sm" numberOfLines={1}>
              {group.chat_name}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              {group.platform && <PlatformBadge platform={group.platform} size={11} />}
              <Text className="text-xs text-gray-400 dark:text-gray-500">{timeLabel}</Text>
            </View>
          </View>
        </View>
        <View className="bg-indigo-100 dark:bg-indigo-900 rounded-full px-2 py-0.5">
          <Text className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            {group.unread_count} new
          </Text>
        </View>
      </View>
      <Text className="text-sm text-gray-500 dark:text-gray-400 leading-4" numberOfLines={2}>
        {group.summary}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());

  const navigateToChat = (
    msg: { chat_id: string; contact_name?: string; chat_name?: string; platform?: Platform; is_group: boolean },
    prefillText?: string
  ) => {
    router.push({
      pathname: '/chat/[chatId]',
      params: {
        chatId: msg.chat_id,
        contact_name: msg.contact_name || '',
        chat_name: msg.chat_name || '',
        platform: msg.platform || '',
        is_group: msg.is_group ? '1' : '0',
        ...(prefillText ? { prefill: prefillText } : {}),
      },
    });
  };

  const visibleNudges = DUMMY_NUDGES.filter((n) => !dismissedNudges.has(n.id));

  return (
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-900"
      contentContainerStyle={{ paddingTop: 12, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Morning Brief */}
      <MorningBrief text={DUMMY_MORNING_BRIEF} />

      {/* Needs Your Reply */}
      <HomeSection
        title="Needs Your Reply"
        subtitle={`${DUMMY_URGENT.length} conversations waiting`}
      >
        <UrgentCard
          message={DUMMY_URGENT[0]}
          onPress={() => navigateToChat(DUMMY_URGENT[0])}
          onQuickReply={(text, chatId) => {
            const msg = DUMMY_URGENT.find((u) => u.chat_id === chatId);
            if (msg) navigateToChat(msg, text);
          }}
        />
        {DUMMY_URGENT.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingTop: 12 }}
          >
            {DUMMY_URGENT.slice(1).map((msg) => (
              <UrgentOverflowItem
                key={msg.id}
                message={msg}
                onPress={() => navigateToChat(msg)}
              />
            ))}
          </ScrollView>
        )}
      </HomeSection>

      {/* Catch Up */}
      <HomeSection title="Catch Up" subtitle="Groups with new activity">
        {DUMMY_CATCHUP.map((group) => (
          <CatchUpCard
            key={group.id}
            group={group}
            onPress={() =>
              router.push({
                pathname: '/chat/[chatId]',
                params: {
                  chatId: group.chat_id,
                  chat_name: group.chat_name,
                  platform: group.platform || '',
                  is_group: '1',
                },
              })
            }
          />
        ))}
      </HomeSection>

      {/* Follow-up Nudges */}
      {visibleNudges.length > 0 && (
        <HomeSection title="Follow-up Nudges">
          {visibleNudges.map((nudge) => (
            <NudgeCard
              key={nudge.id}
              contactName={nudge.contact_name}
              message={nudge.message}
              category={nudge.category}
              onPress={() =>
                router.push({
                  pathname: '/chat/[chatId]',
                  params: { chatId: nudge.chat_id, contact_name: nudge.contact_name },
                })
              }
              onDismiss={() => setDismissedNudges((prev) => new Set([...prev, nudge.id]))}
            />
          ))}
        </HomeSection>
      )}
    </ScrollView>
  );
}
