# Branded endpoint TLS follow-up — 2026-11-05

Issue [#156](https://github.com/l2succes/claire/issues/156) recorded Railway
certificate issuance stuck in August. The public endpoints now present valid
certificates for their branded hostnames. Ordinary curl verification and Python
`ssl.create_default_context()` both accepted the certificate chains and hostnames
on 2026-11-05. No certificate verification bypass was used.

| Host | Issuer | Valid from (UTC) | Expires (UTC) | Public response |
| --- | --- | --- | --- | --- |
| `api.useclaire.co` | Let's Encrypt YE1 | 2026-10-17 14:14:34 | 2027-01-15 14:14:33 | `GET /healthz`: 200, `{"status":"ok"}` |
| `supabase.useclaire.co` | Let's Encrypt YE1 | 2026-10-18 03:30:18 | 2027-01-16 03:30:17 | `GET /auth/v1/health`: 401, `No API key found in request` |

Each certificate's subject alternative name matches its respective hostname.
The Supabase response proves HTTPS reaches the gateway's API-key boundary;
authenticated Auth/database readiness still needs separate verification. API
`/healthz` proves liveness; the protected `/health` diagnostic is separate.

## Repeat the public checks

These read-only requests need no account or credentials:

```sh
curl --connect-timeout 10 --max-time 20 --silent --show-error \
  --write-out '\nstatus=%{http_code} tls=%{ssl_verify_result}\n' \
  https://api.useclaire.co/healthz
curl --connect-timeout 10 --max-time 20 --silent --show-error \
  --write-out '\nstatus=%{http_code} tls=%{ssl_verify_result}\n' \
  https://supabase.useclaire.co/auth/v1/health
```

Expected results are HTTP 200 and 401 respectively, both with `tls=0` and curl
exit status 0. A TLS error or a different status requires investigation. Avoid
`--fail` on the unauthenticated gateway probe: its expected 401 would fail that
command even when TLS works.

## Remaining gate for #156

The certificate issuance symptom is resolved as observed from this machine.
This check made no Railway, DNS, EAS, or deployment changes. The EAS production
profile takes endpoint values from its remote environment; no remote EAS values
were inspected in this check.

Before closing #156, verify that EAS production's `EXPO_PUBLIC_API_URL` and
`EXPO_PUBLIC_SUPABASE_URL` use the branded URLs, then build and run the next
production mobile binary against them. Confirm authenticated access on the
native app. Existing binaries retain their embedded endpoint configuration.
Follow the [mobile release flow](./environments.md#mobile-clients) and the
production acceptance gates in #100/#101.
