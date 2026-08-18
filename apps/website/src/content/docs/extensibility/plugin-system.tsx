// SPDX-License-Identifier: Apache-2.0
import { C, Code, Diagram, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Plugin system specification",
  description: "The declarative plugin model, permissions, approvals, execution, and audit trail.",
  section: 'extensibility',
  status: 'draft',
  lastReviewed: '2026-08-17',
  order: 2,
  roadmap: {
    status: 'planned',
    summary: "Public plugin review, declarative permissions, and a marketplace for safe extensions.",
  },
  hero: { kind: 'mockup', surface: 'plugins', screen: 'automation-builder', caption: 'The automation builder: trigger → action → approval' },
  related: ['/docs/extensibility/plugins', '/docs/product/security'],
};

export default function Page() {
  return (
    <Doc>
      <Section id="product-summary" title="Product summary">
      <P>Claire Plugins connect conversation context to external services. A plugin may supply read-only context, expose typed actions, or participate in user-configured automations. The first flagship flow is Calendar: when a conversation reaches a clear agreement on a date and time, Claire prepares an event and asks the user to review it.</P>
      <P>The system is not an unrestricted extension runtime. Plugins are declarative packages executed through a Claire-controlled gateway. The gateway validates every input, enforces account and conversation scopes, requests approval where required, redacts data, executes the action, and records an immutable receipt.</P>
      <P>The product has five surfaces:</P>
      <ol>
              <li><b>Library</b> — discover verified, community, and private workspace plugins.</li>
              <li><b>Plugin detail</b> — understand capabilities, publisher, data handling, permissions, and pricing before installation.</li>
              <li><b>Automation builder</b> — configure trigger, conversation scope, action, destination, and approval policy.</li>
              <li><b>Approval inbox</b> — review the exact action and data before a sensitive write.</li>
              <li><b>Activity</b> — inspect, retry, undo, disable, or revoke every action.</li>
            </ol>
      <P>The UI reference is the <a href="/mockups/plugins">public plugin mockups</a>.</P>
      </Section>
      <Section id="product-principles" title="Product principles">
      <ul>
              <li><b>Detection is not permission.</b> Finding a date in a message never authorizes an event creation.</li>
              <li><b>Account access and conversation access are separate grants.</b> Connecting Google Calendar does not expose every Claire chat to Calendar.</li>
              <li><b>Minimum context by default.</b> Send structured fields derived by Claire when possible, not raw transcripts.</li>
              <li><b>Sensitive writes require review.</b> Invites, outbound messages, payments, deletions, and public publishing always require approval in v1.</li>
              <li><b>No silent privilege expansion.</b> New manifest scopes or materially changed behavior pause the plugin until reapproved.</li>
              <li><b>Every action has provenance.</b> Store the initiating event, relevant source messages, actor, inputs, result, and approval.</li>
              <li><b>Automation must remain reversible.</b> Users can disable a rule, disconnect an account, revoke credentials, and undo an action when the provider supports it.</li>
              <li><b>Self-hosting remains real.</b> Community deployments can use local/private plugins without routing message content through Claire Cloud.</li>
            </ul>
      </Section>
      <Section id="initial-catalog-and-delivery-order" title="Initial catalog and delivery order">
      <Section id="first-party-launch-plugins" title="First-party launch plugins" level={3}>
      <Table
              head={[<>Plugin</>, <>Context</>, <>Actions</>, <>Default approval</>]}
              rows={[
                [<>Calendar</>, <>Free/busy, calendars</>, <>Draft/create/update event</>, <>Ask for create/update</>],
                [<>Tasks</>, <>Projects, assignees</>, <>Create/complete task</>, <>Ask for create; optional auto-run for private tasks</>],
                [<>Notes</>, <>Pages/databases</>, <>Save decision or summary</>, <>Ask for shared destinations</>],
                [<>Reminders</>, <>None</>, <>Create personal reminder</>, <>Optional auto-run</>],
                [<>Contacts</>, <>Existing contact fields</>, <>Propose contact update</>, <>Ask every time</>],
              ]}
            />
      <P>Calendar adapters should initially support Google Calendar, Microsoft Outlook, and CalDAV behind one Claire capability model.</P>
      </Section>
      <Section id="wave-2" title="Wave 2" level={3}>
      <ul>
              <li>HubSpot and Salesforce: log conversation, create follow-up, update deal note.</li>
              <li>Google Drive, Dropbox, and Notion search: retrieve user-selected knowledge and share a link.</li>
              <li>Slack and Teams: prepare a message or summary; sending always requires approval.</li>
              <li>GitHub and Linear: create issue, add comment, or associate a conversation source.</li>
              <li>Webhooks: outbound signed POST for advanced self-hosters; disabled in Claire Cloud until abuse controls exist.</li>
            </ul>
      </Section>
      <Section id="explicit-v1-exclusions" title="Explicit v1 exclusions" level={3}>
      <ul>
              <li>Arbitrary third-party JavaScript running inside the Claire server or client.</li>
              <li>Plugins drawing unrestricted custom UI inside a message thread.</li>
              <li>Background outbound messaging without review.</li>
              <li>Payments, purchases, account deletion, or destructive administration.</li>
              <li>Marketplace payments or revenue share. The catalog may show free/private plugins first.</li>
            </ul>
      </Section>
      </Section>
      <Section id="plugin-package-contract" title="Plugin package contract">
      <P>Each plugin is versioned and identified by an immutable reverse-domain ID. The signed manifest is stored in the registry and snapshotted into every installation.</P>
      <Code lang="ts">{"type ClairePluginManifest = {\n  schemaVersion: '1';\n  id: string; // e.g. com.claire.calendar\n  version: string; // semver\n  name: string;\n  description: string;\n  publisher: {\n    id: string;\n    name: string;\n    verification: 'claire' | 'verified' | 'community' | 'private';\n    website: string;\n    privacyPolicyUrl: string;\n    supportUrl: string;\n  };\n  icon: { lightUrl: string; darkUrl?: string; sha256: string };\n  runtime: {\n    kind: 'claire_adapter' | 'remote_mcp' | 'private_mcp';\n    endpointRef?: string;\n    minimumClaireVersion?: string;\n  };\n  auth: Array<{\n    id: string;\n    type: 'oauth2' | 'api_key' | 'none';\n    provider: string;\n    requestedScopes: string[];\n  }>;\n  capabilities: Array<{\n    id: string;\n    kind: 'context' | 'action';\n    title: string;\n    description: string;\n    inputSchema: JsonSchema;\n    outputSchema: JsonSchema;\n    risk: 'read' | 'low_write' | 'external_write' | 'destructive';\n    approval: 'never' | 'configurable' | 'always';\n    reversible: boolean;\n    idempotency: boolean;\n  }>;\n  triggers: Array<{\n    id: string;\n    event:\n      | 'message.received'\n      | 'message.sent'\n      | 'loop.detected'\n      | 'loop.updated'\n      | 'loop.resolved'\n      | 'schedule.detected'\n      | 'manual';\n    supportedActions: string[];\n  }>;\n  dataHandling: {\n    receivesRawMessages: boolean;\n    retention: 'none' | 'transient' | 'provider_policy';\n    regions?: string[];\n  };\n};"}</Code>
      <P>Manifests are data, not executable code. JSON schemas are compiled and cached by the server. Unknown fields are rejected. The registry rejects mutable asset URLs without a content hash.</P>
      <Section id="runtime-types" title="Runtime types" level={3}>
      <ul>
              <li><C>claire_adapter</C>: first-party TypeScript adapter deployed with the Bun server and reviewed with Claire code.</li>
              <li><C>remote_mcp</C>: verified HTTPS MCP server, proxied through the plugin gateway. Use OAuth 2.1 with PKCE and resource/audience binding. Never pass provider tokens through to an MCP server that is not their intended audience.</li>
              <li><C>private_mcp</C>: workspace-configured server for self-hosted or enterprise use. It is clearly labeled unverified and disabled from automatic actions until an administrator approves its tools.</li>
            </ul>
      <P>Vercel AI SDK tools may be the internal model-facing adapter because they provide typed schemas and tool approval primitives. The durable Claire approval record—not an in-memory model loop—remains authoritative. MCP is best used for private/user-supplied tools; first-party production plugins should use controlled Claire adapters for type, latency, version, and security guarantees.</P>
      </Section>
      </Section>
      <Section id="permissions-and-approval-model" title="Permissions and approval model">
      <Section id="independent-permission-dimensions" title="Independent permission dimensions" level={3}>
      <P>An installation is not active until all applicable dimensions are chosen:</P>
      <ol>
              <li><b>External account</b> — provider account and OAuth scopes.</li>
              <li><b>Claire context</b> — no messages, current chat, selected people/chats, or workspace-wide metadata. Workspace-wide raw-message access is unavailable in v1.</li>
              <li><b>Capability</b> — individual actions, such as <C>calendar.events.create</C>, not a single plugin-wide switch.</li>
              <li><b>Execution policy</b> — manual only, suggest, ask every time, or auto-run where eligible.</li>
              <li><b>Destination</b> — specific calendar, project, database, team, or repository.</li>
            </ol>
      </Section>
      <Section id="approval-rules" title="Approval rules" level={3}>
      <Table
              head={[<>Risk</>, <>Examples</>, <>v1 policy</>]}
              rows={[
                [<>Read</>, <>Free/busy, selected file search</>, <>Explicit install/scope consent; no per-call approval unless sensitive</>],
                [<>Low write</>, <>Private reminder, private task</>, <>Ask by default; user may enable auto-run per automation</>],
                [<>External write</>, <>Invite guest, send message, shared note, CRM update</>, <>Always ask</>],
                [<>Destructive</>, <>Delete event, close account, delete external data</>, <>Always ask plus destructive confirmation; generally unavailable to automation</>],
              ]}
            />
      <P>The approval UI shows plugin, external account, action, destination, exact structured payload, source messages, data leaving Claire, and whether an undo is available. Approval is bound to a hash of that payload. Any post-approval mutation invalidates it.</P>
      </Section>
      </Section>
      <Section id="conversation-trigger-pipeline" title="Conversation trigger pipeline">
      <Diagram>{"flowchart LR\n  A[\"Normalized Matrix message\"] --> B[\"Event outbox\"]\n  B --> C[\"Trigger matcher\"]\n  C --> D[\"Structured signal detector\"]\n  D --> E[\"Policy and scope engine\"]\n  E --> F[\"Proposed action\"]\n  F -->|approval required| G[\"Approval inbox\"]\n  F -->|eligible auto-run| H[\"Execution queue\"]\n  G -->|approved payload hash| H\n  H --> I[\"Plugin gateway / adapter\"]\n  I --> J[\"External provider\"]\n  I --> K[\"Immutable activity receipt\"]"}</Diagram>
      <ol>
              <li>Message ingestion completes normally and writes a transactional outbox event. Plugin processing must never block Matrix ingestion.</li>
              <li>The matcher loads enabled automations for that user and event type, then enforces conversation scope before inference.</li>
              <li>A deterministic/AI detector emits a typed signal such as <C>schedule.detected</C> with confidence, participants, time zone evidence, and message references.</li>
              <li>The policy engine rejects ambiguity, duplicate actions, missing permissions, expired credentials, and unsupported risk policies.</li>
              <li>Claire stores a proposed action with a normalized payload and idempotency key. Raw message content is excluded unless the target capability explicitly requires it.</li>
              <li>The user approves, edits, rejects, or ignores the proposal. Editing produces a new payload hash.</li>
              <li>A worker leases the action, resolves the credential reference, executes through an adapter, and writes the receipt. Retries use the same idempotency key.</li>
            </ol>
      <Section id="calendar-detection-requirements" title="Calendar detection requirements" level={3}>
      <P>The detector must distinguish proposal from agreement. “How about Tuesday?” does not trigger; “Tuesday at 10 works—see you then” can trigger. It must resolve participants, locale, time zone, duration, and calendar destination. Missing time zone or conflicting times produce a draft requiring correction, never a guessed auto-run.</P>
      <P>Deduplicate by automation, chat, participant set, normalized start time, and source-message window. Edits or cancellations in later messages may propose an update to the original event by stored external object ID.</P>
      </Section>
      </Section>
      <Section id="data-model" title="Data model">
      <P>Add the following workspace/user-owned tables with RLS:</P>
      <ul>
              <li><C>plugin_registry_entries</C>: signed manifest, review status, current version, publisher.</li>
              <li><C>plugin_installations</C>: user/workspace, plugin/version snapshot, status, installed_by, configuration.</li>
              <li><C>plugin_accounts</C>: installation, provider, display metadata, credential reference, granted scopes, health. No tokens in Supabase rows.</li>
              <li><C>plugin_context_grants</C>: installation, scope type, selected chat/contact IDs, expiration.</li>
              <li><C>plugin_capability_grants</C>: capability, approval policy, destination constraints.</li>
              <li><C>plugin_automations</C>: trigger, detector config, capability/action, enabled state, version.</li>
              <li><C>plugin_action_proposals</C>: source event/message refs, structured input, confidence, payload hash, status, expiry.</li>
              <li><C>plugin_approvals</C>: proposal, actor, decision, payload hash, device, timestamp.</li>
              <li><C>plugin_executions</C>: proposal/manual invocation, idempotency key, lease, attempts, result/error class, external object reference.</li>
              <li><C>plugin_activity_receipts</C>: append-only user-facing record with redacted inputs/result and undo metadata.</li>
              <li><C>plugin_event_outbox</C>: durable ingestion events and processing cursor.</li>
            </ul>
      <P>Credential values live in the existing future encrypted secret store for Cloud and Keychain/Docker secrets for local deployments. Tables store opaque references only. Activity rows must never contain access tokens, authorization codes, cookies, raw provider errors, or entire conversation transcripts.</P>
      </Section>
      <Section id="service-architecture" title="Service architecture">
      <P>Add a <C>server/src/plugins/</C> boundary containing:</P>
      <ul>
              <li><C>registry/</C>: manifest validation, signatures, version compatibility, publisher trust.</li>
              <li><C>gateway/</C>: normalized capability invocation, timeout, egress allowlist, response size limits.</li>
              <li><C>adapters/</C>: first-party Calendar/Tasks/Notes providers.</li>
              <li><C>triggers/</C>: outbox consumers and signal detectors.</li>
              <li><C>policy/</C>: context grants, capability grants, risk classification, approval enforcement.</li>
              <li><C>workers/</C>: proposal, execution, retry, credential-health, and undo queues.</li>
              <li><C>audit/</C>: redaction and append-only receipt creation.</li>
            </ul>
      <P>Reuse Redis-backed queues if the current message queue infrastructure proves durable enough; otherwise use Postgres leasing (<C>FOR UPDATE SKIP LOCKED</C>) so self-hosted deployments do not require another service. In either case, the database is the state authority and Redis is not the only copy of a proposal or execution.</P>
      <P>All model tool calls pass through <C>PluginPolicyEngine.authorize()</C>. The model can propose an action but cannot call an adapter directly. Tool descriptions and remote MCP metadata are untrusted inputs and never override the manifest risk classification.</P>
      </Section>
      <Section id="api-surface" title="API surface">
      <P>All endpoints require the existing authenticated user context and enforce RLS-equivalent ownership in server code.</P>
      <Code lang="text">{"GET    /api/plugins\nGET    /api/plugins/:pluginId\nPOST   /api/plugins/:pluginId/install\nPATCH  /api/plugin-installations/:id\nDELETE /api/plugin-installations/:id\n\nPOST   /api/plugin-installations/:id/accounts/authorize\nGET    /api/plugin-oauth/callback/:provider\nDELETE /api/plugin-accounts/:id\n\nGET    /api/plugin-automations\nPOST   /api/plugin-automations\nPATCH  /api/plugin-automations/:id\nPOST   /api/plugin-automations/:id/test\nDELETE /api/plugin-automations/:id\n\nGET    /api/plugin-actions?status=pending\nGET    /api/plugin-actions/:id\nPOST   /api/plugin-actions/:id/approve\nPOST   /api/plugin-actions/:id/reject\nPOST   /api/plugin-actions/:id/retry\nPOST   /api/plugin-actions/:id/undo\n\nGET    /api/plugin-activity\nGET    /api/plugin-activity/export"}</Code>
      <P>OAuth start responses return an authorization URL and signed, short-lived state. Mobile uses an HTTPS universal link callback; desktop uses an HTTPS or loopback callback with PKCE. The server validates exact redirects, issuer, state, nonce where applicable, token audience, and scopes before persisting a credential reference.</P>
      <P>Realtime publishes proposal status and activity receipt changes to the user. The clients never receive provider refresh tokens.</P>
      </Section>
      <Section id="client-behavior" title="Client behavior">
      <Section id="shared-navigation" title="Shared navigation" level={3}>
      <P>Plugins live under Settings/More in the mobile app and as a standard destination in the expanded desktop rail. Do not add a sixth primary mobile tab. Contextual proposals appear inside chat as Claire cards and in Home under “Needs your approval.”</P>
      </Section>
      <Section id="required-screens" title="Required screens" level={3}>
      <ul>
              <li>Library with categories, search, installed filter, publisher trust, and hosting compatibility.</li>
              <li>Plugin detail with capabilities, screenshots/example flow, data handling, permissions, and version history.</li>
              <li>Install wizard: account → conversation scope → capabilities → default approval → confirmation.</li>
              <li>Automation list and builder.</li>
              <li>Approval detail with editable payload and source evidence.</li>
              <li>Activity, execution receipt, failure recovery, and undo.</li>
              <li>Connected account health and reauthentication.</li>
              <li>Plugin settings, disable, uninstall, delete plugin data, and revoke account.</li>
            </ul>
      <P>Desktop provides the full automation builder. Mobile v1 supports enabling templates and editing scope/destination/approval; complex conditional rules open a simplified sequence rather than a canvas.</P>
      </Section>
      </Section>
      <Section id="failure-privacy-and-abuse-controls" title="Failure, privacy, and abuse controls">
      <ul>
              <li>Credentials expire: pause affected automations, surface reauthentication, and retain proposals without retry storms.</li>
              <li>Provider outage/rate limit: exponential backoff with jitter; show delayed state; never duplicate a write.</li>
              <li>Plugin timeout or malformed response: quarantine repeated failures and preserve a redacted diagnostic ID.</li>
              <li>Scope removed: immediately block new proposals and executions; do not rely on cached grants.</li>
              <li>Plugin update: compare manifest permissions. Additive scopes or higher risk require explicit reapproval.</li>
              <li>Uninstall: stop triggers first, revoke provider credentials where supported, remove secrets, and retain minimal receipts according to policy.</li>
              <li>Prompt injection: external message text and MCP tool descriptions cannot change policies, grant scopes, choose hidden destinations, or bypass approval.</li>
              <li>Data exfiltration: egress allowlist per plugin, request/response byte caps, structured payloads, log redaction, and anomaly rate limits.</li>
              <li>Abuse: quotas per user/plugin/action, publisher suspension, kill switch, manifest revocation list, and Cloud-wide emergency disable.</li>
            </ul>
      <P>Private desktop-only mode must run registry, policy, detector, queue, adapters, secrets, and audit locally. A remote plugin receives only the fields shown in its approval/data disclosure. The UI must not claim local-only privacy for remote MCP servers or SaaS providers.</P>
      </Section>
      <Section id="developer-and-publishing-model" title="Developer and publishing model">
      <P>Phase one supports first-party plugins and private workspace plugins. A public community marketplace begins only after signing, review, abuse response, and upgrade/revocation mechanisms exist.</P>
      <P>Developer tooling should include:</P>
      <ul>
              <li>Manifest JSON Schema and TypeScript types.</li>
              <li>Local adapter/MCP connection inspector.</li>
              <li>Synthetic conversation fixtures with no production data.</li>
              <li>Schema validation and approval-policy simulator.</li>
              <li>Egress and redaction report.</li>
              <li>Contract test kit for idempotency, timeout, retry, and undo.</li>
              <li>Package signing and publisher identity verification.</li>
            </ul>
      <P>Review checks permissions against actual network behavior, requires a privacy policy, tests account deletion/revocation, and rejects misleading capability descriptions. Verified status describes publisher and review state, not an endorsement or guarantee.</P>
      </Section>
      <Section id="observability-and-product-metrics" title="Observability and product metrics">
      <P>Operational telemetry contains IDs and classifications, not message bodies or credentials:</P>
      <ul>
              <li>Trigger events evaluated, matched, and rejected by reason.</li>
              <li>Proposal latency and detector confidence distribution.</li>
              <li>Approval, edit, rejection, expiration, and undo rates.</li>
              <li>Execution success, retry, duplicate-prevention, and provider error rates.</li>
              <li>Credential health and reauthentication completion.</li>
              <li>Install-to-first-success and automation disable/uninstall rates.</li>
            </ul>
      <P>The primary success metric is <b>approved useful actions per active plugin installation</b>, balanced by rejection, undo, and disable rates. Raw invocation count is not a success metric.</P>
      </Section>
      <Section id="rollout-plan" title="Rollout plan">
      <Section id="phase-0-safety-foundation" title="Phase 0 — Safety foundation" level={3}>
      <ul>
              <li>Manifest types, risk classifier, policy engine, outbox, proposals, approvals, receipts, and secret references.</li>
              <li>Feature flag all plugin surfaces; no third-party execution.</li>
              <li>Build Calendar adapter contract and fixtures.</li>
            </ul>
      </Section>
      <Section id="phase-1-calendar-manual-action" title="Phase 1 — Calendar manual action" level={3}>
      <ul>
              <li>Install/connect Google Calendar.</li>
              <li>“Add to calendar” from an explicit message selection or Ask Claire result.</li>
              <li>Always-review screen and activity receipt.</li>
              <li>No background detection.</li>
            </ul>
      </Section>
      <Section id="phase-2-calendar-suggestions" title="Phase 2 — Calendar suggestions" level={3}>
      <ul>
              <li><C>schedule.detected</C> pipeline for selected chats.</li>
              <li>Contextual cards, Home approval inbox, deduplication, updates, cancellations, and Outlook/CalDAV.</li>
              <li>Detector shadow mode and precision gate before user-facing suggestions.</li>
            </ul>
      </Section>
      <Section id="phase-3-first-party-library" title="Phase 3 — First-party library" level={3}>
      <ul>
              <li>Tasks, Notes, Reminders, Contacts.</li>
              <li>Automation templates, eligible low-risk auto-run, connected-account health, undo.</li>
              <li>Desktop and mobile parity for core management.</li>
            </ul>
      </Section>
      <Section id="phase-4-private-plugins" title="Phase 4 — Private plugins" level={3}>
      <ul>
              <li>Self-hosted/private MCP registration, explicit admin trust, egress controls, inspector, and contract tests.</li>
              <li>No public discovery.</li>
            </ul>
      </Section>
      <Section id="phase-5-community-marketplace" title="Phase 5 — Community marketplace" level={3}>
      <ul>
              <li>Publisher verification, signing, review queue, version reapproval, kill switch, reporting, ratings only after sufficient verified usage, and commercial policy.</li>
            </ul>
      </Section>
      </Section>
      <Section id="tests-and-acceptance-criteria" title="Tests and acceptance criteria">
      <Section id="contract-and-security" title="Contract and security" level={3}>
      <ul>
              <li>Reject invalid/unsigned manifests, unknown scopes, schema drift, and higher-risk updates without reapproval.</li>
              <li>Verify OAuth PKCE, state, issuer, exact redirect, audience binding, token rotation, encryption, revocation, and log redaction.</li>
              <li>Prove a model, detector, client, or MCP server cannot bypass <C>PluginPolicyEngine</C>.</li>
              <li>Fuzz capability inputs and remote responses; cap time, redirects, payload size, and allowed hosts.</li>
              <li>Confirm RLS and server ownership checks prevent cross-user installation, proposal, and receipt access.</li>
            </ul>
      </Section>
      <Section id="execution" title="Execution" level={3}>
      <ul>
              <li>Idempotent create across retry, worker crash, and duplicate event delivery.</li>
              <li>Approval hash fails after payload mutation or expiration.</li>
              <li>Disconnect/pause blocks queued work before adapter execution.</li>
              <li>Provider 401 pauses the account; 429/5xx retries; permanent 4xx creates an actionable receipt.</li>
              <li>Undo only targets the stored external object and cannot affect a replacement created elsewhere.</li>
            </ul>
      </Section>
      <Section id="calendar-scenarios" title="Calendar scenarios" level={3}>
      <ul>
              <li>Confirmed date/time creates one accurate proposal.</li>
              <li>Tentative, joking, quoted, historical, or conflicting dates do not create an action.</li>
              <li>Locale, daylight-saving transition, all-day, recurring, group, and cross-time-zone cases.</li>
              <li>Later reschedule/cancel links to the original event.</li>
              <li>Mac/mobile approval produces the same payload and single execution.</li>
            </ul>
      </Section>
      <Section id="ux-and-accessibility" title="UX and accessibility" level={3}>
      <ul>
              <li>Library, install, builder, approvals, activity, offline, empty, error, revoked, and update-required states.</li>
              <li>Keyboard navigation, focus order, screen-reader action/data summaries, dynamic type, reduced motion, contrast, and 44px mobile targets.</li>
              <li>Planned/unavailable plugins cannot appear installed or executable.</li>
              <li>Every external write names its destination and data before approval.</li>
            </ul>
      </Section>
      <Section id="release-gates" title="Release gates" level={3}>
      <ul>
              <li>Calendar suggestion precision meets the agreed internal threshold in shadow mode; favor missed suggestions over false actions.</li>
              <li>Zero known paths write externally without the required durable approval.</li>
              <li>No credential or raw conversation content in telemetry, logs, analytics, or crash reports.</li>
              <li>Kill switch and credential revocation are tested in production-like Cloud and self-hosted environments.</li>
            </ul>
      </Section>
      </Section>
      <Section id="assumptions-and-decisions" title="Assumptions and decisions">
      <ul>
              <li>“Plugin” is the user-facing term; implementation packages may be first-party adapters or MCP servers.</li>
              <li>Plugins are user/workspace capabilities, while automations are configured trigger-to-action rules built from those capabilities.</li>
              <li>V1 installations are per user. Shared workspace administration and centrally managed grants come later.</li>
              <li>Conversation processing starts after normalized Matrix ingestion and does not change mautrix bridge behavior.</li>
              <li>Calendar is the first vertical slice because its typed fields, reviewable destination, and undo path exercise the complete system.</li>
              <li>Raw messages stay inside Claire unless the capability disclosure and grant explicitly require transmission.</li>
              <li>Claire Cloud and self-hosted deployments expose the same manifest and API contracts; execution location and privacy disclosures differ.</li>
            </ul>
      </Section>
      <Section id="references" title="References">
      <ul>
              <li><a href="https://modelcontextprotocol.io/specification/2025-03-26/index" rel="noreferrer" target="_blank">Model Context Protocol specification and safety principles</a></li>
              <li><a href="https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization" rel="noreferrer" target="_blank">MCP authorization</a></li>
              <li><a href="https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling" rel="noreferrer" target="_blank">Vercel AI SDK tool calling and approval</a></li>
            </ul>
      </Section>
    </Doc>
  );
}
