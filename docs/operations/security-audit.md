# Claire production security audit

This is the release gate for a Claire environment. Run it against isolated
staging first, then production during a scheduled maintenance window. It is a
review procedure: do not apply broad database grants, RLS changes, or storage
visibility changes directly to production while investigating a finding.

## Scope and boundary

Only the Claire API and Supabase gateway receive public custom domains. The
database, Supabase Studio, Auth, PostgREST, Realtime, Storage, MinIO, Redis,
Synapse, and mautrix bridges remain private Railway services. Production and
staging use separate databases, storage, Redis instances, OAuth clients,
Matrix servers, bridge sessions, and secret values. Staging has synthetic
fixtures and opt-in real testers, never copied production messages, accounts,
or platform connections.

## Before DNS cutover

1. Confirm the Railway API accepts only the exact production website origins;
   staging accepts only its staging website origin. Verify a disallowed Origin
   receives no CORS grant.
2. Enable invite-only GoTrue, set separate redirect and site URLs per
   environment, and create separate OAuth applications and callback secrets.
3. Confirm Redis-backed rate limits cover Auth-facing and message-ingestion
   endpoints. Exercise the limit in staging without using real contacts.
4. Verify `/healthz` exposes only liveness and dependency status. Set a
   per-environment `HEALTHCHECK_TOKEN` before relying on the detailed
   `/health` endpoint in production.
5. Verify every Railway, Vercel, EAS, Supabase, and R2 runtime secret has a
   matching 1Password item using the procedure in `secrets.md`.

## Database audit

Use an operator database connection only; do not paste its URL into shell
history or source control. Execute the read-only query file:

```sh
psql "$DATABASE_URL" -f ops/security/rls-read-only-audit.sql
```

For every user-owned table, verify RLS is enabled and the applicable policies
enforce `auth.uid()` for reads and writes. A write policy needs `WITH CHECK`,
not merely `USING`. Review grants to `anon` and `authenticated`, and inspect
every `SECURITY DEFINER` function for a safe, fixed `search_path` and narrowly
scoped execute grants.

Then use two freshly created staging identities to prove that identity A cannot
read, insert, update, or delete identity B's rows or storage objects. Record
the API requests and result statuses in the change record, without retaining
JWTs or personal content.

## Private media migration

The existing mobile client renders direct media URLs, so flipping the
`message-media` bucket to private without a coordinated application migration
would break existing attachments. Before making that change, add authenticated
or short-lived signed media URLs, migrate existing message references, enforce
object paths tied to the caller's user ID, and test cross-user denial in
staging. Do not mark a bucket private as a standalone production change.

Matrix media currently has a public API proxy route and needs the same
coordinated authorization migration. Before it is exposed through a custom API
domain, require the caller's Claire identity, verify that the requested media
belongs to a chat the caller may read, and remove the public long-lived cache
behavior. Its admin token must never reach a mobile or web client.

## Backup and restore gate

Back up Postgres and object storage to distinct encrypted, versioned R2
prefixes for each environment. Apply lifecycle retention and restrict R2
credentials to the backup job. A production DNS cutover requires a successful
staging restore: restore into a newly created, private target; validate schema,
row counts, and representative media retrieval; then destroy that temporary
target according to the retention policy. Do not restore into either live
database.

## Evidence to retain

Keep the non-secret audit output location, restore-test date, reviewer,
environment, deploy version, DNS/TLS result, Auth callback result, CORS result,
and rollback decision in the private operator vault notes or change log. Never
place customer data, access tokens, private URLs, or database dumps in Git.
