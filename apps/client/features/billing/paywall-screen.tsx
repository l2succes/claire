import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, space } from '@claire/design-system';
import { useAuthStore } from '../../stores/authStore';
import {
  billingIsConfigured,
  getBillingPackages,
  initializeBilling,
  presentBillingOfferCode,
  purchaseBillingPackage,
  restoreBillingPurchases,
} from '../../services/billing';
import { refreshServerBillingSummary } from '../../services/billing-api';
import type { BillingPackage } from '../../services/billing-types';
import { userFacingErrorMessage } from '../../services/api-errors';
import { completeOnboardingPaywall } from '../onboarding/onboarding-flow';
import { paywallExitAction, paywallHeaderMode } from './paywall-navigation';
import {
  CadenceSelector,
  OfferCodeButton,
  PaywallHeader,
  PaywallHero,
  PlanOption,
  PurchaseButton,
  RestoreButton,
  SharedBenefitsCard,
  StoreUnavailable,
  TrialTimeline,
} from './paywall-components';
import {
  availableCadences,
  cadenceForPackage,
  defaultPackage,
  packageForCadence,
  packagesForCadence,
  type BillingCadence,
} from './paywall-model';

async function finish(source: string | string[] | undefined, userId?: string) {
  const sourceValue = Array.isArray(source) ? source[0] : source;
  if (sourceValue === 'onboarding' && userId) {
    await completeOnboardingPaywall(userId).catch((error) => console.warn('Could not save onboarding progress:', error));
  }
  const exitAction = paywallExitAction(source, router.canGoBack());
  if (exitAction === 'back') router.back();
  else router.replace(exitAction);
}

