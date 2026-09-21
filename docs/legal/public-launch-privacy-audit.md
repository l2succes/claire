# Claire public-launch privacy and terms audit

Last reviewed: 2026-09-21

This audit maps the public legal copy to the current codebase. It is product and engineering guidance, not a substitute for advice from counsel in the jurisdictions where Claire will launch.

## What the product currently processes

Claire Cloud is not a metadata-only messenger. The current implementation stores normalized message bodies, sender and contact identifiers, group and participant data, timestamps, reactions, reply references, read state, media URLs, and attachments. It also creates full-text indexes, embeddings, AI questions and answers, citations, suggested replies, smart cards, commitments, contact memories, relationship metrics, voice profiles, and classification results.

Connecting a network can require phone numbers, usernames, pairing codes, verification codes, session identifiers, and network cookies or tokens. Session blobs in Redis are AES-256-GCM encrypted and expire after 24 hours, but active Matrix and bridge credentials can persist until revocation or disconnection. Instagram credential login temporarily handles a username, password, two-factor code, and resulting cookies; pending browser sessions expire after five minutes.

On supported native devices, Claire keeps an encrypted SQLite cache with an account-specific key in the platform secure key store. By default it retains a recent window per chat; users can opt into full offline text history. Signing out and the local-data control remove that device cache. Neither action deletes the server copy.

Other processing includes Google or email authentication, push tokens and notification-delivery records, RevenueCat subscription and credit records, Sentry crash/performance diagnostics when configured, Resend waitlist email, operational telemetry, and website waitlist/referrer data.

## Disclosures the public documents now cover

- Claire imports data about conversation participants who may not be Claire users.
- A connected account authorizes synchronization, indexing, storage, search, sending, and user-enabled automation.
- Disconnecting a network stops the connection but does not erase synchronized history.
- AI features can send selected message text, contact context, and user prompts to OpenAI, Azure OpenAI, or another configured compatible provider.
- Claire stores assistant history, derived memories, embeddings, relationship metrics, and model/usage metadata.
- Connected networks retain their own copies and apply their own terms and privacy policies.
- Message delivery, AI output, history completeness, and long-term third-party integration compatibility are not guaranteed.
- Claire does not sell personal information, use message content for targeted advertising, or train its own general-purpose model on connected conversations.

## Launch blockers that legal copy cannot fix

### 1. Add complete account deletion

The app creates accounts but currently offers sign-out and local-cache deletion only. Add an in-app deletion path and a public web request path. Deletion must revoke bridge sessions, remove Matrix accounts or rooms where appropriate, delete Supabase Auth and user-owned rows, remove stored media, clear Redis sessions, disable push tokens, notify relevant processors, and define what remains in backups or legally required billing/security records. Apple requires apps with account creation to let users initiate deletion in the app; Google Play also requires an in-app path and a functional web deletion resource.

Official references:

- [Apple: Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app)
- [Google Play: Account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)

### 2. Add the controller address and governing jurisdiction

LS Studio, Inc. is now identified as the operator, contracting party, and controller in the public documents. Before public launch, add its complete postal address and confirm that the legal name matches the App Store, Google Play, payment, incorporation, and tax records. Select governing law and venue with counsel. GDPR Article 13 requires the controller's identity and contact details.

Official reference: [GDPR, Articles 13 and 14](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02016R0679-20160504)

### 3. Define and enforce a retention schedule

Supabase message, contact, media, assistant, embedding, and derived-memory tables do not have a general user-data purge schedule. Synapse is configured with a one-year maximum event lifetime, operational telemetry with 30 days, and incidents/audit events with 365 days, but those do not delete the duplicate application records. Decide and implement retention periods for active accounts, disconnected accounts, deleted messages, media, embeddings, AI history, logs, waitlist records, billing records, and backups. The policy must be updated if the final schedule differs from the current description.

### 4. Protect message media before launch

The current direct-ingestion path writes media to a public Supabase Storage URL, and the Matrix media proxy is unauthenticated with a long-lived public cache header. The repository security audit already treats both as production blockers. Move media behind authenticated or short-lived signed URLs, verify chat ownership on every fetch, and add deletion and cache-expiry behavior.

### 5. Record legal acceptance

The onboarding screen links the Terms and Privacy Policy but does not persist the accepted document versions, acceptance timestamp, locale, or the user action that created assent. Store those fields at account creation and ask existing users to accept material updates. Keep consent for optional marketing and optional AI processing separate where required.

### 6. Add data export and a privacy-request workflow

Settings says “Export, retention, and delete,” but the current screen only controls the local cache. Add authenticated export, correction, and account-deletion requests; identity verification; request status; deadlines; and an operator runbook. Provide a web route for people who no longer have the app. Requests concerning non-user conversation participants need a verification and balancing procedure that does not expose another user's account.

### 7. Complete the processor and transfer inventory

Confirm the production entities, regions, contracts, and retention settings for hosting, database/storage, backups, OpenAI, Azure OpenAI or other model providers, Sentry, Expo/APNs/FCM, RevenueCat, Apple, Google, Resend, and any email/auth provider. Execute data-processing agreements where needed and document subprocessor changes. For EEA/UK transfers, confirm an adequacy decision, standard contractual clauses, or another valid mechanism.

Official reference: [European Commission: international data transfers](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/rules-international-data-transfers_en)

### 8. Tighten client diagnostics

The server strips request bodies, exception messages, and breadcrumb details before sending Sentry events. The client currently initializes Sentry without an equivalent `beforeSend` scrubber. Add client-side redaction, disable screenshots and session replay unless separately reviewed and disclosed, and verify that message bodies, contact names, search text, deep links, and credentials never enter diagnostics.

### 9. Add just-in-time connection and AI notices

Before a user links each network, explain what is imported, that other participants' data is involved, what credentials are handled, and what disconnecting does. Before enabling AI over chat history, show the provider-processing boundary, searchable scope, stored derived data, deletion controls, and whether the feature is on by default. The long-form policy should support these decisions, not carry them alone.

### 10. Complete store disclosures and age handling

App Store privacy details and Google Play Data Safety answers must cover identifiers, contacts/social graph, text messages, photos/video, audio, diagnostics, purchases, and derived data. The product is now stated to be for adults, but Terms alone do not resolve actual knowledge that a child is using the Service. Decide whether to age-screen or implement a verified response and deletion process.

Official references:

- [Apple: App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [FTC: Children's Online Privacy Protection Rule](https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa)

## Policy maintenance

Review the public documents whenever Claire adds a network, changes an AI provider, introduces a new data category, changes retention, enables a write automation, moves infrastructure regions, begins advertising, or changes the legal operator. Keep the effective date and an archived copy of each version. California guidance calls for a privacy policy that describes categories collected, sources, purposes, disclosures, and consumer rights; the current policy is organized around those elements.

Official reference: [California Privacy Protection Agency: required notices](https://cppa.ca.gov/pdf/general_notices.pdf)
