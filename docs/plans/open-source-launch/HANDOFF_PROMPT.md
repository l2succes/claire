# Agent Handoff Prompt: Claire Open-Source Launch

You are taking over implementation of the Claire open-source launch and repository organization plan.

## Repository rules

- Work in an isolated worktree or branch based on updated `main`.
- The shared workspace may contain unrelated dirty changes from other agents. Do not stash, reset, checkout, or overwrite them.
- Use `apply_patch` for tracked file edits.
- Preserve existing work unless it is explicitly in the current phase.
- Never expose or print secret values.
- Before any destructive Git history operation, back up refs and confirm the exact scope.

## Source of truth

Read the complete plan at:

`docs/plans/open-source-launch/PLAN.md`

The existing `landing/` directory is the visual source of truth. Reuse its tokens, CSS, assets, logos, Heroicons, platform marks, mockups, and responsive behavior. Do not replace Claire’s visual language with generic Next.js or generic Fumadocs styling.

## Required sequence

Implement in focused phases:

1. Security and credential remediation.
2. Licensing and community files.
3. Rename `client/` to `mobile/` and update all references.
4. Establish workspace/package boundaries.
5. Reorganize public documentation.
6. Extract the existing landing design system into shared tokens and Tailwind components.
7. Port the website and mockups faithfully.
8. Add Fumadocs, Markdown export, `llms.txt`, and Ask Claire docs search.
9. Add plugin SDK examples and contributor setup.
10. Remove `landing/` only after parity checks.

## Final structure

```text
mobile/ desktop/ website/ server/ packages/ examples/ docker/ supabase/ docs/ scripts/ vendor/
```

The desktop application lives under `apps/desktop/`. Move the mautrix docs submodule from `docs/mautrix` to `vendor/mautrix-docs`.

## Contributor experience to deliver

The developer docs must explain how to:

- Clone Claire.
- Run `bun run setup`.
- Start mock mode with `bun run dev`.
- Run tests, lint, typecheck, and Storybook.
- Work on mobile, desktop, server, website, connectors, or plugins independently.
- Create and test a local plugin with fixtures.

Create `packages/plugin-sdk/` and local calendar/task-manager examples with:

```bash
bun run plugin:create
bun run dev:plugin
bun run test:plugins
```

Do not require real messaging accounts, cloud credentials, or third-party calendar accounts for the basic contributor path.

## Design-system requirements

- Tailwind CSS v4 is the composition layer.
- Existing `landing/tokens.css` becomes canonical semantic tokens.
- Existing landing colors, typography, spacing, shadows, borders, logo vectors, Heroicons, and platform marks must be reused.
- Use scoped CSS for complex phone, desktop, and plugin mockup geometry when appropriate.
- Add Storybook stories for reusable components and important states.
- Include visual parity checks at desktop and 390px mobile widths.

## Documentation requirements

Use Fumadocs at `/docs` in the existing Next.js website, themed with Claire’s shared components. Provide:

- Search
- Copy Markdown
- View Markdown
- Edit on GitHub
- Mermaid diagrams
- `/llms.txt`
- `/llms-full.txt`
- Per-page `.md` routes
- `GET /api/search`
- `POST /api/docs/ask`

Ask Claire must retrieve from the docs index, cite sources, default to configurable `gpt-5.4-mini`, rate-limit, enforce a $50 monthly budget, avoid raw-query retention, and fall back to ordinary search when unavailable.

## Validation before handoff

Run and report:

- Current-tree and full-history secret scans.
- License/path validation.
- Fresh-clone mock-mode setup.
- Website, Storybook, server, mobile, and desktop checks.
- Documentation link and Markdown endpoint checks.
- Plugin fixture tests.
- Visual parity checks against the original landing pages.
- `git diff --check`.

Report changed files, tests, unresolved risks, and the next recommended phase. Do not claim the repository is ready for public promotion while the open secret alert or historical credentials remain unresolved.
