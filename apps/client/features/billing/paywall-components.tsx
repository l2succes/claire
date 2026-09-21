import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Check, RefreshCw, X } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { ClaireMark } from '../../components/claire/mark';
import type { BillingPackage } from '../../services/billing-types';
import { PLAN_DETAILS, packagePrice, type BillingCadence } from './paywall-model';

const sharedBenefits = [
  'One inbox across every connected network',
  'Ask Claire, smart drafts, and summaries',
  'A hard credit cap — never a surprise overage',
] as const;

export function PaywallHeader({ onClose }: { onClose: () => void }) {
  return (
    <View
      style={{
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View
          accessibilityElementsHidden
          style={{
            width: 42,
            height: 42,
            borderRadius: 13,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: colors.ink,
            backgroundColor: colors.lime,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ClaireMark size={25} color={colors.ink} dot={colors.paper} />
        </View>
        <View>
          <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>CLAIRE</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
            Plans & AI credits
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close plans"
        hitSlop={8}
        onPress={onClose}
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.neutral[200],
          backgroundColor: colors.paper,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={19} color={colors.ink} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

export function PreviewStatusCard({
  credits,
  isOnboarding,
}: {
  credits: number;
  isOnboarding: boolean;
}) {
  const hasCredits = credits > 0;
  const label = hasCredits ? 'YOUR PREVIEW' : 'PREVIEW COMPLETE';
  const title = hasCredits
    ? `${credits} free AI credit${credits === 1 ? '' : 's'} are ready.`
    : 'Your messages stay right where they are.';
  const detail = hasCredits
    ? isOnboarding
      ? 'Try Claire with your real inbox. No card required.'
      : 'Use them before choosing a paid plan.'
    : 'Choose a plan to turn AI replies, summaries, and Loop runs back on.';

  return (
    <View
      style={{
        minHeight: 108,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        padding: space[4],
        borderRadius: radius.card,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.ink,
        backgroundColor: hasCredits ? colors.sky : colors.lavender,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.control,
          borderCurve: 'continuous',
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ClaireMark size={19} color={colors.paper} dot={colors.lime} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>{label}</Text>
        <Text selectable style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>
          {title}
        </Text>
        <Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

export function CadenceSelector({
  cadences,
  selected,
  onSelect,
}: {
  cadences: BillingCadence[];
  selected: BillingCadence;
  onSelect: (cadence: BillingCadence) => void;
}) {
  if (cadences.length < 2) return null;

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        gap: 3,
        padding: 3,
        borderRadius: radius.control,
        borderCurve: 'continuous',
        backgroundColor: colors.neutral[100],
      }}
    >
      {cadences.map((cadence) => {
        const active = cadence === selected;
        return (
          <Pressable
            key={cadence}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(cadence)}
            style={{
              minHeight: 42,
              flex: 1,
              borderRadius: 10,
              borderCurve: 'continuous',
              backgroundColor: active ? colors.paper : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: colors.neutral[200],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                ...mobileType.monoLabel,
                color: active ? colors.ink : colors.neutral[600],
              }}
            >
              {cadence === 'annual' ? 'YEARLY' : 'MONTHLY'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PlanOption({
  item,
  selected,
  onPress,
}: {
  item: BillingPackage;
  selected: boolean;
  onPress: () => void;
}) {
  const details = PLAN_DETAILS[item.plan];
  const price = packagePrice(item);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${details.name}, ${price.amount} ${price.cadence}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 196,
        padding: space[4],
        gap: space[3],
        borderRadius: radius.card,
        borderCurve: 'continuous',
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.ink : colors.neutral[200],
        backgroundColor: selected ? colors.lime : colors.paper,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
            {details.eyebrow}
          </Text>
          <Text selectable style={{ ...mobileType.sectionTitle, color: colors.ink }}>
            {details.name}
          </Text>
          <Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
            {details.description}
          </Text>
        </View>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: selected ? colors.ink : colors.neutral[300],
            backgroundColor: selected ? colors.ink : colors.paper,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? <Check size={15} color={colors.lime} strokeWidth={3} /> : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
        <Text selectable style={{ ...mobileType.screenTitle, color: colors.ink }}>
          {price.amount}
        </Text>
        <Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
          {price.cadence}
        </Text>
        <Text
          selectable
          style={{ marginLeft: 'auto', ...mobileType.monoLabel, color: colors.neutral[600] }}
        >
          {price.billingNote.toUpperCase()}
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={{ ...mobileType.label, color: colors.ink }}>{details.credits}</Text>
        {details.features.map((feature) => (
          <View key={feature} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Check size={14} color={colors.ink} strokeWidth={2.5} />
            <Text selectable style={{ flex: 1, ...mobileType.bodySmall, color: colors.ink }}>
              {feature}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

export function SharedBenefitsCard() {
  return (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
        <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>EVERY PAID PLAN</Text>
        <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>INCLUDED</Text>
      </View>
      <View
        style={{
          borderRadius: radius.card,
          borderCurve: 'continuous',
          borderWidth: 1,
          borderColor: colors.neutral[200],
          backgroundColor: colors.paper,
          overflow: 'hidden',
        }}
      >
        {sharedBenefits.map((benefit, index) => (
          <View
            key={benefit}
            style={{
              minHeight: 52,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              paddingHorizontal: space[3],
              borderBottomWidth: index === sharedBenefits.length - 1 ? 0 : 1,
              borderBottomColor: colors.neutral[200],
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                borderCurve: 'continuous',
                backgroundColor: index === 1 ? colors.sky : colors.mint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={15} color={colors.ink} strokeWidth={2.5} />
            </View>
            <Text selectable style={{ flex: 1, ...mobileType.bodySmall, color: colors.ink }}>
              {benefit}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function StoreUnavailable({ configured }: { configured: boolean }) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: space[4],
        gap: 4,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.neutral[200],
        backgroundColor: colors.paper,
      }}
    >
      <Text style={{ ...mobileType.label, color: colors.ink }}>Plans aren’t available yet.</Text>
      <Text selectable style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
        {configured
          ? 'The store returned no plans. Check the current RevenueCat offering.'
          : 'Purchases are disabled in this build until a RevenueCat public SDK key is added.'}
      </Text>
    </View>
  );
}

export function PurchaseButton({
  item,
  purchasing,
  onPress,
}: {
  item: BillingPackage | null;
  purchasing: boolean;
  onPress: () => void;
}) {
  const disabled = !item || purchasing;
  const details = item ? PLAN_DETAILS[item.plan] : null;
  return (
    <Pressable
      testID="billing-purchase"
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: purchasing }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 56,
        borderRadius: 16,
        borderCurve: 'continuous',
        backgroundColor: disabled ? colors.neutral[200] : colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space[4],
      }}
    >
      {purchasing ? (
        <ActivityIndicator color={colors.paper} />
      ) : (
        <Text
          style={{
            ...mobileType.body,
            fontWeight: '700',
            color: disabled ? colors.neutral[400] : colors.paper,
          }}
        >
          {item && details
            ? `Continue with ${details.name} · ${item.priceString}`
            : 'Choose a plan'}
        </Text>
      )}
    </Pressable>
  );
}

export function RestoreButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        flex: 1,
        flexDirection: 'row',
        gap: 7,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <RefreshCw size={15} color={colors.neutral[600]} />
      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Restore purchases</Text>
    </Pressable>
  );
}
