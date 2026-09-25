# Screen-load benchmark (iOS Simulator)

How Claire's screen load times are measured, so a claim about "feels faster"
can be checked rather than argued.

## What is measured

The app records three marks per screen (`apps/client/services/perf-marks.ts`,
`apps/client/hooks/useScreenLoadMark.ts`):

| Mark | Meaning |
| --- | --- |
| `mount` | the screen's component mounted |
| `first-paint` | the first render with real content, tagged `cache` or `network` |
| `settled` | content is present and no request is in flight |

Plus app-level marks: `auth-resolved`, `splash-hidden`, `reveal-finished`.

`first-paint` is the number the local-first work moves, and it should be
sourced from `cache`. `settled` is when the network refresh finished and is
allowed to be much later. They are kept separate on purpose: a single "loaded"
number hides exactly the gap that matters.

Times are wall-clock (epoch ms). The simulator shares the host clock, so
"process launch to first paint" is a subtraction against the `simctl launch`
timestamp rather than an estimate.

## Running it

Marks are off unless the bundle is built with `EXPO_PUBLIC_PERF_MARKS=1`; the
calls compile to a no-op otherwise, so a normal build carries no cost.

Release is the number that matters. Debug is 2-3x slower and its cold start
includes fetching the bundle from Metro, so use it for relative comparison
only.

```bash
# Release build (embeds the JS bundle; no Metro needed)
cd apps/client
EXPO_PUBLIC_PERF_MARKS=1 xcodebuild -quiet \
  -workspace ios/Claire.xcworkspace -scheme Claire \
  -configuration Release -sdk iphonesimulator \
  -destination 'id=<simulator udid>' build
```

Install the product from DerivedData with `xcrun simctl install`, then:

```bash
bun scripts/perf/bench-ios.ts --label after-release --runs 5
```

The script terminates the app, clears the marks file, launches, waits for the
inbox to settle, and reports medians. Results are written to
`docs/testing/perf/<label>.json`.

The account must be signed in once by hand; the session persists in the app
container across reinstalls of the same bundle id.

## Notes on the environment

- `apps/client/.env.local` decides which API the build talks to. It currently
  points at production, so runs exercise real network latency against a real
  account. `bun run ios:staging` rewrites that file as a side effect of
  `eas env:pull` — don't use it for a benchmark run you intend to compare.
- CocoaPods 1.11.3 on this machine cannot parse the `visionos` key in
  `react-native-safe-area-context`'s podspec. `Pods/` is already installed and
  in sync, so build the workspace directly with `xcodebuild` and skip
  `expo run:ios`, which insists on running `pod install` first.
- `expo run:ios` also needs Node 20+; the default `node` on PATH is 18.
