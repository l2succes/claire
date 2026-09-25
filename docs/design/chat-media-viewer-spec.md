# Chat images, video playback, and full-screen viewing

Status: media layout, viewer, playback lifecycle, and streaming/range transport implemented and checked with synthetic fixtures. Original reported failing clips remain unverified.
Date: 2026-09-24.

## Implementation record

- Dedicated image/video previews remove the ordinary message-card padding and fill. Dimensions, sender/reply context, captions, timestamps, reactions, and long-press actions are retained.
- One full-screen viewer handles image fit/zoom/pan/dismissal and an on-demand Expo video player with loading, error/retry, and foreground-only playback.
- The extracted media route streams original files, forwards byte ranges, and uses a bounded disk cache when the homeserver ignores them. The cache is process-local, capped at 256 MiB per file and 512 MiB total, evicts idle entries under pressure, and removes its directory on normal exit. Existing voice conversion remains a separate cached derivative.
- Shared visual-media normalization lives in `packages/chat-core/src/visual-media.ts`. No dependency upgrade or database migration is required.
- Encrypted attachment recovery/decryption and additional video codecs remain conditional follow-ups: no original failing sample has been classified, so the transport correction must not be described as proof that every reported video is fixed.

### Verification results (2026-09-24)

- 50 server/shared-core tests pass: exact bytes, range forwarding and fallback, suffix/open-ended/unsatisfiable requests, validators, HEAD, cache reuse, incomplete-download recovery, bounded downloads, voice derivatives, and media normalization.
- 10 client tests pass: preview sizing/metadata, image retry, selected-media lifecycle, video error/retry, cleanup, and no automatic resume after backgrounding.
- Client/server type checks and targeted lint pass. A real iOS Simulator build succeeded (zero errors).
- Actual Electron app: landscape/portrait previews, full-screen image, double-click zoom, Escape dismissal with focus restoration, and the synthetic video's 12-second playback were observed. The viewer header was adjusted to clear native window controls.
- Actual iOS Simulator: image previews and the synthetic MP4 playing in the full-screen viewer through its final frame were observed. The rebuilt development client was required because the previously installed client crashed in Expo/Hermes startup before loading the screen.
- Automated byte-range tests verify seek transport; interactive scrubbing, pinch/pan, VoiceOver, long-press arbitration, and the full real-conversation regression matrix still need device QA. No physical-device or original failing-video result is claimed.

### Repeatable local smoke check

Run `bun run apps/server/scripts/media-smoke-server.ts` from the repository root (requires FFmpeg), then open `/media-preview?fixture=1` in a development build of the real iOS or Electron app. This development-only screen uses synthetic landscape/portrait images and a 12-second H.264/AAC MP4 whose metadata is at the end. The fixture upstream deliberately ignores ranges, exercising the actual proxy fallback. Tap each attachment, zoom the images, play/seek the clip, close, and background the app. Stop the fixture process afterward to remove its temporary files. No login or bridged message is required.

The findings and acceptance criteria below describe the original problem and intended verification scope.

## Outcome

Images and videos should feel like media in a conversation: a rounded preview without a white or lime frame, and one tap to inspect the attachment full screen. Videos should play reliably, expose useful loading and failure states, and stop when the viewer closes.

The supplied screenshot is the visual regression reference: remove the wide white area beside each image and the surrounding padded card. Preserve sender names, captions, timestamps, replies, reactions, and message actions.

## Findings in the current implementation

| Finding | Evidence | Confidence |
| --- | --- | --- |
| Media is smaller than its enclosing card. | `apps/client/app/chat/[chatId].tsx`: `MediaImage` is 220 × 160; `VIDEO_SURFACE` is 250 × 180. The message press target takes 78% width, and `InjectedBubble` adds a background, border, and padding. | Confirmed cause of the frame shown in the screenshot. |
| Images cannot open a viewer. | `MediaImage` renders a `View` and `Image`, with no tap action. | Confirmed. |
| Video failures have no visible explanation or retry. | `MediaVideoPlayer` mounts `useVideoPlayer(uri)` and `VideoView`, but subscribes to no playback status/error events. | Confirmed. |
| Video delivery waits for the complete upstream file. | `apps/server/src/index.ts`, `/media/:server/:mediaId`: calls `upstream.arrayBuffer()` before responding; does not forward `Range` or preserve partial-response headers/status. | Confirmed transport limitation; contribution to the reported failures needs reproduction. |
| Encrypted file metadata is discarded on the inspected path. | `apps/server/src/adapters/matrix/event-converter.ts` stores `file.url` and `info`, but not the attachment key, IV, or hashes. The media proxy returns raw bytes. | Confirmed gap for encrypted attachments; unknown whether the reported videos use them. |
| Native video support exists in the checkout. | `apps/client/package.json` and `apps/client/ios/Podfile.lock` include Expo Video 55.0.19. | Confirmed locally; the installed TestFlight binary has not been checked. |

