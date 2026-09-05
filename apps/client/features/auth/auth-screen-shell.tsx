import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, mobileType, radius, space } from '@claire/design-system';
import { ClaireMark } from '../../components/claire/mark';

export function AuthScreenShell({
  kicker,
  title,
  description,
  children,
  footer,
  onBack,
  testID,
}: {
  kicker: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  onBack: () => void;
  testID: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.paper }}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        testID={testID}
        style={{ flex: 1, backgroundColor: colors.paper }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        bounces={false}
        contentContainerStyle={{
          paddingHorizontal: space[6],
          paddingTop: space[6],
          paddingBottom: space[6],
        }}
      >
        <View>
          <View
            style={{
              minHeight: 44,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              onPress={onBack}
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: colors.neutral[200],
                backgroundColor: colors.cream,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowLeft size={19} color={colors.ink} strokeWidth={2} />
            </Pressable>
            <View
              accessibilityElementsHidden
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                borderCurve: 'continuous',
                backgroundColor: colors.lime,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ClaireMark size={25} color={colors.ink} dot={colors.paper} />
            </View>
            <View style={{ width: 44 }} />
          </View>

          <View style={{ paddingTop: space[10], gap: space[3] }}>
            <Text selectable style={{ ...mobileType.monoLabel, color: colors.neutral[600] }}>
              {kicker}
            </Text>
            <Text
              selectable
              style={{ ...mobileType.display, color: colors.ink, maxWidth: 340 }}
            >
              {title}
            </Text>
            <Text
              selectable
              style={{ ...mobileType.body, color: colors.neutral[600], maxWidth: 340 }}
            >
              {description}
            </Text>
            <View style={{ paddingTop: space[5] }}>{children}</View>
          </View>

        </View>
      </ScrollView>
      <View
        style={{
          paddingHorizontal: space[6],
          paddingTop: space[2],
          paddingBottom: Math.max(insets.bottom, space[5]),
          gap: space[2],
          backgroundColor: colors.paper,
        }}
      >
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}

export function AuthPrimaryButton({
  label,
  loadingLabel,
  loading,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  loadingLabel: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const unavailable = loading || disabled;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={{
        minHeight: 56,
        borderRadius: 16,
        borderCurve: 'continuous',
        backgroundColor: unavailable ? colors.neutral[200] : colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <ActivityIndicator size="small" color={colors.neutral[600]} />
          <Text style={{ ...mobileType.body, color: colors.neutral[600], fontWeight: '700' }}>
            {loadingLabel}
          </Text>
        </View>
      ) : (
        <Text
          style={{
            ...mobileType.body,
            color: unavailable ? colors.neutral[400] : colors.paper,
            fontWeight: '700',
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function AuthInlineMessage({
  message,
  tone,
  testID,
}: {
  message: string;
  tone: 'error' | 'success';
  testID?: string;
}) {
  const isError = tone === 'error';
  const color = isError ? colors.danger : colors.success;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space[2],
        padding: space[3],
        borderRadius: radius.control,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: color,
        backgroundColor: isError ? colors.blush : colors.successSurface,
      }}
    >
      {isError ? (
        <AlertCircle size={17} color={color} strokeWidth={2.2} />
      ) : (
        <CheckCircle2 size={17} color={color} strokeWidth={2.2} />
      )}
      <Text selectable style={{ flex: 1, ...mobileType.bodySmall, color }}>
        {message}
      </Text>
    </View>
  );
}
