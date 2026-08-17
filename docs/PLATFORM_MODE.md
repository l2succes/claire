# Platform mode (`PLATFORM_MODE`) — production configuration (#96)

Claire can route platforms two ways:

- **`matrix`** — the documented production architecture: Synapse + mautrix
  bridges. WhatsApp/Telegram/Instagram all flow through Matrix rooms.
- **`direct`** — native per-platform adapters (whatsapp-web.js, etc.). Useful
  for local development; **not** the intended production path.
- **mock** — `MOCK_BRIDGE=true` replaces all adapters with scripted fixtures
  (tests / demos, no infra).

## Current Railway production decision (audited 2026-08-01)

The `claire` Railway project currently contains the Claire API, Redis, and the
self-hosted Supabase services. It does **not** contain Synapse or any mautrix
bridge services, and the Claire service has no Matrix connection variables.

Until that infrastructure is provisioned, the canonical mode for the existing
Railway environment is therefore explicitly:

```text
NODE_ENV=production
PLATFORM_MODE=direct
```

This is an interim operational decision, not a change to the target
architecture. Do not set `PLATFORM_MODE=matrix` on Railway until Synapse,
mautrix-whatsapp, mautrix-telegram, and mautrix-meta are deployed and the Matrix
variables below are populated. The production warning for direct mode is
intentional: it keeps that architectural debt visible without making the
currently deployable environment unusable.

## The bug this guards against

`PLATFORM_MODE` defaults to `direct`. A production deploy that forgets to set it
boots in direct mode and silently diverges from the Matrix architecture. To
prevent that, config validation now **fails fast in production** when
`PLATFORM_MODE` is unset:

```
PLATFORM_MODE must be set explicitly in production (matrix|direct).
Refusing to default to direct mode. ...
```

## Required configuration

| Mode | Required env |
| --- | --- |
| `matrix` | `MATRIX_HOMESERVER_URL`, `MATRIX_SERVER_NAME`, and (in production) `MATRIX_ADMIN_TOKEN`. `MATRIX_BOT_USER_ID` recommended. |
| `direct` | Per-platform credentials as applicable. |
| mock | `MOCK_BRIDGE=true` (overrides the above). |

`PLATFORM_MODE=matrix` with missing bridge config fails at startup with the list
of missing variables.

## Observability

`GET /health` reports the effective mode:

```json
{ "status": "ok", "platformMode": "matrix", "checks": { "matrix": { "status": "ok" } } }
```

When `PLATFORM_MODE=matrix`, `/health` also validates the Synapse homeserver is
reachable. Direct mode in production additionally logs a prominent startup
warning.

## Recovery

1. Set `PLATFORM_MODE=matrix` (and the Matrix env above) on Railway.
2. Redeploy. Confirm the startup log reads `Initializing platform adapters in
   matrix mode` and `/health` shows `"platformMode": "matrix"` with `matrix: ok`.
3. If a deploy fails startup with a platform-mode error, set the missing
   variable(s) it names rather than removing the guard.