Do not attribute the failures to a codec, Expo version, or missing native module without a failing sample. `FeedbackPressable` already resolves its style callback to a static object, so the known NativeWind callback issue is not evidence of a broken video tap target here.

## User experience

### Conversation preview

- Use a dedicated media message variant for incoming and outgoing images/videos. The outer wrapper has transparent fill, no ordinary border, and zero media padding. Keep a focus/highlight outline when needed.
- Fit the preview within 78% of the available conversation width, capped at 360 logical pixels. Use validated source dimensions to preserve aspect ratio; cap height at 420 and reduce width proportionally. The media must not stretch to fill a larger card. Constrain to the conversation pane on desktop, not the window.
- Use a neutral 4:3 placeholder when dimensions are absent. Update from loaded image dimensions and cache that result; preserve the visible message anchor if layout changes. Do not allocate video players merely to measure thumbnails.
- Clip the preview once with the existing control radius. Loading indicators sit inside the reserved preview bounds.
- Render group sender, reply preview, bridge badge, caption, and bridge hint as separate content above/below the media, constrained to its width. They do not add a frame around it. Preserve actual caption text and links under existing caption semantics.
- For captionless media, place the timestamp on a small translucent dark overlay inside the lower corner. With a caption, put it after the caption. Maintain contrast over bright images.
- Video previews show a thumbnail when available, a centered play button, and duration when known. With no thumbnail, show a neutral preview with the same play affordance. No autoplay or player allocation in timeline rows.
- Long press still opens message actions. A completed long press must not also open the viewer. Reactions remain anchored without clipping.

### Full-screen viewer

- A single tap opens a full-screen overlay above headers, composer, and tabs. Keep the conversation mounted and preserve scroll position and draft.
- Use a black backdrop, safe-area-aware Close button, and unobtrusive sender/time context. Fit the full image with `contain`; never crop the full-screen image.
- Images support pinch zoom, pan while zoomed, and double tap to toggle between fit and zoom. Clamp pan to image bounds. Downward swipe closes only at fit scale; Close always works.
- Videos open the same viewer and start following the explicit tap, with play/pause, seek, elapsed time, and duration controls. Display buffering and a useful error/retry state. Preserve video aspect ratio.
- Only one video player may be active. Opening video pauses an active voice note. Closing, changing chat, or backgrounding pauses playback; closing/unmounting releases the player. Returning from the background does not resume automatically.
- Desktop uses a viewport overlay inside Electron, with Escape to close, focus containment, and focus restored to the triggering preview. Mobile supports accessibility dismissal/back and hides underlying controls from accessibility while open. Controls have at least 44 × 44 hit targets.
- First release opens the selected attachment only. Cross-message gallery swiping, saving, sharing, PiP, and background playback are follow-up features.

## Video reliability work

### 1. Reproduce and classify before changing codecs

Collect a small representative set of already-received failing videos and one known-good control. Record platform, app build/runtime, MIME type, container/codec, size, dimensions, duration, player error, and proxy response status/timing. Avoid logging message content, media URLs, tokens, or attachment keys.

Compare each failing original in a native player with the same bytes through Claire's proxy. Check a normal GET, HEAD, and `Range: bytes=0-1`, then seeking near the end. Distinguish network/delivery, unsupported decoding, ciphertext, missing media, and missing native module. Do not send test messages merely to diagnose existing samples.

### 2. Make the proxy serve a seekable representation

Extract the route into `apps/server/src/routes/media.ts` with independently testable transport helpers.

- For unencrypted originals, stream the upstream body with backpressure and abort upstream work on client disconnect. Add explicit timeouts. Preserve correct content type, length when known, validators, status, and range headers.
- Forward single byte ranges and `If-Range`; handle `206` and `416` correctly. Return accurate HEAD metadata without sending a body. Do not label a full upstream response `206`.
- If Synapse ignores ranges, use a bounded disk/object cache of the complete representation and serve actual byte slices from it. Deduplicate downloads; define size limits, eviction, and cleanup. Never buffer arbitrarily large videos in the request process.
- For converted/decrypted representations, resolve byte ranges against the resulting file, never against the original upstream bytes. Cache keys include source identity and derivative version.
- Keep the existing `format=m4a` audio path working and cover it with a regression check. The ordinary video path must not accidentally enter voice conversion.

HTTP range and conditional response behavior should follow [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests).

### 3. Handle encrypted attachments when present

Preserve the full Matrix encrypted-file descriptor, including an encrypted thumbnail descriptor when present, in server-controlled storage. Resolve it through the owning message and verify integrity before exposing decrypted content. Do not send decryption keys in URLs or log them. The client should receive a playable source, not ciphertext.

