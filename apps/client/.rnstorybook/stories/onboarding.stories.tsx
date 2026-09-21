import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, space } from '@claire/design-system';
import { WelcomeScreenView } from '../../features/auth/welcome-screen';
import { EmailSignInView } from '../../features/auth/email-signin-screen';
import { EmailVerificationView } from '../../features/auth/email-verification-screen';
import {
  OnboardingConnectionsView,
  type OnboardingConnectionStates,
} from '../../features/connections/onboarding-connections-screen';
import {
  ConnectionFlowPreview,
  type ConnectionFlowPreviewState,
} from '../../features/connections/connection-flow-screen';
import { Platform } from '../../types/platform';
import type { BillingPackage } from '../../services/billing-types';
import {
  CadenceSelector,
  PaywallHeader,
  PlanOption,
  PreviewStatusCard,
  PurchaseButton,
  RestoreButton,
  SharedBenefitsCard,
} from '../../features/billing/paywall-components';
import type { BillingCadence } from '../../features/billing/paywall-model';

type ReviewStep =
  | 'welcome'
  | 'email'
  | 'verify'
  | 'accounts'
  | 'whatsapp-phone'
  | 'whatsapp-code'
  | 'whatsapp-success'
  | 'plans';

const reviewPackages: BillingPackage[] = [
  { identifier: 'plus-monthly', productIdentifier: 'claire.plus.monthly', title: 'Claire Plus', description: '', priceString: '$12.99', pricePerMonthString: null, subscriptionPeriod: 'P1M', plan: 'plus' },
  { identifier: 'pro-monthly', productIdentifier: 'claire.pro.monthly', title: 'Claire Pro', description: '', priceString: '$24.99', pricePerMonthString: null, subscriptionPeriod: 'P1M', plan: 'pro' },
  { identifier: 'plus-annual', productIdentifier: 'claire.plus.annual', title: 'Claire Plus', description: '', priceString: '$99.99', pricePerMonthString: '$8.33', subscriptionPeriod: 'P1Y', plan: 'plus' },
  { identifier: 'pro-annual', productIdentifier: 'claire.pro.annual', title: 'Claire Pro', description: '', priceString: '$199.99', pricePerMonthString: '$16.67', subscriptionPeriod: 'P1Y', plan: 'pro' },
];

function PreviewGoogleButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 52, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="logo-google" size={20} color={colors.paper} />
        <Text style={{ ...mobileType.body, color: colors.paper, fontWeight: '700' }}>Continue with Google</Text>
      </View>
    </Pressable>
  );
}

function PaywallReview({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [cadence, setCadence] = useState<BillingCadence>('annual');
  const visible = reviewPackages.filter((item) => item.subscriptionPeriod === (cadence === 'annual' ? 'P1Y' : 'P1M'));
  const [selectedPlan, setSelectedPlan] = useState<'plus' | 'pro'>('plus');
  const selected = visible.find((item) => item.plan === selectedPlan) ?? visible[0] ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ alignItems: 'center', paddingTop: space[3], paddingHorizontal: space[4], paddingBottom: Math.max(insets.bottom + 132, 164) }}
      >
        <View style={{ width: '100%', maxWidth: 520, gap: space[6] }}>
          <PaywallHeader onClose={onClose} />
          <View style={{ gap: space[3] }}>
            <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>ONE CALM PLACE FOR EVERY CONVERSATION</Text>
            <Text selectable style={{ ...mobileType.display, color: colors.ink, maxWidth: 430 }}>Stay present without starting from zero.</Text>
            <Text selectable style={{ ...mobileType.body, color: colors.neutral[600], maxWidth: 450 }}>Claire catches you up, finds what is still open, and helps write the next reply across every connected conversation.</Text>
          </View>
          <PreviewStatusCard credits={50} isOnboarding />
          <View accessibilityRole="radiogroup" style={{ gap: space[3] }}>
            <View style={{ gap: space[2] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
                <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>CHOOSE YOUR PLAN</Text>
                <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>2 OPTIONS</Text>
              </View>
              <CadenceSelector cadences={['monthly', 'annual']} selected={cadence} onSelect={setCadence} />
            </View>
            {visible.map((item) => <PlanOption key={item.identifier} item={item} selected={item.plan === selectedPlan} onPress={() => setSelectedPlan(item.plan)} />)}
          </View>
          <SharedBenefitsCard />
          <Text selectable style={{ ...mobileType.label, fontWeight: '400', color: colors.neutral[600], textAlign: 'center' }}>Payment is charged to your store account. Your subscription renews automatically unless canceled before the renewal date.</Text>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: Math.max(insets.bottom, space[4]), borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: colors.cream }}>
        <View style={{ width: '100%', maxWidth: 520, gap: 2 }}>
          <PurchaseButton item={selected} purchasing={false} onPress={onClose} />
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>Use 50 free credits first</Text>
            </Pressable>
            <View style={{ width: 1, height: 18, backgroundColor: colors.neutral[200] }} />
            <RestoreButton disabled={false} onPress={() => undefined} />
          </View>
        </View>
      </View>
    </View>
  );
}

