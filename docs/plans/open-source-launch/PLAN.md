# Claire Open-Source Launch, Monorepo Cleanup, Website, and Developer Docs

## Summary

Prepare Claire for an open-source launch through focused, reviewable migrations rather than one oversized change.

Final top-level product structure:

```text
claire/
├── mobile/                  # Expo iOS, Android, and mobile web client
├── desktop/                 # Desktop applications and native companion code
│   └── macos/
├── website/                 # Next.js marketing site, docs, mockups, Storybook
├── server/                  # Bun API and messaging services
├── packages/
│   ├── design-system/       # Shared tokens, contracts, and platform-neutral assets
│   ├── platform-catalog/    # Canonical connector metadata
│   ├── plugin-sdk/          # Plugin types, runtime helpers, and test utilities
│   └── shared-types/        # Shared API and domain contracts
├── examples/
│   └── plugins/             # Working example plugins
├── docker/                  # Local infrastructure
├── supabase/                # Database config and migrations
├── docs/                    # Canonical Markdown/MDX documentation
├── scripts/                 # Repository-wide development and release tooling
└── vendor/
    └── mautrix-docs/        # Optional upstream documentation submodule
```

`client/` becomes `mobile/`. The supported desktop application lives in `apps/desktop/`. `landing/` is removed only after every useful design, mockup, asset, and interaction has been ported into `website/`.

## 1. Secure and license the repository

### Immediate containment

- Temporarily make the already-public repository private and freeze merges.
- Rotate the exposed Supabase JWT secret, service-role key, and derived anon key.
- Remove the hardcoded service-key fallback from `scripts/setup-database.js`.
- Update Railway, EAS, GitHub, local environments, and deployed clients.
- Run Gitleaks across the current tree and full Git history.
- Move real production endpoints, project IDs, database proxies, usernames, and operational runbooks to a private `l2succes/claire-ops` repository.
- Exclude the unrelated `turbo-fieldfare` gitlink from release branches.

### History cleanup

- Back up all branches and tags.
- Purge historical `client/.env.local.backup` and `client/.env.override` files.
- Replace the historical Supabase key everywhere.
- Force-push rewritten branches and tags and require fresh clones.
- Reopen the repository only after credentials are revoked and current-tree/history scans are clean.

### Licensing

- AGPL-3.0: `server/`, `docker/`, `supabase/`, infrastructure configuration, and operational service code.
- Apache-2.0: `mobile/`, `desktop/`, `website/`, `packages/`, `examples/`, and public documentation.
- Add path-based license guidance, SPDX metadata, complete license texts, third-party notices, and a trademark policy.
- Require DCO sign-off for contributions.

## 2. Reorganize the repository in a dedicated migration

Perform this as a mechanical PR from an isolated worktree after active feature branches are merged or paused:

- Use `git mv client mobile` to preserve history.
- Do not introduce a temporary `client` symlink.
- Update root scripts, Docker builds, Railway ignores, ESLint, Expo commands, EAS instructions, CI working directories, test artifact paths, agent instructions, and docs.
- Preserve obsolete path references only in Git history.
- Verify native iOS and Android references after the move.

Expected commands:

```bash
bun run dev
bun run dev:server
bun run dev:mobile
bun run dev:desktop
bun run dev:website
bun run dev:plugin
bun run test
bun run lint
bun run typecheck
bun run check
```

Add explicit Bun workspaces for `apps/*`, `packages/*`, and `examples/*`. Consolidate JavaScript dependency management only after clean-install parity is proven.

Move the mautrix documentation submodule from `docs/mautrix` to `vendor/mautrix-docs`; make it optional for normal contributors and required only for bridge work.

Move connector definitions into `packages/platform-catalog`, consumed by server, website, mobile, and desktop. Add `packages/shared-types` only for genuine cross-runtime contracts.

## 3. Preserve and port the existing Claire design

The existing `landing/` implementation is the visual source of truth. Reuse its tokens, typography, CSS, logos, Heroicons, vendor marks, homepage, business page, security page, mobile/desktop/plugin mockups, and responsive behavior.

Do not replace it with a generic Next.js visual language.

### Tailwind and component kit

- Add Tailwind CSS v4 to `website/`.
- Convert `landing/tokens.css` into canonical semantic variables in `packages/design-system`.
- Expose those values through Tailwind `@theme`.
- Use `class-variance-authority`, `clsx`, and `tailwind-merge` for variants.
- Keep scoped CSS for intricate mockup geometry where utility-only markup is less maintainable.
- Ban arbitrary hardcoded brand colors in new components.

Component groups:

- Brand marks, wordmarks, vendor marks, and AI sparkle
- Buttons, links, icon buttons, and copy controls
- Badges, availability labels, and hosting labels
- Cards, panels, callouts, and code blocks
- Marketing and documentation navigation
- Page heroes and content sections
- Phone and desktop frames
- Conversation rows, message bubbles, AI cards, and platform badges
- Documentation callouts, code groups, API signatures, and diagrams

Icon rules:

- Heroicons outline at 24px for navigation and 20px for compact controls.
- Solid icons only for selected or high-priority states.
- Official platform marks for platform identity.
- Vendor marks vendored locally with attribution.
- Claire SVG logo assets remain editable source files.
- Storybook documents every reusable component and meaningful state.

Maintain a parity matrix mapping every static page to its Next.js route. Delete `landing/` only after content, responsive behavior, interactions, accessibility states, and assets are verified in `website/`.

## 4. Clean and reorganize documentation

Canonical tree:

```text
docs/
├── getting-started/
├── architecture/
├── guides/
├── reference/
├── contributing/
├── product/
└── project/
```

