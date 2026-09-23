import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, space } from '@claire/design-system';
import { WelcomeScreenView } from '../../features/onboarding/welcome-screen';
import { OnboardingNotificationsView } from '../../features/onboarding/onboarding-notifications-screen';
import type { OnboardingProgressVariant } from '../../features/onboarding/onboarding-progress';
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
  OfferCodeButton,
  PaywallHeader,
  PaywallHero,
  PlanOption,
  PurchaseButton,
  RestoreButton,
  SharedBenefitsCard,
  TrialTimeline,
} from '../../features/billing/paywall-components';

type ReviewStep =
  | 'welcome'
  | 'email'
  | 'verify'
  | 'accounts'
  | 'notifications'
  | 'whatsapp-phone'
  | 'whatsapp-code'
  | 'whatsapp-success'
  | 'plans';

const ReviewStack = createNativeStackNavigator();

const reviewPackage: BillingPackage = {
  identifier: 'pro-monthly',
  productIdentifier: 'claire_pro_monthly',
  title: 'Claire',
  description: '',
  priceString: '$19.99',
  pricePerMonthString: null,
  subscriptionPeriod: 'P1M',
  trialDays: 3,
  plan: 'pro',
};

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

function PaywallReview({ onClose, mode = 'onboarding', progressVariant = 'bar' }: { onClose: () => void; mode?: 'onboarding' | 'profile'; progressVariant?: OnboardingProgressVariant }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ alignItems: 'center', paddingTop: space[3], paddingHorizontal: space[4], paddingBottom: Math.max(insets.bottom + 190, 222) }}
      >
        <View style={{ width: '100%', maxWidth: 520, gap: space[5] }}>
          <PaywallHeader mode={mode} progressVariant={progressVariant} onClose={onClose} />
          <PaywallHero hasTrial />
          <SharedBenefitsCard />
          <TrialTimeline item={reviewPackage} />
          <View accessibilityRole="radiogroup" style={{ gap: space[3] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
              <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>CHOOSE YOUR PLAN</Text>
              <Text style={{ ...mobileType.monoLabel, color: colors.neutral[400] }}>CANCEL ANYTIME</Text>
            </View>
            <PlanOption item={reviewPackage} selected onPress={() => undefined} />
          </View>
          <Text selectable style={{ ...mobileType.label, fontWeight: '400', color: colors.neutral[600], textAlign: 'center' }}>Free for 3 days, then $19.99 billed monthly until canceled. Cancel before the trial ends to avoid a charge.</Text>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: Math.max(insets.bottom, space[4]), borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: colors.cream }}>
        <View style={{ width: '100%', maxWidth: 520, gap: 2 }}>
          <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink, textAlign: 'center', paddingBottom: space[2] }}>3 days free · then $19.99 / month</Text>
          <PurchaseButton item={reviewPackage} purchasing={false} onPress={onClose} />
          {mode === 'onboarding' ? (
            <Pressable accessibilityRole="button" onPress={onClose} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...mobileType.bodySmall, fontWeight: '700', color: colors.ink }}>Use 50 free credits first</Text>
            </Pressable>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <RestoreButton disabled onPress={() => undefined} />
            <View style={{ width: 1, height: 18, backgroundColor: colors.neutral[200] }} />
            <OfferCodeButton disabled onPress={() => undefined} />
          </View>
        </View>
      </View>
    </View>
  );
}

function OnboardingWalkthrough({ progressVariant = 'bar' }: { progressVariant?: OnboardingProgressVariant }) {
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
    return <OnboardingConnectionsView states={connectionStates} hasConnection={connected} progressVariant={progressVariant} onBack={() => setStep('verify')} onHelp={() => undefined} onSelectPlatform={(platform) => setStep(platform === Platform.WHATSAPP ? 'whatsapp-phone' : 'accounts')} onContinue={() => setStep('notifications')} onSkip={() => setStep('notifications')} />;
  }
  if (step === 'notifications') return <OnboardingNotificationsView permission="undetermined" progressVariant={progressVariant} onBack={() => setStep('accounts')} onEnable={() => setStep('plans')} onSkip={() => setStep('plans')} />;
  if (step === 'plans') return <PaywallReview progressVariant={progressVariant} onClose={() => setStep('welcome')} />;

  const flowState: Record<Exclude<ReviewStep, 'welcome' | 'email' | 'verify' | 'accounts' | 'notifications' | 'plans'>, ConnectionFlowPreviewState> = {
    'whatsapp-phone': 'phone',
    'whatsapp-code': 'link-code',
    'whatsapp-success': 'success',
  };
  const next: Record<keyof typeof flowState, ReviewStep> = {
    'whatsapp-phone': 'whatsapp-code',
    'whatsapp-code': 'whatsapp-success',
    'whatsapp-success': 'accounts',
  };
  return <ConnectionFlowPreview platform={Platform.WHATSAPP} state={flowState[step]} progressVariant={progressVariant} onBack={() => setStep('accounts')} onAdvance={() => { if (step === 'whatsapp-success') setConnected(true); setStep(next[step]); }} />;
}

const meta = {
  title: 'Onboarding/Flow',
  component: OnboardingWalkthrough,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story: () => React.ReactElement) => (
      <NavigationContainer>
        <ReviewStack.Navigator screenOptions={{ headerShown: false }}>
          <ReviewStack.Screen name="Review">{() => <Story />}</ReviewStack.Screen>
        </ReviewStack.Navigator>
      </NavigationContainer>
    ),
  ],
} satisfies Meta<typeof OnboardingWalkthrough>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompleteWalkthrough: Story = {};

export const CompleteWalkthroughDots: Story = { render: () => <OnboardingWalkthrough progressVariant="dots" /> };

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

export const AccountsDots: Story = {
  render: () => <OnboardingConnectionsView states={{ [Platform.WHATSAPP]: 'connected' }} hasConnection progressVariant="dots" onBack={() => undefined} onHelp={() => undefined} onSelectPlatform={() => undefined} onContinue={() => undefined} onSkip={() => undefined} />,
};

export const Notifications: Story = {
  render: () => <OnboardingNotificationsView permission="undetermined" onBack={() => undefined} onEnable={() => undefined} onSkip={() => undefined} />,
};

export const NotificationsDots: Story = {
  render: () => <OnboardingNotificationsView permission="undetermined" progressVariant="dots" onBack={() => undefined} onEnable={() => undefined} onSkip={() => undefined} />,
};

export const NotificationsDenied: Story = {
  render: () => <OnboardingNotificationsView permission="denied" onBack={() => undefined} onEnable={() => undefined} onSkip={() => undefined} />,
};

export const WhatsAppLinkCode: Story = {
  render: () => <ConnectionFlowPreview platform={Platform.WHATSAPP} state="link-code" onBack={() => undefined} onAdvance={() => undefined} />,
};

export const Plans: Story = { render: () => <PaywallReview onClose={() => undefined} /> };

export const PlansDots: Story = { render: () => <PaywallReview progressVariant="dots" onClose={() => undefined} /> };

export const PlansFromProfile: Story = { render: () => <PaywallReview mode="profile" onClose={() => undefined} /> };
