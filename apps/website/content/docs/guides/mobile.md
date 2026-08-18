---
title: Mobile development
description: Work on the Expo iOS, Android, and mobile web client.
status: current
audience: contributors
owner: maintainers
keywords: mobile, expo, ios, android
last-reviewed: 2026-08-15
---

# Mobile development

The mobile app lives in `mobile/`. It is Expo SDK 55, React Native 0.83, and Expo Router.

```bash
bun run setup
bun run dev:mobile
```

iOS:

```bash
cd mobile
bunx expo prebuild --clean --platform ios
bunx expo run:ios
```

Mock-mode Playwright tests:

```bash
cd mobile
MOCK_BRIDGE=true bunx playwright test
```

Do not commit `mobile/.env`, `mobile/.env.local`, or EAS production values.
