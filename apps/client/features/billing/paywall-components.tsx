import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Bot, Check, ListChecks, MessagesSquare, RefreshCw, Ticket, X } from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { ClaireMark } from '../../components/claire/mark';
import type { BillingPackage } from '../../services/billing-types';
import { PLAN_DETAILS, packagePrice, type BillingCadence } from './paywall-model';

const sharedBenefits = [
  { title: 'Every chat, together', detail: 'Move between connected conversations without starting over.', icon: MessagesSquare, tone: colors.sky },
  { title: 'The next step, surfaced', detail: 'Find follow-ups, plans, and open loops hiding in your chats.', icon: ListChecks, tone: colors.lime },
  { title: 'An assistant with context', detail: 'Get a quick catch-up or draft a thoughtful reply.', icon: Bot, tone: colors.lavender },
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

export function PaywallHero({ hasTrial }: { hasTrial: boolean }) {
  return (
    <View style={{ minHeight: 230, overflow: 'hidden', padding: space[5], gap: space[3], borderRadius: 28, borderCurve: 'continuous', backgroundColor: colors.ink }}>
      <View pointerEvents="none" style={{ position: 'absolute', width: 190, height: 190, right: -63, top: -83, borderRadius: 95, backgroundColor: colors.lime, opacity: 0.15 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <ClaireMark size={27} color={colors.paper} dot={colors.lime} />
        <Text style={{ ...mobileType.monoLabel, color: colors.lime }}>{hasTrial ? '3 DAYS ON US' : 'MORE WITH CLAIRE'}</Text>
      </View>
      <Text selectable style={{ ...mobileType.screenTitle, fontSize: 35, lineHeight: 38, color: colors.paper, maxWidth: 330 }}>Make every chat count.</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: space[2] }}>
        <View style={{ flex: 1, minHeight: 58, paddingHorizontal: space[3], justifyContent: 'center', borderRadius: 14, backgroundColor: colors.sky }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>ACROSS YOUR CHATS</Text>
          <Text style={{ ...mobileType.label, color: colors.ink }}>Find what matters</Text>
        </View>
        <View style={{ flex: 1, minHeight: 58, paddingHorizontal: space[3], justifyContent: 'center', borderRadius: 14, backgroundColor: colors.lime }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>WITH CLAIRE</Text>
          <Text style={{ ...mobileType.label, color: colors.ink }}>Know what’s next</Text>
        </View>
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
  const price = packagePrice(item);
  const periodLabel = item.subscriptionPeriod === 'P1Y' ? 'Yearly' : item.subscriptionPeriod === 'P3M' ? '3 months' : 'Monthly';

  return (
    <Pressable
      testID={`billing-plan-${item.identifier}`}
      accessibilityRole="radio"
      accessibilityLabel={`${periodLabel} plan, ${item.priceString} billed ${periodLabel.toLowerCase()}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 96,
        padding: space[4],
        gap: space[2],
        borderRadius: radius.card,
        borderCurve: 'continuous',
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.ink : colors.neutral[200],
        backgroundColor: colors.paper,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{periodLabel}</Text>
          <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{PLAN_DETAILS[item.plan].credits}</Text>
        </View>
        <Text selectable style={{ ...mobileType.sectionTitle, color: colors.ink }}>{item.priceString}</Text>
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
          {selected ? <Check size={15} color={colors.paper} strokeWidth={3} /> : null}
        </View>
      </View>
      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{price.billingNote}{item.trialDays ? ` after ${item.trialDays} free days` : ''}</Text>
    </Pressable>
  );
}

export function SharedBenefitsCard() {
  return (
    <View style={{ gap: space[3] }}>
      <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>WHAT CLAIRE DOES FOR YOU</Text>
      {sharedBenefits.map((benefit) => (
        <View key={benefit.title} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.neutral[200] }}>
          <View style={{ width: 48, height: 48, borderRadius: 15, borderCurve: 'continuous', backgroundColor: benefit.tone, alignItems: 'center', justifyContent: 'center' }}>
            <benefit.icon size={23} color={colors.ink} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{benefit.title}</Text>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{benefit.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function TrialTimeline({ item }: { item: BillingPackage }) {
  if (item.trialDays !== 3) return null;
  const steps = [
    { day: 'TODAY', title: 'Full Claire access', detail: 'Explore every benefit for free.' },
    { day: 'DAY 2', title: 'Keep exploring', detail: 'Your trial is still free.' },
    { day: 'DAY 3', title: 'Your plan begins', detail: `Then ${item.priceString} billed monthly, unless you cancel.` },
  ] as const;
  return (
    <View style={{ gap: space[3], padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: colors.ink }}>
      <Text style={{ ...mobileType.monoLabel, color: colors.lime }}>HOW YOUR 3-DAY TRIAL WORKS</Text>
      {steps.map((step, index) => (
        <View key={step.day} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
          <View style={{ width: 33, height: 33, borderRadius: 12, backgroundColor: index === 0 ? colors.lime : colors.neutral[800], alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...mobileType.label, color: index === 0 ? colors.ink : colors.paper }}>{index + 1}</Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ ...mobileType.monoLabel, color: colors.lime }}>{step.day}</Text>
            <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.paper }}>{step.title}</Text>
            <Text style={{ ...mobileType.bodySmall, color: colors.neutral[300] }}>{step.detail}</Text>
          </View>
        </View>
      ))}
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
        backgroundColor: disabled ? colors.neutral[200] : colors.lime,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space[4],
      }}
    >
      {purchasing ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <Text
          style={{
            ...mobileType.body,
            fontWeight: '700',
            color: disabled ? colors.neutral[400] : colors.ink,
          }}
        >
          {item?.trialDays === 3 ? 'Start free 3-day trial' : item ? 'Continue with Claire' : 'Choose a plan'}
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

export function OfferCodeButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
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
      <Ticket size={15} color={colors.neutral[600]} />
      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Redeem a code</Text>
    </Pressable>
  );
}
