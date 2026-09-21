import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, space } from '@claire/design-system';
import { useAuthStore } from '../../stores/authStore';
import {
  billingIsConfigured,
  getBillingPackages,
  initializeBilling,
  purchaseBillingPackage,
  restoreBillingPurchases,
} from '../../services/billing';
import { getServerBillingSummary, refreshServerBillingSummary } from '../../services/billing-api';
import type { BillingPackage, ServerBillingSummary } from '../../services/billing-types';
import { userFacingErrorMessage } from '../../services/api-errors';
import {
  CadenceSelector,
  PaywallHeader,
  PlanOption,
  PreviewStatusCard,
  PurchaseButton,
  RestoreButton,
  SharedBenefitsCard,
  StoreUnavailable,
} from './paywall-components';
import {
  availableCadences,
  cadenceForPackage,
  defaultPackage,
  packageForCadence,
  packagesForCadence,
  type BillingCadence,
} from './paywall-model';

function finish(source: string | string[] | undefined) {
  const sourceValue = Array.isArray(source) ? source[0] : source;
  if (sourceValue === 'settings' && router.canGoBack()) router.back();
  else router.replace('/(tabs)/dashboard');
}

export function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const userId = useAuthStore((state) => state.user?.id);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [summary, setSummary] = useState<ServerBillingSummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cadence, setCadence] = useState<BillingCadence>('annual');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      try {
        await initializeBilling(userId);
        const [available, serverSummary] = await Promise.all([
          getBillingPackages(),
          getServerBillingSummary().catch(() => null),
        ]);
        if (!active) return;
        setPackages(available);
        setSummary(serverSummary);
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
  const previewCredits = summary?.credits.available ?? 50;
  const sourceValue = Array.isArray(source) ? source[0] : source;

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
      finish(source);
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
        finish(source);
      }
    } catch (error) {
      Alert.alert('Restore failed', userFacingErrorMessage(error, 'Please try again.'));
    } finally {
      setPurchasing(false);
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
          paddingBottom: Math.max(insets.bottom + 132, 164),
        }}
      >
        <View style={{ width: '100%', maxWidth: 520, gap: space[6] }}>
          <PaywallHeader onClose={() => finish(source)} />

          <View style={{ gap: space[3] }}>
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
              ONE CALM PLACE FOR EVERY CONVERSATION
            </Text>
            <Text selectable style={{ ...mobileType.display, color: colors.ink, maxWidth: 430 }}>
              Stay present without starting from zero.
            </Text>
            <Text
              selectable
              style={{ ...mobileType.body, color: colors.neutral[600], maxWidth: 450 }}
            >
              Claire catches you up, finds what is still open, and helps write the next reply across
              every connected conversation.
            </Text>
          </View>

          <PreviewStatusCard credits={previewCredits} isOnboarding={sourceValue === 'onboarding'} />

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
                {visiblePackages.length ? (
                  <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>
                    {visiblePackages.length} OPTION{visiblePackages.length === 1 ? '' : 'S'}
                  </Text>
                ) : null}
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

          <SharedBenefitsCard />

          <Text
            selectable
            style={{
              ...mobileType.label,
              fontWeight: '400',
              color: colors.neutral[600],
              textAlign: 'center',
            }}
          >
            Payment is charged to your store account. Your subscription renews automatically unless
            canceled before the renewal date.
          </Text>
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
          <PurchaseButton item={chosen} purchasing={purchasing} onPress={() => void purchase()} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {sourceValue === 'onboarding' && previewCredits > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => finish(source)}
                style={{ minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>
                  Use {previewCredits} free credits first
                </Text>
              </Pressable>
            ) : null}
            {sourceValue === 'onboarding' && previewCredits > 0 ? (
              <View style={{ width: 1, height: 18, backgroundColor: colors.neutral[200] }} />
            ) : null}
            <RestoreButton
              disabled={purchasing || !billingIsConfigured()}
              onPress={() => void restore()}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
