# Security Policy

## Supported versions

Claire is in alpha. Security fixes are applied on `main` only.

## Reporting a vulnerability

Do not file a public issue for vulnerabilities or leaked credentials.

Email the maintainers listed in [MAINTAINERS.md](MAINTAINERS.md) or use GitHub's private vulnerability reporting if it is enabled on this repository.

Please include:

- A description of the issue and impact
- Steps to reproduce or a proof of concept
- Affected commit, tag, or deployment if known

We will acknowledge reports as quickly as we can and keep you updated while we remediate.

## Public claims

Claire is an alpha unified messenger. Do not treat the current tree as offering production privacy guarantees. See [docs/SECURITY_CLAIMS_AND_ROADMAP.md](docs/SECURITY_CLAIMS_AND_ROADMAP.md) for what is implemented versus planned.

## Known historical exposure

This repository previously contained production Supabase credentials, a service-role fallback, and operator hostnames in tracked files and Git history. Those values must be treated as compromised until operators rotate them and confirm current-tree plus full-history secret scans are clean.

Current-tree remediation is in progress. History rewrite has **not** been performed. Do not promote this repository as publicly safe while historical credentials remain reachable.

## Secret handling

- Never commit `.env`, `.env.local`, `.env.override`, or `.env.production` files.
- Never hardcode service-role keys, JWTs, database passwords, or Matrix access tokens.
- Use the example files in `server/.env.example` and `mobile/.env.example`.
- Live production endpoints belong in a private operations repository.
