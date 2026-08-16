import { NativeTabs } from 'expo-router/unstable-native-tabs';

/**
 * System iOS tab bar. On iOS 26 this picks up Liquid Glass automatically.
 * Switch to it from `app/(tabs)/_layout.tsx` by setting TAB_BAR_STYLE to
 * 'liquid-glass'. The custom floating Claire bar cannot use this material.
 */
export function LiquidGlassTabs({ promiseCount }: { promiseCount?: number }) {
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
        <NativeTabs.Trigger.Icon sf={{ default: 'sparkles', selected: 'sparkles' }} md="auto_awesome" />
        <NativeTabs.Trigger.Label hidden>Ask Claire</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="promises" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.seal', selected: 'checkmark.seal.fill' }} md="verified" />
        <NativeTabs.Trigger.Label hidden>Loops</NativeTabs.Trigger.Label>
        {promiseCount && promiseCount > 0 ? (
          <NativeTabs.Trigger.Badge>{promiseCount > 99 ? '99+' : String(promiseCount)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more" role="more" disableTransparentOnScrollEdge>
        <NativeTabs.Trigger.Icon sf="ellipsis" md="more_horiz" />
        <NativeTabs.Trigger.Label hidden>More</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
