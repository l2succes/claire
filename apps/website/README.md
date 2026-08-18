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
