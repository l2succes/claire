# Claire launch video

Short, punchy product videos for Claire, authored as HTML and rendered to MP4
with [HyperFrames](https://github.com/heygen-com/hyperframes). Each folder is a
self-contained HyperFrames project; `index.html` is the whole composition
(timing, layout and one GSAP timeline).

| Project | Canvas | Product surface |
| --- | --- | --- |
| `desktop/` | 1920×1080, 38s | Desktop screens from `apps/website/public/mockups/desktop-mockups.html` |
| `mobile/` | 1080×1920, 40s | Phone screens from `apps/website/public/mockups/app-mockups.html` |

## Story

1. **Hook** — notifications stack up while the caption swaps "Your people are on
   WhatsApp / Telegram / Instagram / iMessage / Slack" → "everywhere."
2. **Meet Claire** — the logo draws on the app icon, which zooms to fill the frame.
3. **Inbox + promise** — "Every chat, in one inbox." The cursor opens Maya, the
   thread builds, Claire finds the promise, the cursor clicks Track and it lands
   in the context panel: "Claire keeps track."
4. **Ask Claire** — a question is typed and answered with context: "answered from
   every chat."
5. **Connections** — cards pop in as the caption cycles networks, then four
   screens fan out: "It all lives together."
6. **Close** — pixel dissolve to lime, "All your chats. One AI.", wordmark, dark end
   card with `useclaire.co`.

### Mobile cut

Same arc, but one phone carries the whole middle: tap Maya → the chat pushes in
and Claire finds the promise → tap Track → back to the inbox and the Promises
tab → the Search tab, where Claire answers "What did Maya say about launch
timing?" from three conversations → connected accounts → a 2×2 grid of phones
("It all lives together"). Taps are shown as a touch indicator rather than a
cursor. Screens push inside the phone's viewport while the bezel and status bar
stay put.

## Render

Requires Node 22+ and FFmpeg.

```bash
cd marketing/launch-video/desktop   # or mobile
npx hyperframes check     # lint + runtime + layout + motion + contrast
npx hyperframes render --output renders/claire-launch.mp4
```

If HyperFrames' bundled headless Chrome fails to start (`Unknown system error
-88` from `npx hyperframes doctor`), point it at an installed Chrome:

```bash
export HYPERFRAMES_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

`renders/` and `snapshots/` are git-ignored.

## Product screens

In both projects, `assets/ui/` holds screenshots of the website mockups: for each screen a
`*-base.png` with the animated parts hidden, plus every animated part on its
own (`uw-b1.png`, `ak-sug.png`, …). The video places each part at its measured
position and animates it, so the UI builds up over the real screen.

After the mockups change, regenerate them and paste the printed positions into
`index.html` (desktop: the `UW` / `AK` / `CN` tables; mobile: `LAYOUT`):

```bash
(cd apps/website/public && python3 -m http.server 8765 --bind 127.0.0.1) &
node marketing/launch-video/desktop/scripts/capture-ui.cjs marketing/launch-video/desktop/assets/ui
node marketing/launch-video/mobile/scripts/capture-ui.cjs marketing/launch-video/mobile/assets/ui
```

The scripts load `puppeteer-core` from the repo's `node_modules`; in a checkout
without it, point `PUPPETEER_CORE` at another copy. The mobile status bar
(`mobile/assets/ui/status.png`) is a crop of `ib-base.png`
(`ffmpeg -i ib-base.png -vf crop=1474:195:30:30 status.png`).

## Audio

Sound effects only (HyperFrames' bundled library in `assets/sfx/`). There is
no music bed yet; add one as an `<audio>` element on the root and retime the
scene boundaries to its beats.

Fonts are Inter, Public Sans and DM Mono from `apps/client/assets/fonts`
(OFL); platform marks are from `apps/website/public/assets/platforms`.
