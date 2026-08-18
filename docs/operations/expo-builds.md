# Expo and EAS mobile builds

This is the operator guide for building and privately installing Claire's iOS
and Android apps. Claire uses Expo Prebuild (Continuous Native Generation):
`ios/` and `android/` are generated from `apps/client/app.config.js` and are
not committed.

## Build targets

| Profile | App on device | iOS bundle ID / Android package | Backend environment | Update channel | Distribution |
| --- | --- | --- | --- | --- | --- |
| `development` | Claire Dev | `com.claire.app.dev` | local development | — | development client |
| `staging` | Claire Staging | `com.claire.app.staging` | EAS `preview` / Claire staging | `staging` | private internal build |
| `production` | Claire | `com.claire.app` | EAS `production` / Claire production | `production` | private internal build |
| `production-store` | Claire | `com.claire.app` | EAS `production` / Claire production | `production` | App Store / TestFlight only |

The production and staging apps are deliberately separate apps. Install both
on one phone to switch environments; do not add an in-app server switch to a
distributed binary. That preserves separate authentication callbacks, local
sessions, caches, and backend credentials.

## Prerequisites

From the repository root:

```sh
bun install
cd apps/client
bunx eas whoami
```

Use the `l2succes` Expo account. For iOS internal builds, use the Apple
Developer account that owns team `T74H9G4334`. Keep Apple passwords and
verification codes in the terminal prompt only—never put them in Git, an EAS
environment variable, or chat.

The mobile EAS environments may contain only client-safe values:

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_ENV`

Do not add service-role keys, database passwords, OAuth secrets, 1Password
tokens, or server-only provider credentials to EAS.

## Register an iPhone or iPad

Ad Hoc builds can be installed only on registered devices. Connect the device
or have it available for Apple two-factor authentication, then run:

```sh
cd apps/client
bunx eas device:create
```

Choose the `l2succes` Expo account, the correct Apple Developer team, and
complete Apple verification. Use SMS if the Apple account has no trusted
Apple device. Register a new device before starting its first internal build.

## Create private builds

These commands upload to EAS and create installable iOS Ad Hoc builds; they do
not use TestFlight.

```sh
cd apps/client
bun run build:staging
bun run build:prod
```

For a non-interactive CI or repeat build, use:

```sh
bunx eas build --platform ios --profile staging --non-interactive --no-wait
bunx eas build --platform ios --profile production --non-interactive --no-wait
```

Open the EAS dashboard URL printed by the command, or list recent builds:

```sh
bunx eas build:list --platform ios --limit 10
bunx eas build:view <build-id>
```

When a build is **Finished**, open its EAS build page on the registered iPhone
and select **Install**. The downloaded `.ipa` is for registered devices only.

Use the store profile only when intentionally submitting to TestFlight or the
App Store:

```sh
bunx eas build --platform ios --profile production-store
```

## Publish an over-the-air update

EAS Update is enabled for the staging and production release profiles. It checks
for an update on launch, downloads it in the background, and applies it on the
next app restart. Publish only after the change is committed:

```sh
cd apps/client
bun run update:staging
# Test the staging update, then:
bun run update:production
```

An OTA update can contain JavaScript and assets only. Adding or changing a
native module, permission, app-config plugin, Expo config, or native code
requires a new EAS build instead. Claire uses the Expo app version as its EAS
Update runtime version, so increment `expo.version` in `app.json` before a new
native release; builds only receive updates for their matching runtime.

## Local builds with Prebuild

The local scripts pull the correct EAS public environment, regenerate native
files, and run on a connected iPhone:

```sh
# Claire Staging
bun run ios:staging

# Claire production
bun run ios:prod:device
```

If running Expo manually, set the variant on both Prebuild and run commands.
This matters because an existing generated native project belongs to the
previous variant:

```sh
APP_VARIANT=staging bunx expo prebuild --clean --platform ios
APP_VARIANT=staging bunx expo run:ios -d
```

`prebuild --clean` is safe: the generated directories are ignored by Git.

## Build recovery

| Symptom | Resolution |
| --- | --- |
| `lockfile had changes, but lockfile is frozen` | Run `bun install` from the repository root, commit the updated `bun.lockb` and `yarn.lock`, then verify with `cd apps/client && bun install --frozen-lockfile`. |
| New phone cannot install | Run `bunx eas device:create`, then create a new internal build so its Ad Hoc provisioning profile includes that phone. |
| Apple credentials or profile is invalid | Run an interactive `bun run build:staging` or `bun run build:prod`; select the Claire Apple Developer team and let EAS refresh the profile. |
| Wrong backend opens | Check the profile shown on the EAS build page and the app name on the phone. Rebuild—do not change a distributed app's endpoint at runtime. |
| Build fails | Open the EAS build page and inspect the failed phase. Do not copy build logs containing environment values into tickets or chat. |

## Before TestFlight

Internal Ad Hoc builds can reuse build number `1`, but App Store uploads must
have an increasing iOS build number. Before the first TestFlight submission,
enable EAS remote app-version management and automatic incrementing as
outlined in Expo's app-version guide. Do this as a deliberate release change,
not during an incident or while a build is running.

## References

- [Expo: adopt Prebuild](https://docs.expo.dev/guides/adopting-prebuild/)
- [Expo: install app variants on the same device](https://docs.expo.dev/build-reference/variants/)
- [Expo: internal distribution](https://docs.expo.dev/build/internal-distribution/)
- [Expo: app version management](https://docs.expo.dev/build-reference/app-versions/)
