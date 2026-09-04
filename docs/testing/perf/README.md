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

## What was changed, in order of measured impact

1. **Auth no longer blocks the first render.** Initialisation awaited a token
   refresh, and the root layout holds the launch reveal until it finishes. This
   was 3.6s of the cold start, with every screen behind it already able to
   paint from cache in single-digit milliseconds.
2. **The inbox no longer gates its network query on the cache read.** It held
   `enabled: false` until SQLite answered, and re-ran that on every keystroke
   because the query key was part of the effect's dependencies.
3. **Cold-start sync moved behind the first paint.** A bootstrap, up to twenty
   sync pages, and nine parallel 200-message prefetches all ran against the
   same SQLite file the inbox was reading.
4. **The launch reveal went from ~1.65s to ~510ms.** It was longer than the
   work it was covering.
5. **The bootstrap endpoint stopped fetching every message ever received** to
   compute per-chat previews.
6. **Realtime writes through to the cached conversation rows,** so a cold start
   shows current previews rather than ones as old as the last foreground sync.
7. **Render costs**: memoised inbox rows, one pass over the loops instead of
   six, one reversed pass over a chat timeline instead of four, and a People
   sort that computes each name once instead of twice per comparison.

## Not done

- FlashList on the People and inbox lists. The single-pass sort removed the
  dominant cost; swapping the list implementation should be justified by a
  measurement of scroll performance, which this round did not take.
- Gzip on the sync endpoints: it needs new server dependencies, and the payload
  it was meant to shrink is no longer large.
- A before/after A/B on the same build. The numbers here are the "after" state
  plus the specific costs identified in the code; producing a true baseline
  means building the pre-work commit with instrumentation added.
