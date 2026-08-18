# Railway staging isolation

The production Railway project is a live, template-derived topology. Do not
upgrade, replace, resize, stop, delete, or repurpose any production service to
create staging. In particular, both production Postgres services are out of
scope for staging setup.

`claire-staging` is the isolated Railway project for the staging environment.
It is deliberately empty until its secrets and known-good service manifest are
available. Never use Railway's environment-duplicate option from production:
it can copy production variables and violates the environment boundary.

## Build the staging topology

1. In the operator's private 1Password vault, record the current production
   service manifest and image digests as the known-good baseline. Do not put
   runtime values, internal hostnames, database URLs, or OAuth credentials in
   this repository.
2. Recreate that baseline in the `staging` environment of `claire-staging`,
   generating fresh secrets for every service. The public Supabase deployment
   link is useful for reference, but do not substitute a newer template
   topology for the known-good production layout without a staged migration.
3. Use separate Postgres, Redis, object storage, Matrix/Synapse, mautrix
   bridge, OAuth, Auth, and R2 backup resources. Import only schema migrations
   and synthetic fixtures; never copy production rows, messages, files, or
   platform sessions.
4. Add the Claire staging API service from the `main` branch only after the
   `Railway / Staging` item is complete in 1Password. Set exact staging
   `CORS_ORIGINS`, Auth site/redirect URLs, and a unique `HEALTHCHECK_TOKEN`.
5. Create the staging Railway custom domains only after the respective API and
   gateway services pass private health checks. Create exactly the CNAME/TXT
   records returned by Railway in Spaceship, then verify TLS before inviting
   testers.

## Test data and real testers

Fixtures are the default. Opt-in real testers may use staging with accounts
created in staging Auth and dedicated test phone numbers/platform accounts.
Their data must stay in staging, be visible only to that staging identity, and
follow the staging retention policy. Production credentials, sessions, and
contact/message data are never valid staging inputs.
