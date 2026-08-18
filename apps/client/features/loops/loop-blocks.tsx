import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { AlertTriangle, Calendar, Check, Clock3, FileText, Link2, UserRound } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';

import type { LoopBlock, LoopBlockIcon } from '../../services/loop-types';

/**
 * Renders plugin-supplied blocks with Claire's own components.
 *
 * The plugin supplies data; this file owns every pixel. There is no styling
 * channel, no markup, and no nesting — a block is a typed record and nothing
 * else. Anything unrecognised is skipped rather than guessed at, matching the
 * server validator, which rejects unknown kinds outright.
 */

const ICONS: Record<LoopBlockIcon, typeof Calendar> = {
  calendar: Calendar,
  clock: Clock3,
  person: UserRound,
  link: Link2,
  check: Check,
  warning: AlertTriangle,
  document: FileText,
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        padding: space[4],
        borderRadius: radius.card,
        backgroundColor: colors.paper,
        borderWidth: 1,
        borderColor: colors.neutral[200],
        gap: space[2],
      }}
    >
      {children}
    </View>
  );
}

function BlockButton({
  label,
  testID,
  onPress,
  destructive,
}: {
  label: string;
  testID: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        minHeight: 44,
        paddingHorizontal: space[4],
        borderRadius: radius.control,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: destructive ? colors.blush : colors.ink,
        opacity: pressed ? 0.78 : 1,
      }}
    >
      <Text
        style={{
          ...mobileType.bodySmall,
          fontWeight: '700',
          color: destructive ? colors.danger : colors.paper,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface LoopBlocksProps {
  blocks: LoopBlock[];
  /** Invoked when the user taps an action. Approval is handled by the caller. */
  onAction?: (actionId: string, capabilityId: string) => void;
}

function renderBlock(block: LoopBlock, index: number, onAction?: LoopBlocksProps['onAction']) {
  switch (block.kind) {
    case 'summary':
      return (
        <Card key={index}>
          <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>
            {block.title}
          </Text>
          <Text selectable style={{ ...mobileType.bodySmall, color: colors.ink }}>
            {block.body}
          </Text>
        </Card>
      );

    case 'facts':
      return (
        <Card key={index}>
          {block.title ? (
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{block.title}</Text>
          ) : null}
          {block.items.map((item) => {
            const Icon = item.icon ? ICONS[item.icon] : null;
            return (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                {Icon ? <Icon size={14} color={colors.neutral[600]} /> : null}
                <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], minWidth: 90 }}>
                  {item.label}
                </Text>
                <Text selectable style={{ ...mobileType.bodySmall, flex: 1, color: colors.ink }}>
                  {item.value}
                </Text>
              </View>
            );
          })}
        </Card>
      );

    case 'datetime':
      return (
        <Card key={index}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{block.label}</Text>
          {/* Rendered in the user's locale, from the instant the plugin gave us. */}
          <Text style={{ ...mobileType.body, color: colors.ink }}>
            {new Date(block.start).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              ...(block.allDay ? {} : { hour: 'numeric', minute: '2-digit' }),
            })}
          </Text>
          {block.conflicts?.length ? (
            <Text style={{ ...mobileType.bodySmall, color: colors.danger }}>
              Conflicts: {block.conflicts.join(', ')}
            </Text>
          ) : null}
        </Card>
      );

    case 'choice':
      return (
        <Card key={index}>
          <Text style={{ ...mobileType.bodySmall, color: colors.ink }}>{block.prompt}</Text>
          <View style={{ gap: space[2] }}>
            {block.options.map((option) => (
              <BlockButton
                key={option.id}
                testID={`loop-block-choice-${option.id}`}
                label={option.label}
                onPress={() => onAction?.(option.id, option.capabilityId)}
              />
            ))}
          </View>
        </Card>
      );

    case 'action':
      return (
        <Card key={index}>
          {block.inputPreview.map((item) => (
            <View key={item.label} style={{ flexDirection: 'row', gap: space[2] }}>
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], minWidth: 90 }}>
                {item.label}
              </Text>
              <Text style={{ ...mobileType.bodySmall, flex: 1, color: colors.ink }}>{item.value}</Text>
            </View>
          ))}
          {/* Destination is shown as a host, never a raw URL. */}
          {block.destination ? (
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
              SENDS TO {block.destination.toUpperCase()}
            </Text>
          ) : null}
          <BlockButton
            testID={`loop-block-action-${block.actionId}`}
            label={block.requiresApproval ? `${block.label}…` : block.label}
            destructive={block.style === 'destructive'}
            onPress={() => onAction?.(block.actionId, block.capabilityId)}
          />
          {block.requiresApproval ? (
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
              YOU WILL BE ASKED TO CONFIRM
            </Text>
          ) : null}
        </Card>
      );

    case 'status':
      return (
        <Card key={index}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
            {block.state.replace(/_/g, ' ').toUpperCase()}
          </Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.ink }}>{block.label}</Text>
          {block.detail ? (
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{block.detail}</Text>
          ) : null}
        </Card>
      );

    case 'link':
      return (
        <Card key={index}>
          <BlockButton
            testID={`loop-block-link-${index}`}
            label={block.label}
            onPress={() => void Linking.openURL(block.url)}
          />
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>{block.host}</Text>
        </Card>
      );

    default:
      // Unknown kinds are skipped, matching the server validator.
      return null;
  }
}

export function LoopBlocks({ blocks, onAction }: LoopBlocksProps) {
  if (!blocks.length) return null;
  return (
    <View testID="loop-blocks" style={{ gap: space[3] }}>
      {blocks.map((block, index) => renderBlock(block, index, onAction))}
    </View>
  );
}
