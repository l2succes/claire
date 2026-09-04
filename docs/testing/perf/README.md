# Screen load measurements

Method and definitions: `docs/testing/screen-load-benchmark.md`.

Device: iPhone 17 Pro simulator (iOS 26.0). Account: a real signed-in account
with a 15MB local cache, talking to the production API, so these include real
network latency. Times are milliseconds from `simctl launch`.

## Release, after the local-first work

Median of 5 cold starts (`after-release.json`).

| mark | median | min |
| --- | ---: | ---: |
| auth resolved | 3666 | 3604 |
| home mounted | 3811 | 3737 |
| home first paint | 3811 | 3737 |
| splash hidden | 3830 | 3754 |
| reveal finished | 4347 | 4246 |
| home settled | 4535 | 4374 |

The shape matters more than the totals. Home paints in the same millisecond it
mounts, from cache, and settles 724ms later when the network refresh lands. All
the remaining cold-start cost sat *before* the first screen existed: auth
resolution accounted for 3.6s of it, because the root layout holds the launch
reveal until auth is initialised and the index route renders nothing while it
is loading. That is addressed by exposing the stored session immediately and
refreshing the token behind the paint.

## Navigation, warm

From a single instrumented session (Debug build, so absolute numbers are
inflated; the mount-to-paint delta is the meaningful part).

| transition | mount to first paint | source |
| --- | ---: | --- |
| launch to Home | 2ms | cache |
| Home to Messages | 4ms | cache |

For comparison, before this work the inbox could not paint until an SQLite read
*and* a network round trip had both completed, because the query was gated on
the cache read.

## Caveats

- Run 1 of every batch is discarded: the first launch after an install pays
  one-off costs (container setup, first cache open) that no real user sees
  twice.
- The launch reveal is ~510ms of scripted animation that runs after the splash
  hides. It is included in every number above and is not dead time the app
  could reclaim without shortening the animation further.
