# Claire live observability implementation plan

**Status:** in progress — first production-safe vertical slice implemented in this repository.

## Outcome

Give operators a live, privacy-preserving answer to: *are messages flowing from each connected provider through Claire and back to clients?* The console must diagnose a broken stage without becoming a tool for viewing customer conversations.

## Non-negotiable privacy contract

The telemetry event schema is allowlisted. It stores only a rotating HMAC trace reference, a rotating HMAC account reference, platform, direction, stage, outcome, timing, retry count, and a bounded error class. It must never accept or render message bodies, attachments, contact information, provider credentials, Matrix event IDs, raw payloads, or free-form logs.

The dashboard calls authenticated server APIs; it does not receive database access or raw infrastructure logs. Its activity is audited.

## Live architecture

```text
Provider / bridge → Matrix → Claire API → Postgres → Supabase Realtime → client acknowledgement
                         │                    │               │
                         └──── telemetry events + redacted operational journal ────→ Operations Console
```

The first release records the stages Claire can honestly observe today: API acceptance, durable database persistence, outbound notification outcomes, and client Realtime state. Bridge/Synapse state remains measured through the existing health probes. The UI explicitly calls out an uninstrumented stage instead of treating it as success.

## Delivery sequence

1. **Foundation (this implementation):** migration-backed operational event journal, API/message persistence instrumentation, notification outcomes, client Realtime signals, authenticated aggregate API, and an auto-refreshing console with platform traffic, stage lag, and redacted events.
2. **Bridge and Matrix adapters:** emit bridge accepted/rejected and Matrix ingress/egress events from mautrix/Synapse adapters; connect them with the short-lived trace reference.
3. **End-to-end delivery:** add a client cursor/ack protocol tied to a message trace, then report provider→client latency and synthetic canaries per platform/account.
4. **Infrastructure and capacity:** import provider/host metrics (CPU, memory, queue age, DB connections, Redis eviction) via OpenTelemetry/Prometheus; configure SLO alerts and dashboard links.
5. **Controlled recovery:** guarded reconnect/replay/restart actions with reason, confirmation, rate limits, owner/operator roles, audits, and runbooks.

## Data retention and alerting

- Keep raw metadata events for 30 days, minute aggregates for 90 days, and incident/audit history for 365 days.
- Alert on stage freshness loss, stage failure rates, retry growth, disconnected sessions, notification failures, telemetry silence, canary failure, and sustained capacity saturation.
- Treat the monitor itself as a dependency: a stale telemetry heartbeat is an incident, not a green dashboard.

## Acceptance criteria

- A console user can see live platform traffic, per-stage success/failure, p95 timings, recent sanitized event lines, health probes, and active client signals without seeing chat data.
- Tests prove unapproved attributes cannot enter the telemetry table or API response.
- A missing message path stage is displayed as `not instrumented`, never inferred as delivered.
- Dashboard telemetry and direct database aggregates agree for a selected window.
