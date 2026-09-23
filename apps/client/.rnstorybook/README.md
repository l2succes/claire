# Onboarding review

Run the interactive onboarding walkthrough in the existing Claire development
client:

```sh
bun run storybook:ios
```

The walkthrough starts at the welcome screen and uses local fixture state, so
email verification, account linking, and plan selection never call a backend.
The generated on-device Storybook navigator is disabled for React Native 0.83
compatibility; the Storybook runtime opens `CompleteWalkthrough` directly.
