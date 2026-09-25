import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  Clock3,
  Copy,
  ExternalLink,
  Laptop,
  Lightbulb,
  LockKeyhole,
  MessageCircle,
  Monitor,
  Pencil,
  ShieldCheck,
} from 'lucide-react-native';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { Platform } from '../../types/platform';
import type { ConnectionSource } from './connection-platform-config';
import { CONNECTION_PLATFORM_CONFIG } from './connection-platform-config';
import { formatPairingCodeForDisplay } from './connection-formatters';
import { ConnectionPlatformMark } from './connection-platform-mark';
import { useConnectionFlow } from './use-connection-flow';
import { useInstagramMobileAvailability } from './use-instagram-mobile-availability';
import { hasInstagramMobileLogin } from '../../modules/instagram-login';

const isAndroid = process.env.EXPO_OS === 'android';

export function ConnectionFlowScreen({ platform, source }: { platform: Platform; source: ConnectionSource }) {
  const insets = useSafeAreaInsets();
  const connection = useConnectionFlow(platform, source);
  const instagramAvailability = useInstagramMobileAvailability();
  const config = CONNECTION_PLATFORM_CONFIG[platform];
  const flowError = connection.error || '';
  const rateLimited = platform === Platform.WHATSAPP && /rate limited/i.test(flowError);
  const expired = platform === Platform.WHATSAPP && /expired|timed out|not confirmed/i.test(flowError);

  let body: ReactNode;
  let footer: ReactNode = null;

  if (connection.resuming) {
    body = <LoadingState platform={platform} message="Checking for an existing setup…" />;
  } else if (connection.success) {
    body = <SuccessState platform={platform} account={connection.connectedSession?.platformUsername || connection.connectedSession?.phoneNumber || connection.connectedSession?.platformUserId} />;
    footer = <FlowButton label={source === 'onboarding' ? 'Back to accounts' : 'Done'} onPress={connection.goBack} />;
  } else if (platform === Platform.INSTAGRAM && hasInstagramMobileLogin) {
    if (instagramAvailability.checking) {
      body = <InstagramMobileIntro error={null} />;
      footer = <FlowButton label="Checking Instagram sign-in…" loading disabled />;
    } else if (instagramAvailability.available) {
      body = <InstagramMobileIntro error={null} />;
      footer = <><FlowButton label="Continue to Instagram sign-in" onPress={() => router.push('/(auth)/connections/instagram-signin')} /><FlowButton label="Do this later" variant="tertiary" onPress={connection.goBack} /></>;
    } else {
      body = <InstagramMobileIntro error={null} availability={instagramAvailability.error ? 'offline' : 'not-enabled'} />;
      footer = <><FlowButton label="Check again" loading={instagramAvailability.checking} onPress={() => void instagramAvailability.retry()} /><FlowButton label="Back to accounts" variant="tertiary" onPress={connection.goBack} /></>;
    }
  } else if (platform === Platform.INSTAGRAM || platform === Platform.IMESSAGE) {
    body = <CompanionGuide platform={platform} error={flowError} />;
    footer = (
      <>
        <FlowButton label="I’ve finished — check connection" loading={connection.checking} onPress={() => void connection.checkConnection()} />
        <FlowButton label="Do this later" variant="tertiary" onPress={connection.goBack} />
      </>
    );
  } else if (platform === Platform.WHATSAPP && (rateLimited || expired || connection.flow?.step === 'error')) {
    body = <WhatsAppErrorState error={flowError} rateLimited={rateLimited} expired={expired} />;
    footer = rateLimited ? (
      <>
        <FlowButton label="Try again later" disabled />
        <FlowButton label="Back to accounts" variant="secondary" onPress={connection.goBack} />
      </>
    ) : (
      <>
        <FlowButton label="Request a new code" loading={connection.isLoading} onPress={() => void connection.requestFreshWhatsAppCode()} />
        <FlowButton label="Back to accounts" variant="tertiary" onPress={connection.goBack} />
      </>
    );
  } else if (platform === Platform.WHATSAPP && connection.pairingCode) {
    body = (
      <WhatsAppCodeState
        code={connection.pairingCode}
        copied={connection.copied}
        handoffMessage={connection.handoffMessage}
        onCopy={() => void connection.copyPairingCode(false)}
      />
    );
    footer = (
      <>
        <FlowButton icon={<ExternalLink size={17} color={colors.paper} />} label="Copy code & open WhatsApp" onPress={() => void connection.copyPairingCode(true)} />
        <FlowButton label="Check again" variant="secondary" loading={connection.checking} onPress={() => void connection.checkConnection()} />
      </>
    );
  } else if (platform === Platform.WHATSAPP && connection.flow) {
    body = <LoadingState platform={platform} message="Getting your link code…" />;
  } else if (platform === Platform.WHATSAPP) {
    body = (
      <PhoneEntry
        platform={platform}
        value={connection.phoneNumber}
        error={connection.phoneError || flowError}
        onChange={connection.updatePhoneNumber}
      />
    );
    footer = <FlowButton label="Get link code" icon={<ArrowRight size={17} color={colors.paper} />} loading={connection.isLoading} onPress={() => void connection.submitPhoneNumber()} />;
  } else if (platform === Platform.TELEGRAM && connection.flow) {
    body = (
      <TelegramCodeState
        value={connection.verificationCode}
        error={connection.flow.step === 'error' ? flowError : ''}
        onChange={connection.setVerificationCode}
        onChangeNumber={connection.useDifferentTelegramNumber}
      />
    );
    footer = <FlowButton label="Verify and connect" loading={connection.isLoading || connection.flow.step === 'verifying'} disabled={connection.verificationCode.trim().length < 5} onPress={() => void connection.verifyTelegram()} />;
  } else {
    body = (
      <PhoneEntry
        platform={platform}
        value={connection.phoneNumber}
        error={connection.phoneError || flowError}
        onChange={connection.updatePhoneNumber}
      />
    );
    footer = <FlowButton label="Send verification code" loading={connection.isLoading} onPress={() => void connection.submitPhoneNumber()} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }} testID={`connection-flow-${platform}`}>
      <StatusBar style="dark" />
      <FlowHeader title={connection.success ? `${config.name} connection` : `Connect ${config.name}`} topInset={insets.top} compact={platform === Platform.INSTAGRAM && hasInstagramMobileLogin} onBack={connection.goBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior={platform === Platform.INSTAGRAM && hasInstagramMobileLogin ? 'never' : 'automatic'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[5] }}
        >
          {body}
        </ScrollView>
        {footer ? (
          <View
            style={{
              gap: space[2],
              paddingHorizontal: space[4],
              paddingTop: space[3],
              paddingBottom: Math.max(insets.bottom, space[4]),
              borderTopWidth: 1,
              borderTopColor: colors.neutral[200],
              backgroundColor: colors.cream,
            }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

export function FlowHeader({ title, topInset, compact = false, backLabel = 'Back to accounts', onBack }: { title: string; topInset: number; compact?: boolean; backLabel?: string; onBack: () => void }) {
  // The full-screen route needs the device safe area. In a sheet, iOS can
  // report the presenting screen's inset too, so cap it to one status bar.
  const headerInset = compact ? Math.min(topInset, 64) : topInset;
  return (
    <View style={{ paddingTop: Math.max(headerInset, space[2]), paddingHorizontal: space[4], minHeight: 58 + headerInset, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        testID="connection-flow-back"
        onPress={onBack}
        style={{ width: 42, height: 42, borderRadius: 13, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronLeft size={20} color={colors.ink} />
      </Pressable>
      <Text numberOfLines={1} style={{ flex: 1, textAlign: 'center', ...mobileType.body, fontWeight: '700', color: colors.ink }}>{title}</Text>
      <View style={{ width: 42 }} />
    </View>
  );
}

function FlowIntro({ platform, title, copy }: { platform: Platform; title: string; copy: string }) {
  return (
    <View style={{ alignItems: 'center', gap: space[3], paddingBottom: space[4] }}>
      <ConnectionPlatformMark platform={platform} size={62} />
      <View style={{ alignItems: 'center', gap: 5 }}>
        <Text style={{ ...mobileType.screenTitle, fontSize: 27, lineHeight: 30, textAlign: 'center', color: colors.ink }}>{title}</Text>
        <Text style={{ ...mobileType.bodySmall, textAlign: 'center', color: colors.neutral[600], maxWidth: 330 }}>{copy}</Text>
      </View>
    </View>
  );
}

function PhoneEntry({
  platform,
  value,
  error,
  onChange,
}: {
  platform: Platform.WHATSAPP | Platform.TELEGRAM;
  value: string;
  error: string;
  onChange: (value: string) => void;
}) {
  const whatsapp = platform === Platform.WHATSAPP;
  return (
    <View style={{ flex: 1, gap: space[4] }}>
      <FlowIntro
        platform={platform}
        title={whatsapp ? 'Enter your WhatsApp number' : 'Enter your Telegram number'}
        copy={whatsapp
          ? 'Use the number already registered with WhatsApp. Claire will request a private linking code.'
          : 'Use the mobile number connected to the Telegram account you want in Claire.'}
      />
      <View style={{ gap: space[2], padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
        <Text style={{ ...mobileType.label, color: colors.ink }}>{whatsapp ? 'WhatsApp phone number' : 'Telegram phone number'}</Text>
        <TextInput
          testID="connection-phone-input"
          accessibilityLabel={`${whatsapp ? 'WhatsApp' : 'Telegram'} phone number`}
          value={value}
          onChangeText={onChange}
          placeholder="+52 55 1234 5678"
          placeholderTextColor={colors.neutral[400]}
          keyboardType="phone-pad"
          autoComplete="tel"
          style={{ minHeight: 54, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, borderCurve: 'continuous', borderWidth: 1, borderColor: error ? colors.danger : colors.neutral[300], backgroundColor: colors.paper, ...mobileType.body, fontSize: 17, color: colors.ink }}
        />
        <Text style={{ ...mobileType.label, fontWeight: '400', color: colors.neutral[600] }}>
          {whatsapp ? 'Include your country code. We’ll format it as you type.' : 'Include your country code, without a leading local zero.'}
        </Text>
        {error ? <Text selectable accessibilityRole="alert" testID="connection-phone-error" style={{ ...mobileType.label, color: colors.danger }}>{error}</Text> : null}
      </View>
      <InfoNote
        icon={whatsapp ? <MessageCircle size={17} color={colors.ink} /> : <ShieldCheck size={17} color={colors.ink} />}
        text={whatsapp
          ? 'No SMS is sent. The code appears here, then you enter it in WhatsApp’s Linked Devices screen.'
          : 'Telegram may send the login code to its verified Telegram chat or by SMS.'}
      />
    </View>
  );
}

function WhatsAppCodeState({
  code,
  copied,
  handoffMessage,
  onCopy,
}: {
  code: string;
  copied: boolean;
  handoffMessage: string | null;
  onCopy: () => void;
}) {
  const steps = isAndroid
    ? [
      <>Open WhatsApp and tap the <Text style={{ fontWeight: '700' }}>three-dot menu</Text>.</>,
      <>Choose <Text style={{ fontWeight: '700' }}>Linked devices</Text>, then <Text style={{ fontWeight: '700' }}>Link a device</Text>.</>,
      <>Tap <Text style={{ fontWeight: '700' }}>Link with phone number instead</Text> and enter the code.</>,
    ]
    : [
      <>Open WhatsApp and tap <Text style={{ fontWeight: '700' }}>Settings</Text>.</>,
      <>Choose <Text style={{ fontWeight: '700' }}>Linked Devices</Text>, then <Text style={{ fontWeight: '700' }}>Link a Device</Text>.</>,
      <>Tap <Text style={{ fontWeight: '700' }}>Link with phone number instead</Text> and enter the code.</>,
    ];
  return (
    <View style={{ flex: 1, gap: space[4] }}>
      <FlowIntro platform={Platform.WHATSAPP} title="Link Claire in WhatsApp" copy={`Copy this code, then follow the steps on your ${isAndroid ? 'Android phone' : 'iPhone'}.`} />
      <View style={{ width: '100%', minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: colors.mint }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>YOUR LINK CODE</Text>
          <Text selectable testID="whatsapp-pairing-code" style={{ fontFamily: 'DM Mono', fontSize: 25, lineHeight: 30, fontWeight: '600', letterSpacing: 1.5, color: colors.ink }}>{formatPairingCodeForDisplay(code)}</Text>
        </View>
        <Pressable
          testID="whatsapp-copy-code"
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Link code copied' : 'Copy link code'}
          onPress={onCopy}
          style={{ minWidth: 86, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.ink, backgroundColor: colors.paper }}
        >
          {copied ? <Check size={16} color={colors.ink} /> : <Copy size={16} color={colors.ink} />}
          <Text style={{ ...mobileType.label, color: colors.ink }}>{copied ? 'Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3], borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.paper }}>
        <ActivityIndicator size="small" color={colors.ink} />
        <Text style={{ flex: 1, ...mobileType.label, fontWeight: '400', color: colors.neutral[600] }}>Waiting for WhatsApp. This code stays active for a few minutes.</Text>
      </View>
      {handoffMessage ? <Text selectable accessibilityLiveRegion="polite" style={{ ...mobileType.label, color: colors.success, textAlign: 'center' }}>{handoffMessage}</Text> : null}
      <View style={{ gap: space[2] }}>
        <Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>In WhatsApp</Text>
        {steps.map((step, index) => <InstructionStep key={index} number={index + 1}>{step}</InstructionStep>)}
      </View>
    </View>
  );
}

function TelegramCodeState({ value, error, onChange, onChangeNumber }: { value: string; error: string; onChange: (value: string) => void; onChangeNumber: () => void }) {
  return (
    <View style={{ flex: 1, gap: space[4] }}>
      <FlowIntro platform={Platform.TELEGRAM} title="Check Telegram for your code" copy="Look in the verified Telegram service chat first. The code may also arrive by SMS." />
      <View style={{ gap: space[2], padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
        <Text style={{ ...mobileType.label, color: colors.ink }}>Verification code</Text>
        <TextInput
          testID="telegram-code-input"
          accessibilityLabel="Telegram verification code"
          value={value}
          onChangeText={(next) => onChange(next.replace(/\D/g, '').slice(0, 6))}
          placeholder="••••••"
          placeholderTextColor={colors.neutral[400]}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          maxLength={6}
          style={{ minHeight: 58, paddingHorizontal: 14, paddingVertical: 12, textAlign: 'center', borderRadius: 13, borderCurve: 'continuous', borderWidth: 1, borderColor: error ? colors.danger : colors.neutral[300], backgroundColor: colors.paper, fontFamily: 'DM Mono', fontSize: 23, lineHeight: 28, letterSpacing: 5, color: colors.ink }}
        />
        {error ? <Text selectable accessibilityRole="alert" testID="telegram-code-error" style={{ ...mobileType.label, color: colors.danger }}>That code didn’t work. Check the latest message from Telegram and try again.</Text> : <Text style={{ ...mobileType.label, fontWeight: '400', color: colors.neutral[600] }}>Enter the latest 5- or 6-digit code.</Text>}
      </View>
      <FlowButton icon={<Pencil size={15} color={colors.neutral[600]} />} label="Use a different number" variant="tertiary" onPress={onChangeNumber} />
    </View>
  );
}

function InstagramMobileIntro({ error, availability }: { error: string | null; availability?: 'offline' | 'not-enabled' }) {
  return <View style={{ flex: 1, gap: space[4] }} testID="instagram-mobile-login">
    <View style={{ gap: space[4], padding: space[5], borderRadius: radius.panel, borderCurve: 'continuous', backgroundColor: colors.ink }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <ConnectionPlatformMark platform={Platform.INSTAGRAM} size={58} />
        <View style={{ paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.lime }}>
          <Text style={{ ...mobileType.monoLabel, color: colors.ink }}>ON THIS IPHONE</Text>
        </View>
      </View>
      <View style={{ gap: space[2] }}>
        <Text style={{ ...mobileType.screenTitle, fontSize: 29, lineHeight: 32, color: colors.paper }}>Your Instagram chats in Claire.</Text>
        <Text style={{ ...mobileType.body, color: colors.neutral[200] }}>Sign in on this iPhone. Your chats start syncing after verification.</Text>
      </View>
    </View>
    {availability ? <ErrorCallout warning text={availability === 'offline' ? 'Claire could not check Instagram sign-in right now. Check your connection and try again.' : 'Mobile Instagram sign-in is not available for this Claire account yet. Check again soon.'} /> : null}
    <View style={{ gap: space[2], padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
      <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>HOW IT WORKS</Text>
      <InstagramStep number={1} title="Sign in" detail="Use your Instagram account." />
      <InstagramStep number={2} title="Verify" detail="Complete any code Instagram sends." />
      <InstagramStep number={3} title="Sync" detail="Conversations appear in Claire." />
    </View>
    <InfoNote icon={<ShieldCheck size={17} color={colors.ink} />} text="Your password and verification code aren’t saved in Claire." />
    {error ? <ErrorCallout text={error} /> : null}
  </View>;
}

function InstagramStep({ number, title, detail }: { number: number; title: string; detail: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[2] }}>
    <View style={{ width: 27, height: 27, borderRadius: 9, borderCurve: 'continuous', backgroundColor: colors.neutral[100], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ ...mobileType.label, color: colors.ink }}>{number}</Text>
    </View>
    <View style={{ flex: 1, gap: 2 }}><Text style={{ ...mobileType.body, fontWeight: '700', color: colors.ink }}>{title}</Text><Text style={{ ...mobileType.bodySmall, color: colors.neutral[600] }}>{detail}</Text></View>
  </View>;
}

// Retained as the fallback for builds without the native module and for Android.
function CompanionGuide({ platform, error }: { platform: Platform.INSTAGRAM | Platform.IMESSAGE; error: string }) {
  const instagram = platform === Platform.INSTAGRAM;
  const steps = instagram
    ? ['Open Claire Desktop on your computer.', 'Go to Settings → Connections.', 'Choose Instagram, sign in, then return here.']
    : ['Open Claire Desktop on a Mac signed in to Messages.', 'Go to Settings → Connections and choose iMessage.', 'Allow the requested macOS permissions, then return here.'];
  return (
    <View style={{ flex: 1, gap: space[4] }} testID={`${platform}-companion-required`}>
      <FlowIntro
        platform={platform}
        title={instagram ? 'Finish once in Claire Desktop' : 'Connect from your Mac'}
        copy={instagram
          ? 'Instagram uses a secure desktop sign-in. Once connected, Claire can keep syncing without the desktop app open.'
          : 'iMessage stays on your Mac. Claire Desktop and Messages need to remain available for new messages to sync.'}
      />
      {error ? <ErrorCallout text={error} /> : null}
      <View style={{ gap: space[3], padding: space[4], borderRadius: radius.card, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
        <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.neutral[100] }}>
          {instagram ? <Monitor size={14} color={colors.neutral[600]} /> : <Laptop size={14} color={colors.neutral[600]} />}
          <Text style={{ ...mobileType.label, color: colors.neutral[600] }}>{instagram ? 'Computer required once' : 'Mac stays online'}</Text>
        </View>
        {steps.map((step, index) => <InstructionStep key={step} number={index + 1}>{step}</InstructionStep>)}
      </View>
      <InfoNote icon={<LockKeyhole size={17} color={colors.ink} />} text={instagram ? 'Claire will never ask you to paste browser cookies or use developer tools.' : 'Your iMessage connection remains local to the enrolled Mac.'} />
    </View>
  );
}

function WhatsAppErrorState({ error, rateLimited, expired }: { error: string; rateLimited: boolean; expired: boolean }) {
  const title = rateLimited ? 'WhatsApp needs a pause' : expired ? 'That code expired' : 'WhatsApp couldn’t connect';
  const copy = rateLimited
    ? 'Too many linking codes were requested recently. Claire won’t keep retrying in the background.'
    : expired
      ? 'Nothing was connected. Request a fresh code when you’re ready to finish the steps in WhatsApp.'
      : 'Your account is unchanged. Start one fresh attempt when you’re ready.';
  return (
    <View style={{ flex: 1, gap: space[4] }}>
      <FlowIntro platform={Platform.WHATSAPP} title={title} copy={copy} />
      <ErrorCallout text={rateLimited ? 'Pairing is temporarily limited. Wait a little while, then return and start one fresh attempt.' : error || 'The connection was not completed.'} warning={expired} />
      {!rateLimited ? <InfoNote icon={<Lightbulb size={17} color={colors.ink} />} text="Keep WhatsApp nearby before requesting the next code so you can enter it right away." /> : null}
    </View>
  );
}

function LoadingState({ platform, message }: { platform: Platform; message: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4], paddingVertical: space[10] }}>
      <ConnectionPlatformMark platform={platform} size={62} />
      <ActivityIndicator size="large" color={colors.ink} />
      <Text style={{ ...mobileType.bodySmall, color: colors.neutral[600], textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

function SuccessState({ platform, account }: { platform: Platform; account?: string }) {
  const config = CONNECTION_PLATFORM_CONFIG[platform];
  return (
    <View style={{ flex: 1, minHeight: 510, alignItems: 'center', justifyContent: 'center', gap: space[4], paddingVertical: space[8] }} testID="connection-success">
      <View style={{ width: 74, height: 74, borderRadius: 24, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successSurface }}><Check size={36} color={colors.success} /></View>
      <ConnectionPlatformMark platform={platform} />
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={{ ...mobileType.screenTitle, fontSize: 27, lineHeight: 30, textAlign: 'center', color: colors.ink }}>{config.name} is connected</Text>
        <Text style={{ ...mobileType.bodySmall, textAlign: 'center', color: colors.neutral[600], maxWidth: 310 }}>{platform === Platform.INSTAGRAM ? 'Your connection is active. Conversations may appear gradually as Instagram syncs.' : 'Your conversations can now sync into Claire. Disconnect this account whenever you want.'}</Text>
      </View>
      {account ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.neutral[200], backgroundColor: colors.paper }}>
          <Check size={14} color={colors.success} />
          <Text selectable style={{ ...mobileType.label, color: colors.ink }}>{account}</Text>
        </View>
      ) : null}
    </View>
  );
}

function InstructionStep({ number, children }: { number: number; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3], padding: space[3], borderRadius: 14, borderCurve: 'continuous', backgroundColor: colors.paper }}>
      <View style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ink }}>
        <Text style={{ ...mobileType.label, color: colors.paper }}>{number}</Text>
      </View>
      <Text style={{ flex: 1, paddingTop: 3, ...mobileType.bodySmall, color: colors.ink }}>{children}</Text>
    </View>
  );
}

function InfoNote({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2], padding: space[3], borderRadius: 15, borderCurve: 'continuous', backgroundColor: colors.neutral[100] }}>
      {icon}
      <Text style={{ flex: 1, ...mobileType.label, fontWeight: '400', color: colors.neutral[600] }}>{text}</Text>
    </View>
  );
}

function ErrorCallout({ text, warning = false }: { text: string; warning?: boolean }) {
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2], padding: space[4], borderRadius: 18, borderCurve: 'continuous', backgroundColor: warning ? colors.warningSurface : '#FFE5E1' }}>
      {warning ? <Clock3 size={19} color={colors.warning} /> : <AlertCircle size={19} color={colors.danger} />}
      <Text selectable style={{ flex: 1, ...mobileType.bodySmall, color: warning ? colors.warning : colors.danger }}>{text}</Text>
    </View>
  );
}

export type ConnectionFlowPreviewState =
  | 'phone'
  | 'loading'
  | 'link-code'
  | 'telegram-code'
  | 'companion'
  | 'error'
  | 'success';

/**
 * Storybook-only state adapter around the production connection UI. It reuses
 * the exact screen pieces while replacing bridge calls with local callbacks.
 */
export function ConnectionFlowPreview({
  platform,
  state,
  onBack,
  onAdvance,
}: {
  platform: Platform;
  state: ConnectionFlowPreviewState;
  onBack: () => void;
  onAdvance: () => void;
}) {
  const insets = useSafeAreaInsets();
  const config = CONNECTION_PLATFORM_CONFIG[platform];
  let body: ReactNode;
  let footer: ReactNode = null;

  if (state === 'success') {
    body = <SuccessState platform={platform} account={platform === Platform.WHATSAPP ? '+52 55 1234 5678' : '@luc'} />;
    footer = <FlowButton label="Back to accounts" onPress={onAdvance} />;
  } else if (state === 'companion' && (platform === Platform.INSTAGRAM || platform === Platform.IMESSAGE)) {
    body = <CompanionGuide platform={platform} error="" />;
    footer = <><FlowButton label="I’ve finished — check connection" onPress={onAdvance} /><FlowButton label="Do this later" variant="tertiary" onPress={onBack} /></>;
  } else if (state === 'error') {
    body = <WhatsAppErrorState error="The link code expired before setup finished." rateLimited={false} expired />;
    footer = <><FlowButton label="Request a new code" onPress={onAdvance} /><FlowButton label="Back to accounts" variant="tertiary" onPress={onBack} /></>;
  } else if (state === 'link-code') {
    body = <WhatsAppCodeState code="ABCD-EFGH" copied={false} handoffMessage={null} onCopy={() => undefined} />;
    footer = <><FlowButton icon={<ExternalLink size={17} color={colors.paper} />} label="Copy code & open WhatsApp" onPress={onAdvance} /><FlowButton label="Check again" variant="secondary" onPress={onAdvance} /></>;
  } else if (state === 'telegram-code') {
    body = <TelegramCodeState value="12345" error="" onChange={() => undefined} onChangeNumber={onBack} />;
    footer = <FlowButton label="Verify and connect" onPress={onAdvance} />;
  } else if (state === 'loading') {
    body = <LoadingState platform={platform} message="Getting your link code…" />;
  } else {
    const phonePlatform = platform === Platform.TELEGRAM ? Platform.TELEGRAM : Platform.WHATSAPP;
    body = <PhoneEntry platform={phonePlatform} value="+52 55 1234 5678" error="" onChange={() => undefined} />;
    footer = <FlowButton label={phonePlatform === Platform.WHATSAPP ? 'Get link code' : 'Send verification code'} icon={<ArrowRight size={17} color={colors.paper} />} onPress={onAdvance} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }} testID={`connection-preview-${platform}-${state}`}>
      <StatusBar style="dark" />
      <FlowHeader title={state === 'success' ? `${config.name} connection` : `Connect ${config.name}`} topInset={insets.top} onBack={onBack} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[5] }}>
          {body}
        </ScrollView>
        {footer ? <View style={{ gap: space[2], paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: Math.max(insets.bottom, space[4]), borderTopWidth: 1, borderTopColor: colors.neutral[200], backgroundColor: colors.cream }}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

function FlowButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress?: () => void;
  icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'tertiary';
  loading?: boolean;
  disabled?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const primary = variant === 'primary';
  const tertiary = variant === 'tertiary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        minHeight: tertiary ? 42 : 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
        paddingHorizontal: space[4],
        borderRadius: tertiary ? 12 : 16,
        borderCurve: 'continuous',
        borderWidth: variant === 'secondary' ? 1 : 0,
        borderColor: colors.ink,
        backgroundColor: primary ? colors.ink : tertiary ? 'transparent' : colors.paper,
        opacity: disabled ? 0.34 : pressed ? 0.72 : 1,
      }}
    >
      {loading ? <ActivityIndicator size="small" color={primary ? colors.paper : colors.ink} /> : icon}
      <Text style={{ ...mobileType.body, fontWeight: '700', color: primary ? colors.paper : tertiary ? colors.neutral[600] : colors.ink }}>{loading ? 'Checking…' : label}</Text>
    </Pressable>
  );
}
