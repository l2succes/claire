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

Canonical Markdown lives in `../docs`. `bun run sync-docs` copies the public pages into `content/docs` before `dev` and `build`.

## Public interfaces

- `GET /api/search` — Fumadocs search
- `POST /api/docs/ask` — Ask Claire (requires `OPENAI_API_KEY`)
- `GET /llms.txt`
- `GET /llms-full.txt`
- `GET /docs/<path>.md`

Ask Claire defaults to `CLAIRE_DOCS_ASK_MODEL=gpt-5.4-mini` and a `$50` in-memory monthly budget. If the API key is missing it returns `503` with `{ fallback: "search" }`.
