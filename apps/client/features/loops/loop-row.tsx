import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { AlertCircle, Check, Clock3, UsersRound, UserRound } from 'lucide-react-native';
import { colors, mobileType } from '@claire/design-system';
import type { LoopItem } from '../../services/loop-types';

const LIVE_STATUSES: LoopItem['status'][] = ['open', 'waiting', 'snoozed'];

function isOverdue(item: LoopItem) {
  const due = item.snoozed_until || item.deadline;
  return !!due && new Date(due) < new Date() && LIVE_STATUSES.includes(item.status);
}

function conversationName(item: LoopItem) {
  return item.chat?.name || item.contact?.name || item.contact?.inferred_name || item.chat?.contact?.name || item.chat?.contact?.inferred_name || item.contact_name || 'Personal reminder';
}

function loopTitle(item: LoopItem) {
  return item.title?.trim() || item.content.trim() || 'Untitled loop';
}

function loopDetail(item: LoopItem, title: string) {
  const detail = item.state_summary?.trim();
  return detail && detail !== title ? detail : null;
}

function ownerLabel(item: LoopItem) {
  if (item.owner === 'me') return 'YOU OWE THIS';
  if (item.owner === 'them') return item.requester === 'me' ? 'WAITING ON THEM' : 'THEY OWE THIS';
  if (item.thread_state === 'pending_confirmation') return 'PENDING';
  return null;
}

function dueLabel(item: LoopItem, overdue: boolean) {
  if (!item.deadline) return null;
  const date = new Date(item.deadline);
  const day = new Date();
  const dateText = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (overdue) return { kicker: 'OVERDUE', date: dateText, urgent: true };
  if (date.toDateString() === day.toDateString()) return { kicker: 'TODAY', date: dateText, urgent: false };
  return { kicker: null, date: dateText, urgent: false };
}

export function LoopRow({ item, onOpen, onToggle }: { item: LoopItem; onOpen: () => void; onToggle: () => void }) {
  const [pressed, setPressed] = useState(false);
  const name = conversationName(item);
  const title = loopTitle(item);
  const detail = loopDetail(item, title);
  const avatar = item.contact?.avatar_url || item.chat?.contact?.avatar_url;
  const group = !!item.chat?.is_group;
  const overdue = isOverdue(item);
  const due = dueLabel(item, overdue);
  const ownership = ownerLabel(item);
  const needsAttention = (item.priority_score ?? 0) >= 80;

  return (
    <Pressable
      testID={`loop-item-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${ownership ?? 'Open loop'}${due ? `, ${due.kicker ?? due.date}` : ''}`}
      onPress={onOpen}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ flexDirection: 'row', gap: 11, minHeight: 104, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: colors.neutral[200], opacity: pressed ? 0.66 : 1 }}
    >
      <Pressable
        testID={`loop-toggle-${item.id}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.status === 'done' }}
        accessibilityLabel={`${item.status === 'done' ? 'Reopen' : 'Complete'} ${title}`}
        onPress={onToggle}
        style={{ width: 28, height: 28, marginTop: 1, borderRadius: 14, borderWidth: 1.5, borderColor: overdue ? colors.danger : colors.ink, backgroundColor: item.status === 'done' ? colors.lime : overdue ? colors.blush : colors.paper, alignItems: 'center', justifyContent: 'center' }}
      >
        {item.status === 'done' ? <Check size={16} color={colors.ink} /> : overdue ? <AlertCircle size={15} color={colors.danger} /> : null}
      </Pressable>

      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Text selectable numberOfLines={1} style={{ ...mobileType.body, fontWeight: '700', color: colors.ink, textDecorationLine: item.status === 'done' ? 'line-through' : 'none' }}>{title}</Text>
        {detail ? <Text selectable numberOfLines={1} style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{detail}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 }}>
          <View testID={`loop-contact-avatar-${item.id}`} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: group ? colors.sky : colors.blush, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {avatar ? <Image source={{ uri: avatar }} style={{ width: 24, height: 24 }} contentFit="cover" /> : group ? <UsersRound size={13} color={colors.neutral[600]} /> : <UserRound size={13} color={colors.neutral[600]} />}
          </View>
          <Text testID={`loop-contact-name-${item.id}`} selectable numberOfLines={1} style={{ ...mobileType.bodySmall, flexShrink: 1, color: colors.neutral[600] }}>{name}</Text>
          {ownership ? <Text numberOfLines={1} style={{ ...mobileType.monoLabel, color: item.owner === 'me' ? colors.ink : colors.neutral[600] }}>{ownership}</Text> : null}
        </View>
      </View>

      <View style={{ width: 54, alignItems: 'flex-end', gap: 4, paddingTop: 1 }}>
        {needsAttention ? <Text style={{ ...mobileType.monoLabel, color: colors.danger }}>ACT NOW</Text> : null}
        {due ? <><Clock3 size={15} color={due.urgent ? colors.danger : colors.neutral[400]} /><Text style={{ ...mobileType.monoLabel, color: due.urgent ? colors.danger : colors.neutral[600], textAlign: 'right' }}>{due.kicker ? `${due.kicker}\n${due.date}` : due.date}</Text></> : null}
      </View>
    </Pressable>
  );
}
