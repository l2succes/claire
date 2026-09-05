import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';

import { askLoopAgent, type LoopAgentResult } from '../../services/loops';

/**
 * "Ask Claire to help close this."
 *
 * Everything Claire returns here is inert. A draft is text the user copies; a
 * proposed change is shown for confirmation. The panel deliberately renders a
 * draft as quotable text rather than a Send button, because the agent has no
 * ability to send and the UI must not imply otherwise.
 */

const QUICK_ASKS = [
  { label: 'Draft a nudge', question: 'Draft a short, friendly nudge about this.' },
  { label: 'Is this done?', question: 'Based on the conversation, is this already done?' },
  { label: 'Suggest a time', question: 'Suggest a specific time to propose for this.' },
];

function QuickChip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      testID={`loop-agent-quick-${label.toLowerCase().replace(/\s+/g, '-')}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        paddingHorizontal: space[3],
        paddingVertical: space[2],
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.neutral[200],
        backgroundColor: colors.paper,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      }}
    >
      <Text style={{ ...mobileType.bodySmall, color: colors.ink }}>{label}</Text>
    </Pressable>
  );
}

function AgentAnswer({ result }: { result: LoopAgentResult }) {
  return (
    <View style={{ gap: space[3] }} testID="loop-agent-answer">
      <Text selectable style={{ ...mobileType.bodySmall, color: colors.ink }}>
        {result.answer}
      </Text>

      {result.proposal?.kind === 'draft_reply' && result.proposal.text ? (
        <View style={{ gap: space[2] }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
            DRAFT — NOT SENT
          </Text>
          <View
            testID="loop-agent-draft"
            style={{
              padding: space[3],
              borderRadius: radius.card,
              backgroundColor: colors.cream,
              borderWidth: 1,
              borderColor: colors.neutral[200],
            }}
          >
            <Text selectable style={{ ...mobileType.bodySmall, color: colors.ink }}>
              {result.proposal.text}
            </Text>
          </View>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>
            Copy this into the conversation when you are ready.
          </Text>
        </View>
      ) : null}

      {result.proposal?.kind === 'loop_update' ? (
        <View testID="loop-agent-proposal" style={{ gap: space[2] }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
            SUGGESTED CHANGE — NOT APPLIED
          </Text>
          <Text selectable style={{ ...mobileType.bodySmall, color: colors.ink }}>
            {result.proposal.rationale}
          </Text>
        </View>
      ) : null}

      {result.toolsUsed.length ? (
        <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>
          Looked at: {result.toolsUsed.join(', ').replace(/_/g, ' ')}
        </Text>
      ) : null}
    </View>
  );
}

export function LoopAgentPanel({ loopId }: { loopId: string }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<LoopAgentResult | null>(null);

  const ask = useMutation({
    mutationFn: (asked: string) => askLoopAgent(loopId, asked),
    onSuccess: (data) => {
      setResult(data);
      setQuestion('');
    },
  });

  const busy = ask.isPending;

  return (
    <View testID="loop-agent-panel" style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Sparkles size={16} color={colors.ink} />
        <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
          ASK CLAIRE TO HELP CLOSE THIS
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {QUICK_ASKS.map((item) => (
          <QuickChip
            key={item.label}
            label={item.label}
            disabled={busy}
            onPress={() => ask.mutate(item.question)}
          />
        ))}
      </View>

      <TextInput
        testID="loop-agent-input"
        value={question}
        onChangeText={setQuestion}
        editable={!busy}
        placeholder="Ask about this loop…"
        placeholderTextColor={colors.neutral[400]}
        onSubmitEditing={() => question.trim() && ask.mutate(question.trim())}
        style={{
          minHeight: 44,
          paddingHorizontal: space[3],
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: colors.neutral[200],
          backgroundColor: colors.paper,
          ...mobileType.bodySmall,
          color: colors.ink,
        }}
      />

      {busy ? <ActivityIndicator testID="loop-agent-busy" color={colors.ink} /> : null}

      {ask.error ? (
        <Text selectable style={{ ...mobileType.bodySmall, color: colors.danger }}>
          {ask.error instanceof Error ? ask.error.message : 'Claire could not answer.'}
        </Text>
      ) : null}

      {result && !busy ? <AgentAnswer result={result} /> : null}
    </View>
  );
}
