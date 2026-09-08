import { MessageCircle, UserRound } from 'lucide-react-native';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import type { AssistantCitation } from '../../services/conversationAssistant';

type ContextToken = {
  id: string;
  kind: 'person' | 'conversation';
  label: string;
  citation: AssistantCitation;
};

function contextTokens(citations: AssistantCitation[]): ContextToken[] {
  const people = new Map<string, ContextToken>();
  const conversations = new Map<string, ContextToken>();

  for (const citation of citations) {
    const person = citation.senderName.trim();
    if (!citation.fromMe && person && person.toLowerCase() !== 'you') {
      const key = person.toLocaleLowerCase();
      if (!people.has(key)) people.set(key, { id: `person-${key}`, kind: 'person', label: person, citation });
    }

    if (!conversations.has(citation.chatId)) {
      conversations.set(citation.chatId, {
        id: `conversation-${citation.chatId}`,
        kind: 'conversation',
        label: citation.chatName || citation.senderName || 'Conversation',
        citation,
      });
    }
  }

  return [...people.values()].slice(0, 3).concat([...conversations.values()].slice(0, 3));
}

export function AssistantContextTokens({ citations }: { citations: AssistantCitation[] }) {
  const tokens = contextTokens(citations);
  if (!tokens.length) return null;

  const openToken = (token: ContextToken) => {
    if (token.kind === 'person') {
      router.push({ pathname: '/(tabs)/contacts', params: { query: token.label } });
      return;
    }

    const citation = token.citation;
    router.push({
      pathname: '/chat/[chatId]',
      params: {
        chatId: citation.chatId,
        contact_name: citation.fromMe ? citation.chatName || 'Conversation' : citation.senderName,
        chat_name: citation.chatName || citation.senderName,
        platform: citation.platform,
        is_group: citation.isGroup ? '1' : '0',
        highlightMessageId: citation.messageId,
      },
    });
  };

  return (
    <View testID="assistant-context-tokens" style={{ gap: space[2] }}>
      <Text selectable style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>EXPLORE CONTEXT</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingRight: space[4] }}>
        {tokens.map((token) => {
          const Icon = token.kind === 'person' ? UserRound : MessageCircle;
          return (
            <Pressable key={token.id} testID={`assistant-context-${token.id}`} accessibilityRole="button" accessibilityLabel={`Open ${token.kind === 'person' ? 'person' : 'conversation'} ${token.label}`} accessibilityHint={token.kind === 'person' ? 'Opens this person in People' : 'Opens this conversation at the cited message'} onPress={() => openToken(token)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: token.kind === 'person' ? colors.ink : colors.neutral[400], backgroundColor: token.kind === 'person' ? colors.lime : colors.paper }}>
                <Icon size={14} color={colors.ink} />
                <Text numberOfLines={1} style={{ ...mobileType.label, color: colors.ink, maxWidth: 150 }}>{token.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
