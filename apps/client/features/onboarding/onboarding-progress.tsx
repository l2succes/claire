import { Text, View } from 'react-native';
import { colors, mobileType } from '@claire/design-system';

export type OnboardingProgressStage = 'connections' | 'notifications' | 'plans';
export type OnboardingProgressVariant = 'bar' | 'dots';

export const defaultOnboardingProgressVariant: OnboardingProgressVariant = 'bar';

const stages: readonly OnboardingProgressStage[] = ['connections', 'notifications', 'plans'];
const stageLabels: Record<OnboardingProgressStage, string> = {
  connections: 'Connect accounts',
  notifications: 'Notifications',
  plans: 'Plans',
};

export function OnboardingProgress({
  stage,
  variant = defaultOnboardingProgressVariant,
}: {
  stage: OnboardingProgressStage;
  variant?: OnboardingProgressVariant;
}) {
  const step = stages.indexOf(stage) + 1;

  return (
    <View
      testID={`onboarding-progress-${variant}`}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${stageLabels[stage]}, step ${step} of ${stages.length}`}
      accessibilityValue={{ min: 0, max: stages.length, now: step }}
      style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}
    >
      {variant === 'dots' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 10 }}>
          {stages.map((item, index) => (
            <View
              key={item}
              testID={`onboarding-progress-dot-${index + 1}`}
              style={{ width: index + 1 === step ? 21 : 7, height: 7, borderRadius: 99, backgroundColor: index + 1 === step ? colors.ink : index + 1 < step ? colors.neutral[600] : colors.neutral[200] }}
            />
          ))}
        </View>
      ) : (
        <View style={{ minHeight: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, height: 5, borderRadius: 99, overflow: 'hidden', backgroundColor: colors.neutral[200] }}>
            <View testID="onboarding-progress-fill" style={{ width: `${(step / stages.length) * 100}%`, height: '100%', borderRadius: 99, backgroundColor: colors.ink }} />
          </View>
          <Text style={{ ...mobileType.monoLabel, color: colors.neutral[600], fontVariant: ['tabular-nums'] }}>{step}/{stages.length}</Text>
        </View>
      )}
    </View>
  );
}
