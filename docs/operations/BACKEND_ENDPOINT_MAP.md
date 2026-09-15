# Backend endpoint map

This is the operational map of the Express API in `apps/server/src/index.ts`.
It describes server-owned routes only; Supabase REST, Auth, Realtime, Storage,
and Matrix are separate services. Production API traffic should use
`https://api.useclaire.co` once its Railway certificate is healthy; the
Railway-generated domain is the break-glass diagnostic endpoint.

## Authentication and conventions

- Most routes require `Authorization: Bearer <Supabase access token>` through
  `requireAuth` and scope every data query to the authenticated user.
- `/healthz` is public liveness. `/health` is the protected dependency/schema
  diagnostic and requires `x-health-check-token` in production.
- `success`/`data` is the normal response envelope. Validation is Zod-based at
  the route boundary; do not call a write endpoint from an automation without
  inspecting its schema in the route file.
- `/seed/*` is mock-only. `/auth/session/create-test` is rejected in production.

## Platform, message, and conversation APIs

| Prefix | Endpoints | Purpose |
|---|---|---|
| `/` | `GET /`, `GET /healthz`, `GET /health` | Service metadata, load-balancer liveness, protected dependency/schema health. |
| `/media` | `GET /media/:server/:mediaId` | Proxies Matrix media after server-side authorization. |
| `/messages` | `GET /`, `/chats`, `/stats`, `/queue/stats`, `/:messageId`, `/:messageId/context` | Inbox data, chat/message lookup, queue/debug statistics, and local conversation context. |
| `/messages` | `POST /send`, `/mark-read`, `/chats/:chatId/read`, `/typing`; `PATCH /chats/:chatId/pin`; `POST`/`DELETE /:messageId/snooze`; `DELETE /:messageId` | Send, read state, typing, pinning, snoozing, and message removal. |
| `/conversations` | `GET /`, `/:chatId/settings`; `PUT /:chatId/category`, `/:chatId/profile` | Conversation feed, per-chat settings, categories, and contact profile updates. |
| `/conversations` | `POST /:chatId/smart-cards`, `/:chatId/smart-cards/:cardId/acted`, `/:chatId/refresh-insights`; `DELETE /:chatId/smart-cards/:cardId` | Generate/manage actionable conversation cards and insights. |
| `/contacts` | `GET /` | Paginated/searchable contact list. |
| `/search` | `GET /` | Unified server-side message/contact search. |
| `/platforms` | `GET /definitions`, `/`, `/:platform/status`, `/interests`; `POST /:platform/interest` | Supported connector catalogue, available adapters, connection status, and user platform interest. |
| `/platforms` | `POST /:platform/connect`, `/:platform/reconnect`, `/:platform/send`; `DELETE /:platform/disconnect`; `GET /:platform/auth/:sessionId`, `/:platform/chats/:sessionId` | Generic bridge lifecycle, authentication state, chat discovery, and sending. |
| `/platforms/instagram` | `POST /login/start`, `/login/submit`, `/login/credentials`, `/login/2fa` | Instagram-specific browser/device login flow. |

## Loops, AI, and automation

| Prefix | Endpoints | Purpose |
|---|---|---|
| `/loops` | `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` | Create, list, inspect, edit, and remove a user-owned loop. |
| `/loops` | `GET /:id/events`, `POST /:id/snooze`, `POST /:id/agent/messages` | Read the evidence timeline, preserve a loop's deadline while snoozing, and ask the scoped read/propose-only agent for help. |
| `/ai` | `POST /responses/generate`, `/responses/feedback` | Draft a reply and record feedback on it. |
| `/ai` | `POST /conversations/explain`, `/analyze/sentiment`, `/analyze/topics`; `GET /group-summary/:chatId` | Explain a conversation and generate bounded analytical summaries. |
| `/ai/assistant` | `GET`/`POST /threads`, `GET`/`DELETE /threads/:threadId`, `POST /threads/:threadId/messages` | Persistent assistant-thread lifecycle. |
| `/ai/assistant` | `GET /conversations/:chatId`, `POST /conversations/:chatId/messages`, `DELETE /conversations/:chatId` | Per-chat assistant context and messages. |
| `/ai` | `POST /search`; `GET /assistant/mention-candidates`, `/assistant/index/status`; `POST /assistant/index` | Retrieval-augmented search, mention suggestions, and assistant-index operations. |
| `/ai` | `GET /analytics`, `/cache/stats`, `/morning-brief`; `DELETE /cache/user` | User analytics, AI cache diagnostics/reset, and the morning inbox brief. |
| `/auto-reply` | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id` | User-owned automatic reply rules. |

## Identity, device, sync, and preference APIs

| Prefix | Endpoints | Purpose |
|---|---|---|
| `/auth` | `GET /confirm`, `/callback`; `POST /login`, `/signup`, `/logout` | Email-confirmation/OAuth handoff HTML and Supabase-backed session actions. |
| `/auth` | `POST /session/create`; `GET /sessions`, `/session/:sessionId/qr`, `/session/:sessionId/status`; `DELETE /session/:sessionId` | Legacy/direct connector session lifecycle and QR auth. |
| `/preferences` | `GET`/`PUT /`, `GET`/`PUT /account` | User and account preferences. |
| `/preferences` | `GET /voice-profiles`, `PUT`/`DELETE /voice-profiles/:language`, `POST /voice-profiles/rebuild` | Per-language writing voice profiles. |
| `/notification-devices` | `PUT /`, `POST /presence`, `DELETE /:deviceId` | Register device tokens, communicate foreground/chat presence, and revoke a device. |
| `/push-tokens` | `POST /` | Legacy Expo push-token registration; new clients should use `/notification-devices`. |
| `/devices` | `GET /readiness`, `GET /`, `POST /`, `POST /:id/rotate-credential`, `DELETE /:id` | Companion-device readiness, enrollment, listing, credential rotation, and revocation. |
| `/devices` | `POST /:id/heartbeat`, `/:id/media/:platformMessageId`, `/:id/events` | Credential-authenticated companion health, media ingestion, and event delivery. |
| `/desktop` | `GET /bootstrap`, `/sync` | Desktop cold-start snapshot and ordered incremental change feed. |
| `/handoffs` | `GET /`, `PUT /self`, `DELETE /:id` | Short-lived cross-device route/draft/assistant handoffs. |
| `/seed` | `GET /fixtures`, `POST /reset` | Mock-environment fixture inspection/reset only. |

## Operating boundaries

- The Claire API should be the only public application surface. Synapse and
  mautrix bridge services remain private Railway services.
- A mobile `POST /notification-devices/presence` returning 404 means the device
  was never registered (or was revoked); it is not a missing route.
- Monitor `/health` with a separate secret and alert on failed schema checks,
  connector health, and database/Redis degradation. `/healthz` only proves the
  process is alive.
- The route inventory is sourced from `apps/server/src/routes/` and the mounts
  in `apps/server/src/index.ts`. Update this document whenever a route module
  or mount changes.
