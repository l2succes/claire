# Claire secrets and 1Password

Claire uses 1Password as the source of record for operator secrets. Railway,
Vercel, and EAS retain their own runtime copies; never commit a plaintext
`.env` file, a 1Password token, or a secret reference that resolves in CI.

## First-time setup

Sign in locally without copying credentials into a terminal history:

```sh
eval "$(op signin)"
bun run secrets:check
```

Create the shared vaults idempotently from the same authenticated terminal:

```sh
bun run secrets:bootstrap
```

This creates `Claire — Production` and `Claire — Staging` only when missing.

Store shared operator credentials, such as Spaceship DNS, Railway account
access, Vercel access, and R2 administration credentials, in the operator's
private vault. Do not grant staging collaborators access to production or
operator secrets.

## Item layout

Create a Password item for each provider and environment. Use concealed custom
fields for values and use notes only for non-secret owner, rotation, and scope
metadata.

| Vault      | Required items                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| Production | `Railway / Production`, `Supabase / Production`, `Vercel / Production`, `EAS / Production`, `R2 / Production` |
| Staging    | `Railway / Staging`, `Supabase / Staging`, `Vercel / Staging`, `EAS / Staging`, `R2 / Staging`                |

The `Railway / <environment>` item must have one concealed field per Railway
variable. The field labels must exactly match the Railway variable names, such
as `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`,
`ENCRYPTION_KEY`, `HEALTHCHECK_TOKEN`, `REDIS_URL`, and `CORS_ORIGINS`.

## Safe Railway sync

Copy an example manifest to an ignored local file and review the variable names
before writing anything:

```sh
cp ops/secrets/railway.production.example.json ops/secrets/railway.production.json
bun run secrets:sync:railway -- ops/secrets/railway.production.json
```

The default is dry-run and prints only service/variable names. After checking
the destination, use `--apply` to send each value through standard input, so a
secret is not placed in command arguments or command output:

```sh
bun run secrets:sync:railway -- ops/secrets/railway.production.json --apply
```

This script deliberately skips deployment. Trigger and verify a deployment only
after reviewing the changed variables.

### Isolated staging Supabase

After the Railway Supabase template has been deployed into `claire-staging`, run this only from an operator terminal with an active `op` session:

```sh
bun run secrets:provision:supabase-staging
```

The command generates the complete JWT/key set locally, creates the concealed-field item `Supabase / Staging` in `Claire — Staging`, then sends runtime copies to only the `Supabase Studio` service in the isolated Railway project and redeploys its dependent staging services. It refuses to overwrite an existing item and never prints secret values. It intentionally targets the template's default `production`-named environment inside the separate `claire-staging` project; it does not target Claire production.

If a failed initial deployment needs a complete staging-key rotation, use `bun run secrets:provision:supabase-staging --rotate`. This moves the previous staging-only 1Password item to the recoverable 1Password trash, writes a replacement item with the same name, and redeploys the isolated staging services.

## Local commands

Use 1Password references in ignored local files and execute commands with
`op run`; do not export long-lived secrets into the shell:

```sh
op run --env-file=server/.env.op -- bun --cwd server run dev
```

`server/.env.op` is local-only and may contain references such as
`SUPABASE_SERVICE_KEY=op://Claire%20%E2%80%94%20Staging/Railway%20%2F%20Staging/SUPABASE_SERVICE_KEY`.

## Rotation and review

1. Create a replacement value in 1Password first.
2. Sync the affected runtime service and verify its health.
3. Revoke the former value at the provider.
4. Record the rotation date and owner in the item notes.

Run `bun run secrets:check` before operator work. At least quarterly, verify
that every live provider variable has a 1Password item and perform a backup
restore rehearsal. Never use a 1Password service-account token in GitHub
Actions for this repository.