Any decrypted-media route must authorize access to the owning conversation and use private caching; do not extend the current public immutable cache policy to plaintext private derivatives. Older rows missing descriptors need a targeted repair from their original Matrix event. If recovery is impossible, display an explicit unavailable state.

Matrix attachments require more than their `mxc://` URL to decrypt: see the [Matrix encrypted attachment specification](https://github.com/matrix-org/matrix-spec/blob/main/content/client-server-api/modules/end_to_end_encryption.md).

### 4. Add playback states and evidence-based compatibility fallback

Keep `expo-video`. Subscribe to `statusChange` and surface loading, ready, buffering, and error conditions. Retry recreates/reloads the selected source and resets previous error state; bound any automatic retries. Missing native module, missing attachment, and playback failure need distinct messages.

Use a single player in the viewer rather than switching between separate inline and full-screen players. Expo SDK 55 documents playback events and `fullscreenOptions.enable` if native fullscreen is used: [Expo Video](https://docs.expo.dev/versions/v55.0.0/sdk/video/). Check installed types before selecting props. Any dependency/native configuration change requires a compatible rebuilt binary.

Only add conversion after samples prove a decode/container incompatibility. Prefer remuxing when sufficient; otherwise produce a cached H.264/AAC MP4 derivative with web-friendly metadata placement. Run probing/conversion as bounded background work with concurrency, duration, storage, and timeout limits; expose preparing/ready/failed states. Keep the original. Never repeat conversion on every play request or rely on changing the MIME label to fix invalid bytes.

## Implementation boundaries

| Area | Proposed change |
| --- | --- |
| `apps/client/features/chat/media-message.tsx` | Preview, sender/caption metadata, media-specific bubble layout, actions. |
| `apps/client/features/chat/media-viewer.tsx` | Full-screen shell, image zoom, dismissal, accessibility. Use host-specific files where gestures/focus differ. |
| `apps/client/features/chat/media-video-player.tsx` | Active player, status/error/retry UI and lifecycle. |
| `apps/client/hooks/useChatMediaViewer.ts` | Selected attachment and open/close lifecycle; coordinate voice playback. |
| `packages/chat-core/src/media.ts` and `types.ts` | Typed media descriptor and dimension/duration normalization. |
| `apps/client/app/chat/[chatId].tsx` | Wire media variant and one viewer; remove inline media implementations. Keep unrelated screen refactoring out of this change. |
| Server media route and Matrix converter | Streaming/ranges; retain required metadata; conditional encrypted-media handling. |

Reuse `metadata.mediaInfo` already persisted by Matrix ingestion for width, height, duration, and thumbnail information. Validate finite positive dimensions; treat metadata as optional for existing rows and other platforms. Keep descriptor changes compatible with cached messages. An image loading callback provides a fallback for missing dimensions; codec probing is a server concern.

## Acceptance and verification

1. Recreate the screenshot with captionless/group images: no white/lime frame or unused strip beside the media. Verify portrait, landscape, square, very tall, missing-dimension, captioned, replied-to, reacted-to, and outgoing messages.
2. Tap opens the original attachment above all chat chrome; image fit, zoom, pan, double tap, close, and accessibility dismissal work. Closing returns to the same message and draft. Long press never triggers both actions.
3. Known-good and previously failing video samples play and seek in the real iOS app. Include a large file, portrait clip, clip without audio, tail-position metadata, and encrypted media if present. Test a physical iPhone/TestFlight build for device-specific codec failures as well as Simulator.
4. Slow/offline/404/corrupt sources show a bounded loading state or actionable error. Retry can recover after connectivity returns; a failed image/video does not collapse the row or crash the chat.
5. Opening another attachment, closing, backgrounding, and changing chats stop playback correctly. Scrolling through many videos allocates no timeline players and no hidden audio continues.
6. Server integration tests assert exact byte output and headers for full, bounded, open-ended, suffix, and unsatisfiable ranges; HEAD; upstream ignoring ranges; cancellation; and upstream failure. Decryption tests verify a valid fixture and reject an invalid hash if that path is implemented.
7. Focused client tests cover media layout branches, viewer selection, gesture/action arbitration, and playback state/retry/lifecycle. Test normalization independently with missing/invalid metadata and old cached rows.
8. Verify desktop in the Electron app, including keyboard/focus and returning to the same cached conversation. A browser preview or mocked player does not establish native playback correctness.

Implement transport diagnostics/fixes first, then media layout and viewer, then targeted encrypted/codec remediation based on reproduced samples. Completion requires replaying the failing samples successfully, not merely showing a play button. Any new Lucas bridge-message test follows `docs/testing/lucas-two-device-test-spec.md`.
