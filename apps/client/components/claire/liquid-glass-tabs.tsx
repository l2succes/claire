import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useMaskedTabAvatar } from '../../hooks/use-masked-tab-avatar';

/**
 * System iOS tab bar. On iOS 26 this picks up Liquid Glass automatically.
 * Switch to it from `app/(tabs)/_layout.tsx` by setting TAB_BAR_STYLE to
 * 'liquid-glass'. The custom floating Claire bar cannot use this material.
 */
export function LiquidGlassTabs({ loopCount, profileAvatarUrl }: { loopCount?: number; profileAvatarUrl?: string | null }) {
  const { avatarURL: maskedProfileAvatarUrl, isLoading: isProfileAvatarLoading } = useMaskedTabAvatar(profileAvatarUrl);

  // Mount the system bar with its final image source. Updating a NativeTabs
  // icon after mount can leave its original SF Symbol in place.
  if (isProfileAvatarLoading) return null;

  return (
    <NativeTabs tintColor="#10120F" minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="dashboard" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label hidden>Home</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="messages" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf={{ default: 'message', selected: 'message.fill' }} md="chat" />
        <NativeTabs.Trigger.Label hidden>Inbox</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ask-claire" disableTransparentOnScrollEdge>
          <NativeTabs.Trigger.Icon
            src={{
              default: require('../../assets/claire-tab-icon.png'),
              selected: require('../../assets/claire-tab-icon-selected.png'),
            }}
            renderingMode="original"
          />
        <NativeTabs.Trigger.Label hidden>Ask Claire</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="loops" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.seal', selected: 'checkmark.seal.fill' }} md="verified" />
        <NativeTabs.Trigger.Label hidden>Loops</NativeTabs.Trigger.Label>
        {loopCount && loopCount > 0 ? (
          <NativeTabs.Trigger.Badge>{loopCount > 99 ? '99+' : String(loopCount)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" disableTransparentOnScrollEdge>
        {maskedProfileAvatarUrl ? (
          <NativeTabs.Trigger.Icon
            src={{ default: { uri: maskedProfileAvatarUrl }, selected: { uri: maskedProfileAvatarUrl } }}
            renderingMode="original"
          />
        ) : (
          <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
        )}
        <NativeTabs.Trigger.Label hidden>Profile</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
