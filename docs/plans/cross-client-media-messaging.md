# Cross-Client Media Messaging and Playback

## Summary

Claire supports sending images, videos, and voice notes from the Expo client (iOS, Android, and web) and the React Native macOS client. All clients render inline image, video, and audio messages, including media received through iMessage when ingestion provides a stored media URL.

Outbound media is supported for Matrix-backed WhatsApp, Telegram, and Instagram connections. V1 sends exactly one attachment per message; albums, documents, stickers, media editing, transcoding, and background uploads remain follow-ups.

## Mockup library

The mobile and desktop galleries show:

- Inline video states with play, seek, duration, volume, fullscreen, loading, and unavailable treatments.
- Audio/voice bubbles with play/pause, scrubbing, elapsed/total time, and retry affordances.
- Selected image/video previews with captions, remove actions, and upload-ready state.
- Voice recording flow: timer, stop, preview/playback, discard, and send.
- Attachment menus for camera, photo/video library, image/video selection, and voice recording.

Controls use the existing Claire message-bubble and composer visual language.

## Server and Matrix transport

`POST /platforms/:platform/send` keeps the existing JSON text-message contract and additionally accepts `multipart/form-data` with:

- `sessionId`, `chatId`, optional `content`, and optional `replyToMessageId`.
- `mediaKind`: `image`, `video`, or `voice`.
- Optional `width`, `height`, and `durationMs` metadata.
- One `media` file, limited to 25 MiB.

The server validates the detected file signature and accepts bridge-safe JPEG, PNG, WebP, GIF, MP4, MOV, WebM, M4A/AAC, MP3, OGG/Opus, and WebM audio variants. It returns `413` for oversized files and `415` for unsupported or mismatched media while retaining authentication, session ownership, connection, and capability checks.

Matrix uploads emit complete `m.image`, `m.video`, or `m.audio` events with filename, caption/body, MIME type, byte size, dimensions, duration, reply relation, and MXC URL. Voice recordings include the Matrix voice-message flag so bridges can deliver native voice notes. The response includes the Matrix event ID for optimistic-message reconciliation.

The media proxy streams Matrix media, forwards range and cache headers, and supports `GET`, ranged `GET`, and `HEAD` requests for seeking and AV playback without buffering the whole response in server memory.

No database migration is required. Existing `content_type`, `media_url`, `media_mime_type`, `platform_message_id`, and metadata JSON fields remain the storage contract.

## Expo client

- Uses Expo SDK 55 image picker, image manipulation, audio recording/playback, and the existing video player.
- Provides camera, photo/video library, and voice-recording attachment actions with permission handling.
- Normalizes oversized still images where possible and rejects files over 25 MiB before upload.
- Maintains selected-media preview state, captions for image/video, removal, upload state, retry, and optimistic messages keyed by the returned Matrix event ID.
- Voice notes have an independent recording/preview lifecycle and do not clear an existing text draft.
- Audio/video playback is opt-in, supports loading/error/retry and seeking, pauses competing audio, and pauses when the app backgrounds.
- Older builds retain attachment fallbacks when native media modules are unavailable.

## macOS client

- Uses `NSOpenPanel` for one image/video and copies selections into Claire’s cache for stable access.
- Records M4A voice notes through AVFoundation with microphone permission and elapsed-time controls.
- Uses an AVKit-backed native media view for inline video/audio playback and fullscreen/native controls.
- Uses a native URL-session multipart uploader with authenticated progress events so picked/recorded files do not pass through JavaScript as file bytes.
- Composer, optimistic reconciliation, retry, and media rendering match the Expo behavior.

## Verification

Targeted verification covers:

- Text-send compatibility and Matrix image/video/voice event metadata.
- Server, Expo, and macOS TypeScript checks, lint, and Jest/Bun tests.
- macOS CocoaPods integration and unsigned Xcode build.
- Responsive rendering of both mockup galleries at desktop and narrow widths.

Real-stack acceptance remains an environment-dependent step: send a photo, captioned video, and voice note through connected WhatsApp, Telegram, and Instagram bridge sessions and verify native receipt, echo reconciliation, and playback.

## Assumptions

- “All clients” means Expo iOS, Android, and web plus React Native macOS.
- iMessage outbound media remains out of scope.
- Received iMessage media plays when companion ingestion stores a usable media URL.
- Expo and macOS native builds must be regenerated for new permissions and native modules.
