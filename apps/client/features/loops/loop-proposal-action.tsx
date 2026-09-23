import { Pressable, Text, View } from 'react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { useLoopProposal } from '../../hooks/useLoopProposal';
import type { LoopDetail, LoopProposal } from '../../services/loop-types';
import { userFacingErrorMessage } from '../../services/api-errors';

export function LoopProposalAction({ loop, proposal }: { loop: LoopDetail; proposal: LoopProposal }) {
  const { mutation, patch, applied } = useLoopProposal(loop, proposal.changes ?? {});
  if (!Object.keys(patch).length) return null;
  return <View style={{ gap: space[2] }}>
    {Object.entries(patch).map(([key, value]) => <Text key={key} style={{ ...mobileType.bodySmall, color: colors.ink }}>
      {key}: {value === null ? 'No date' : String(value)}
    </Text>)}
    <Pressable testID="loop-proposal-apply" accessibilityRole="button"
      disabled={mutation.isPending || loop.row_version === undefined}
      onPress={() => mutation.mutate(applied)}
      style={{ padding: space[3], borderRadius: radius.control, backgroundColor: colors.ink, opacity: mutation.isPending ? 0.5 : 1 }}>
      <Text style={{ ...mobileType.bodySmall, color: colors.paper }}>{applied ? 'Undo change' : 'Apply change'}</Text>
    </Pressable>
    {mutation.error ? <Text style={{ ...mobileType.bodySmall, color: colors.danger }}>{userFacingErrorMessage(mutation.error)}</Text> : null}
  </View>;
}