Content areas:

- Getting started: prerequisites, repository setup, development modes, and first contribution.
- Architecture: system overview, Matrix/mautrix data flow, identity, sync, AI, hosting, and privacy.
- Guides: mobile, desktop, plugins, connectors, self-hosting, testing, backups, and troubleshooting.
- Reference: API, environment variables, platform catalog, plugin manifest, database, and design system.
- Contributing: workflow, testing, docs, DCO, and maintainers.
- Product: roadmap, connector status, security status, and known limitations.

Merge duplicate setup, environment, deployment, and architecture documents. Preserve durable decisions and delete superseded plans instead of accumulating an archive. Add frontmatter for title, description, status, audience, owner, keywords, and last-reviewed date. Keep live production details out of public docs.

## 5. Contributor get-started path

Create `/docs/getting-started/repository-setup` covering:

1. Supported operating systems and prerequisites.
2. Clone command.
3. Optional mautrix submodule setup for bridge contributors.
4. Bun and Docker verification.
5. Safe environment-file setup.
6. Dependency installation.
7. Mock-mode startup with no third-party accounts.
8. Test, lint, and typecheck commands.
9. Repository map.
10. Links to contribution tracks.

Default path:

```bash
git clone https://github.com/l2succes/claire.git
cd claire
bun run setup
bun run dev
```

Mock mode must not require WhatsApp, Telegram, Instagram, Matrix, Supabase Cloud, or paid AI credentials.

Document separate tracks for website/docs, mobile, desktop, backend, connectors, plugins, and design-system work.

### Plugin development

Create:

```text
packages/plugin-sdk/
examples/plugins/calendar/
examples/plugins/task-manager/
```

Document manifests, permissions, conversation triggers, approvals, actions, fixtures, failure handling, run history, packaging, and review requirements.

Provide:

```bash
bun run plugin:create
bun run dev:plugin
bun run test:plugins
```

The calendar example uses local fixtures and creates a mock event without requiring a real external account.

## 6. Documentation website

Add Fumadocs under `/docs` in the existing Next.js website, themed with Claire’s shared tokens and components rather than an unrelated stock theme.

Include sidebar navigation, breadcrumbs, table of contents, keyboard search, Copy Markdown, View Markdown, Edit on GitHub, Mermaid diagrams, code groups, compatibility tables, feedback, and last-reviewed metadata.

Public interfaces:

- `GET /api/search`
- `POST /api/docs/ask`
- `GET /llms.txt`
- `GET /llms-full.txt`
- `GET /docs/<path>.md`

Ask Claire documentation search must retrieve from the structured docs index, cite sources, default to configurable `gpt-5.4-mini`, avoid silent provider fallback, limit request/response size, rate-limit visitors, enforce an initial $50 monthly budget, cache repeated questions, and avoid retaining raw questions. Standard search must remain available if AI is disabled.

## 7. Open-source community and README

Use the existing Claire design system and actual product references in the README:

- Logo and “All your chats. One AI.” positioning
- Real mobile, desktop, inbox, and plugin screenshots
- Current capabilities separated from roadmap
- Five-minute mock-mode quickstart
- Mermaid architecture diagram
- Cloud, self-hosted, BYOK, and private-desktop modes
- Plugin ecosystem and contribution tracks
- Docs, Discussions, security, roadmap, and license links
- Alpha status and known limitations
- No production endpoints or unsupported privacy guarantees

Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `GOVERNANCE.md`, `MAINTAINERS.md`, `SUPPORT.md`, DCO automation, issue forms, PR template, and CODEOWNERS.

Enable GitHub Discussions for Announcements, Q&A, Ideas, Show and Tell, Plugins, and Self-hosting. Enable Dependabot, CodeQL, dependency review, expanded secret scanning, push protection, and protected-main rules. Deploy website and PR previews through Vercel.

## 8. Delivery and acceptance

Recommended PR sequence:

1. Credential rotation and public-repository remediation.
2. Licensing and community health files.
3. `client/` to `mobile/` mechanical rename.
4. Workspace scripts and shared-package boundaries.
5. Documentation cleanup and contributor quickstart.
6. Design-token and component extraction from `landing/`.
7. Website page migration.
8. Fumadocs and AI search.
9. Mockup migration and `landing/` removal.
10. README, screenshots, GitHub configuration, and alpha release.

Acceptance criteria:

- No active secret alerts or verified credentials in current or rewritten history.
- No functional reference to `client/` remains after the rename.
- Root commands work from a fresh clone.
- Mock mode requires no external accounts.
- Every contribution track has a tested setup path.
- Plugin examples run with local fixtures.
- Website pages visually match the existing Claire references.
- Published docs are searchable and copyable as Markdown.
- Storybook, website, server, mobile, and desktop checks pass.
- CI validates paths, docs links, licenses, secrets, types, and fresh-clone setup.
- `landing/` is deleted only after parity verification.
- GitHub community profile reaches 100%.
- Publish `v0.1.0-alpha.1` after a clean-clone rehearsal.

## Assumptions

- Top-level names are `mobile`, `desktop`, `website`, and `server`; no `apps/` wrapper is introduced.
- The desktop application is `apps/desktop/`.
- `landing/` is authoritative until fully ported.
- Root `docs/` is the canonical Markdown source consumed by Fumadocs.
- Old plans are consolidated or deleted after their durable decisions are preserved.
- Migration work happens in an isolated worktree and does not disturb the current shared dirty worktree.
- GitHub Discussions is the canonical community venue.
- DCO is used instead of a CLA.
- Server infrastructure uses AGPL-3.0; clients, website, documentation, shared packages, and plugin SDK use Apache-2.0.