export function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const userId = useAuthStore((state) => state.user?.id);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [cadence, setCadence] = useState<BillingCadence>('monthly');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const sourceValue = Array.isArray(source) ? source[0] : source;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        await initializeBilling(userId);
        const available = await getBillingPackages();
        if (!active) return;
        setPackages(available);
        const initial = defaultPackage(available);
        setSelected(initial?.identifier || null);
        if (initial) setCadence(cadenceForPackage(initial));
      } catch (error) {
        if (active)
          Alert.alert(
            'Plans unavailable',
            userFacingErrorMessage(error, 'Please try again.')
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const chosen = useMemo(
    () => packages.find((item) => item.identifier === selected) || null,
    [packages, selected]
  );
  const cadences = useMemo(() => availableCadences(packages), [packages]);
  const visiblePackages = useMemo(() => packagesForCadence(packages, cadence), [packages, cadence]);

  const selectCadence = (nextCadence: BillingCadence) => {
    setCadence(nextCadence);
    setSelected(packageForCadence(packages, nextCadence, chosen?.plan)?.identifier || null);
  };

  const purchase = async () => {
    if (!chosen) return;
    setPurchasing(true);
    try {
      const result = await purchaseBillingPackage(chosen.identifier);
      if (result.activePlan === 'preview')
        throw new Error(
          'The purchase completed, but access is still syncing. Try Restore Purchases in a moment.'
        );
      await refreshServerBillingSummary().catch(() => null);
      await finish(source, userId);
    } catch (error) {
      const purchaseError = error as { userCancelled?: boolean; message?: string };
      if (!purchaseError.userCancelled)
        Alert.alert('Purchase not completed', userFacingErrorMessage(purchaseError, 'Please try again.'));
    } finally {
      setPurchasing(false);
    }
  };

  const restore = async () => {
    setPurchasing(true);
    try {
      const result = await restoreBillingPurchases();
      if (result.activePlan === 'preview')
        Alert.alert(
          'Nothing to restore',
          'No active Claire subscription was found for this store account.'
        );
      else {
        await refreshServerBillingSummary().catch(() => null);
        await finish(source, userId);
      }
    } catch (error) {
      Alert.alert('Restore failed', userFacingErrorMessage(error, 'Please try again.'));
    } finally {
      setPurchasing(false);
    }
  };

  const redeemCode = async () => {
    try {
      await presentBillingOfferCode();
    } catch (error) {
      Alert.alert('Could not open offer codes', userFacingErrorMessage(error, 'Please try again.'));
    }
  };

  return (
    <View testID="billing-paywall" style={{ flex: 1, backgroundColor: colors.cream }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.cream }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          alignItems: 'center',
          paddingTop: space[3],
          paddingHorizontal: space[4],
          paddingBottom: Math.max(insets.bottom + 190, 222),
        }}
      >
        <View style={{ width: '100%', maxWidth: 520, gap: space[5] }}>
          <PaywallHeader mode={paywallHeaderMode(source)} onClose={() => void finish(source, userId)} />
          <PaywallHero hasTrial={chosen?.trialDays === 3} />
          <SharedBenefitsCard />

          {chosen?.trialDays === 3 ? <TrialTimeline item={chosen} /> : null}

          <View accessibilityRole="radiogroup" style={{ gap: space[3] }}>
            <View style={{ gap: space[2] }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingHorizontal: 2,
                }}
              >
                <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>CHOOSE YOUR PLAN</Text>
                <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>CANCEL ANYTIME</Text>
              </View>
              <CadenceSelector cadences={cadences} selected={cadence} onSelect={selectCadence} />
            </View>

            {loading ? (
              <View
                style={{
                  minHeight: 120,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space[2],
                }}
              >
                <ActivityIndicator color={colors.ink} />
                <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>
                  Loading plans…
                </Text>
              </View>
            ) : !userId ? (
              <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>Sign in to see plans available in your store.</Text>
            ) : visiblePackages.length ? (
              visiblePackages.map((item) => (
                <PlanOption
                  key={item.identifier}
                  item={item}
                  selected={item.identifier === selected}
                  onPress={() => setSelected(item.identifier)}
                />
              ))
            ) : (
              <StoreUnavailable configured={billingIsConfigured()} />
            )}
          </View>

          <Text
            selectable
            style={{
              ...mobileType.label,
              fontWeight: '400',
              color: colors.neutral[600],
              textAlign: 'center',
            }}
          >
            {chosen?.trialDays === 3
              ? `Free for 3 days, then ${chosen.priceString} billed monthly until canceled. Cancel before the trial ends to avoid a charge.`
              : chosen
                ? `${chosen.priceString} billed monthly until canceled. Payment is charged to your store account.`
                : 'Payment is charged to your store account. Subscriptions renew automatically unless canceled.'}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[5] }}>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://useclaire.co/legal/terms').catch(() => undefined)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textDecorationLine: 'underline' }}>Terms</Text></Pressable>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL('https://useclaire.co/legal/privacy').catch(() => undefined)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textDecorationLine: 'underline' }}>Privacy</Text></Pressable>
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          paddingHorizontal: space[4],
          paddingTop: space[3],
          paddingBottom: Math.max(insets.bottom, space[4]),
          borderTopWidth: 1,
          borderTopColor: colors.neutral[200],
          backgroundColor: colors.cream,
        }}
      >
        <View style={{ width: '100%', maxWidth: 520, gap: 2 }}>
          {chosen ? <Text selectable style={{ ...mobileType.body, fontWeight: '700', color: colors.ink, textAlign: 'center', paddingBottom: space[2] }}>{chosen.trialDays === 3 ? `3 days free · then ${chosen.priceString} / month` : `Monthly plan · ${chosen.priceString} / month`}</Text> : null}
          {sourceValue === 'onboarding' && !chosen ? (
            <Pressable testID="billing-onboarding-continue" accessibilityRole="button" onPress={() => void finish(source, userId)} style={{ minHeight: 56, borderRadius: 16, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>Continue to Claire</Text></Pressable>
          ) : <PurchaseButton item={chosen} purchasing={purchasing} onPress={() => void purchase()} />}
          {sourceValue === 'onboarding' && chosen ? (
            <Pressable testID="billing-onboarding-preview" accessibilityRole="button" onPress={() => void finish(source, userId)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>Use 50 free credits first</Text>
            </Pressable>
          ) : null}
          {chosen ? <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'center', paddingTop: space[2] }}>Auto-renews unless canceled. Cancel anytime.</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <RestoreButton
              disabled={purchasing || !billingIsConfigured()}
              onPress={() => void restore()}
            />
            <View style={{ width: 1, height: 18, backgroundColor: colors.neutral[200] }} />
            <OfferCodeButton
              disabled={purchasing || !billingIsConfigured()}
              onPress={() => void redeemCode()}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
