# Onboarding review

Run the interactive onboarding walkthrough in the existing Claire development
client:

```sh
cd apps/client
bun run storybook:ios
```

The walkthrough starts at the current welcome screen and uses local fixture
state, so email verification, account linking, notification permission, and
plan selection never call a backend or open a system permission prompt.
After sign-in, account connection, notifications, and plans show a three-step
progress bar. To compare compact header dots, run
`EXPO_PUBLIC_STORYBOOK_STORY=onboarding-flow--complete-walkthrough-dots bun run storybook:ios`.
The generated on-device Storybook navigator is disabled for React Native 0.83
compatibility; the Storybook runtime opens `CompleteWalkthrough` directly.
To inspect the notification screen without stepping through the flow, run
`EXPO_PUBLIC_STORYBOOK_STORY=onboarding-flow--notifications bun run storybook:ios`
instead. Use `onboarding-flow--notifications-denied` to inspect the denied state.
Use `EXPO_PUBLIC_STORYBOOK_STORY=onboarding-flow--plans bun run storybook:ios`
to open the final plans screen directly. Prices and purchases in Storybook are
fixtures; the actual onboarding screen loads the current store offering.
Use `onboarding-flow--plans-from-profile` to check the Profile version of its
header, with a back button instead of the onboarding close button.
For direct progress comparisons, use `onboarding-flow--accounts-dots`,
`onboarding-flow--notifications-dots`, or `onboarding-flow--plans-dots`.
