# Claire security claims and validation roadmap

This document defines what Claire may say publicly about security, and the
evidence required before stronger statements are published.

## Claims we can make today

- Claire requires authenticated account access for private application routes.
- The production API uses security headers, an origin allowlist, and separate
  rate limits for authentication and AI endpoints.
- Claire Cloud synchronizes normalized message data to provide the unified
  inbox, search, and AI features.
- Connected networks still process original messages under their own security
  models. When an AI feature is invoked, selected context may be sent to the
  configured AI provider.
- Self-hosting puts the existing stack on infrastructure the user controls,
  but is not equivalent to an offline or local-only guarantee.

## Claims we must not make today

- Claire is end-to-end encrypted.
- Claire is zero knowledge.
- Claire never stores messages in the cloud.
- All message data stays on a desktop computer.
- Provider credentials are encrypted in production before the encrypted secret
  store is implemented and verified.

Mautrix supports optional end-to-bridge encryption, but it requires explicit
bridge configuration and testing. It is not a blanket product property of any
application that uses mautrix. See the [mautrix encryption
guide](https://docs.mau.fi/bridges/general/end-to-bridge-encryption.html).

## Gates for future claims

### End-to-end encryption

Before Claire claims end-to-end encryption for any supported flow:

1. Enable and enforce the applicable bridge encryption settings in production.
2. Test encrypted send, receive, media, device verification, recovery, and
   bridge restart behavior for every named connector.
3. Publish the precise scope: which devices, networks, bridges, and metadata
   are or are not covered.
4. Complete an independent implementation and threat-model review.

### Private desktop-only mode

Before saying message data stays local:

1. Prove through outbound-network tests that messages, media, indexes,
   embeddings, logs, notification bodies, and credentials cannot reach Claire
   services.
2. Enforce local storage, local search, and local AI (or disabled AI), with
   telemetry disabled.
3. Verify offline export, deletion, recovery, sleep/restart behavior, and the
   limits of mobile access.
4. Review production binaries, not only development configuration.

### Bring your own AI provider key

Before describing a provider key as encrypted:

1. Store cloud keys in an encrypted secret store and local keys in the native
   operating-system credential store.
2. Ensure keys never enter React state, analytics, application logs,
   AsyncStorage, ordinary database rows, crash reports, or URL parameters.
3. Test redaction, key rotation, revocation, and disconnect cleanup.

## Copy review checklist

- Use "end-to-end encrypted" only for a tested and explicitly scoped flow.
- Describe the AI data boundary beside every AI-related plan or feature.
- State whether a feature is current, planned, or in development.
- Do not imply that self-hosted means offline, private desktop-only, or free of
  external network processing.
- Re-review security copy with every material change to bridge, hosting, AI,
  analytics, credential, or telemetry behavior.
