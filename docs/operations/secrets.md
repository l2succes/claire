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

The local authenticated Spaceship DNS credential can be copied from macOS
Keychain into the private `Personal` vault without printing it:

```sh
bun run secrets:store:spaceship
```

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

### Encryption-key rotation

Use a one-key overlap: set the replacement as `ENCRYPTION_KEY` and keep the
retired value in concealed `ENCRYPTION_KEY_PREVIOUS`. New session, queue, and
AI-cache writes use the replacement while reads can safely decrypt active
values written with the retired key. After the longest active encrypted TTL
has expired and a deployment has been verified, remove `ENCRYPTION_KEY_PREVIOUS`
from 1Password and Railway. Never place either value in a command argument or
commit it to an environment file.

For the complete live-service inventory, the repository uses one item per
Railway service to preserve identical variable names across services. This
command reads each configured non-`RAILWAY_*` variable, writes it as a
concealed field, verifies the replacement item before trashing an older copy,
and never writes to Railway:

```sh
bun run secrets:inventory:railway
```

To resume a single service after an interrupted run, scope the same command:

```sh
bun run secrets:inventory:railway -- --environment=production --service='Supabase Realtime'
```

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

After the Railway Supabase template has been deployed into `claire-staging`, use the single staging command from an operator terminal with an active `op` session:

```sh
bun run secrets:provision:staging --rotate-supabase
```

This is the one-time recovery/bootstrap form. It generates a new complete staging Supabase key set locally, creates and reads back a concealed-field `Supabase / Staging` item in `Claire — Staging`, then replaces any earlier staging item only after that verification succeeds. It next provisions the fixture-only API and pushes the public anon key to EAS Preview. The wrapper stops on the first failure, so later steps never produce misleading downstream errors. It never prints secret values and intentionally targets the template's default `production`-named environment inside the separate `claire-staging` project; it does not target Claire production.

After bootstrap, rerun the same workflow without the flag whenever you need to verify and re-sync staging: `bun run secrets:provision:staging`. It reuses the values already stored in 1Password; it does not rotate them. The scripts write each JSON item template to a mode-`0600` temporary file, have `op` create it from that file, remove it immediately, and verify every concealed field before Railway or EAS is changed.

### Fixture-only Claire API

After the `claire-api` service and Redis have been created in the isolated Railway project, run:

```sh
bun run secrets:provision:api-staging
```

This creates `Railway / Staging`, reads only the staging Supabase item, and deploys the API with `MOCK_BRIDGE=true`. It is the safe path for fixture testing. Run it with `--rotate` only to replace the isolated API key set. Real tester platform connections require a separately provisioned staging Matrix/Synapse and bridge topology; never add live production sessions to this item.

### EAS Preview

Once the staging Supabase item is unique and current, update the client-readable preview anon key without printing it or placing it in a command argument:

```sh
bun run secrets:sync:eas-staging
```

The script creates a mode-`0600` temporary environment file, pushes only `EXPO_PUBLIC_SUPABASE_ANON_KEY` to EAS Preview, and removes the file even if the EAS command fails.

### Supabase Studio operator access

The Supabase gateway root serves Studio behind HTTP Basic Auth; it is separate
from client API authentication. Copy the existing Railway gateway credentials
into the dedicated 1Password items without rotating them:

```sh
bun run secrets:store:supabase-studio
```

This creates `Supabase Studio / Staging` and `Supabase Studio / Production` in
their respective vaults, verifies that both concealed credentials were retained,
and only then replaces an older copy. Use the website saved in each 1Password
item to open Studio. Studio grants administrator-level database access, so do
not share these items with app users or testers.

## Local commands

Use 1Password references in ignored local files and execute commands with
`op run`; do not export long-lived secrets into the shell:

```sh
op run --env-file=apps/server/.env.op -- bun --cwd apps/server run dev
```

`apps/server/.env.op` is local-only and may contain references such as
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