function OnboardingWalkthrough() {
  const [step, setStep] = useState<ReviewStep>('welcome');
  const [email, setEmail] = useState('luc@example.com');
  const [code, setCode] = useState('123456');
  const [connected, setConnected] = useState(false);
  const connectionStates: OnboardingConnectionStates = connected
    ? { [Platform.WHATSAPP]: 'connected' }
    : {};

  if (step === 'welcome') {
    return <WelcomeScreenView googleButton={<PreviewGoogleButton onPress={() => setStep('accounts')} />} onContinueWithEmail={() => setStep('email')} />;
  }
  if (step === 'email') {
    return <EmailSignInView email={email} loading={false} canSubmit={Boolean(email.trim())} emailInvalid={false} error={null} onBack={() => setStep('welcome')} onChangeEmail={setEmail} onValidateEmail={() => undefined} onSubmit={() => setStep('verify')} />;
  }
  if (step === 'verify') {
    return <EmailVerificationView email={email} code={code} error={null} message={null} verificationStatus="idle" loading={false} resending={false} focusRequest={0} canVerify={code.length === 6} autoFocusCode={false} onBack={() => setStep('email')} onChangeCode={setCode} onVerify={() => setStep('accounts')} onResend={() => setCode('')} onChangeEmail={() => setStep('email')} />;
  }
  if (step === 'accounts') {
    return <OnboardingConnectionsView states={connectionStates} hasConnection={connected} onBack={() => setStep('verify')} onHelp={() => undefined} onSelectPlatform={(platform) => setStep(platform === Platform.WHATSAPP ? 'whatsapp-phone' : 'accounts')} onContinue={() => setStep('plans')} onSkip={() => setStep('plans')} />;
  }
  if (step === 'plans') return <PaywallReview onClose={() => setStep('welcome')} />;

  const flowState: Record<Exclude<ReviewStep, 'welcome' | 'email' | 'verify' | 'accounts' | 'plans'>, ConnectionFlowPreviewState> = {
    'whatsapp-phone': 'phone',
    'whatsapp-code': 'link-code',
    'whatsapp-success': 'success',
  };
  const next: Record<keyof typeof flowState, ReviewStep> = {
    'whatsapp-phone': 'whatsapp-code',
    'whatsapp-code': 'whatsapp-success',
    'whatsapp-success': 'accounts',
  };
  return <ConnectionFlowPreview platform={Platform.WHATSAPP} state={flowState[step]} onBack={() => setStep('accounts')} onAdvance={() => { if (step === 'whatsapp-success') setConnected(true); setStep(next[step]); }} />;
}

const meta = {
  title: 'Onboarding/Flow',
  component: OnboardingWalkthrough,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OnboardingWalkthrough>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompleteWalkthrough: Story = {};

export const Welcome: Story = {
  render: () => <WelcomeScreenView googleButton={<PreviewGoogleButton onPress={() => undefined} />} onContinueWithEmail={() => undefined} />,
};

export const EmailEntryError: Story = {
  render: () => <EmailSignInView email="not-an-email" loading={false} canSubmit emailInvalid error="Enter a valid email address." onBack={() => undefined} onChangeEmail={() => undefined} onValidateEmail={() => undefined} onSubmit={() => undefined} />,
};

export const VerificationError: Story = {
  render: () => <EmailVerificationView email="luc@example.com" code="123456" error="That code is incorrect. Check the email and try again." message={null} verificationStatus="error" loading={false} resending={false} focusRequest={0} canVerify autoFocusCode={false} onBack={() => undefined} onChangeCode={() => undefined} onVerify={() => undefined} onResend={() => undefined} onChangeEmail={() => undefined} />,
};

export const AccountsConnected: Story = {
  render: () => <OnboardingConnectionsView states={{ [Platform.WHATSAPP]: 'connected', [Platform.TELEGRAM]: 'pending' }} hasConnection onBack={() => undefined} onHelp={() => undefined} onSelectPlatform={() => undefined} onContinue={() => undefined} onSkip={() => undefined} />,
};

export const WhatsAppLinkCode: Story = {
  render: () => <ConnectionFlowPreview platform={Platform.WHATSAPP} state="link-code" onBack={() => undefined} onAdvance={() => undefined} />,
};

export const Plans: Story = { render: () => <PaywallReview onClose={() => undefined} /> };
