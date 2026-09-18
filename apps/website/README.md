<!-- SPDX-License-Identifier: Apache-2.0 -->

# Claire website

Next.js App Router marketing site, Fumadocs documentation, and public docs APIs.

## Run

From the repository root:

```bash
bun run dev:website
```

Or from this directory:

```bash
bun run sync-docs
bun run dev
```

Storybook:

```bash
bun run storybook
```

## Docs source

Canonical Markdown lives in `../docs`. `bun run sync-docs` validates and copies every Markdown document into `content/docs` before `dev` and `build`; `content/docs` is generated and gitignored. The website is the default HTML reader experience, while `/docs/<path>.md` remains available for copying and machine use.

## Public interfaces

- `GET /api/search` — Fumadocs search
- `POST /api/docs/ask` — Ask Claire (requires `OPENAI_API_KEY`)
- `GET /llms.txt`
- `GET /llms-full.txt`
- `GET /docs/<path>.md`

Ask Claire uses the Vercel AI SDK with its direct OpenAI provider. It defaults to `CLAIRE_DOCS_ASK_MODEL=gpt-5.4-mini` and a `$50` in-memory monthly budget. Set `OPENAI_API_KEY` only in the website host’s server environment (never a `NEXT_PUBLIC_*` value). If the key is missing it returns `503` with `{ fallback: "search" }`.

The homepage waitlist posts to `/api/waitlist` and writes through a server-only Supabase service-role client. Apply the latest migration, then set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` on the website host. To send the immediate welcome note, also set `RESEND_API_KEY` and `CLAIRE_WAITLIST_FROM_EMAIL`; `CLAIRE_WAITLIST_REPLY_TO`, `CLAIRE_SITE_URL`, `CLAIRE_IOS_BETA_URL`, and `CLAIRE_ANDROID_BETA_URL` are optional. Signups still succeed when email delivery is not configured.
