# Contributing to Claire

Thanks for helping build Claire. This document is the short contributor contract. The full setup path is [docs/getting-started/repository-setup.md](docs/getting-started/repository-setup.md).

## Developer Certificate of Origin

Every commit must include a DCO sign-off:

```text
Signed-off-by: Your Name <you@example.com>
```

Use `git commit -s`. By signing off, you agree to the terms in [DCO](DCO).

## Quick path

```bash
git clone https://github.com/l2succes/claire.git
cd claire
bun run setup
bun run dev
```

Mock mode does not require WhatsApp, Telegram, Instagram, Matrix, Supabase Cloud, or paid AI credentials.

## Contribution tracks

| Track | Start here |
|---|---|
| Website and docs | `website/`, `docs/` |
| Mobile | `mobile/` |
| Desktop | `desktop/macos/` |
| Server | `server/` |
| Connectors | `packages/platform-catalog/`, `server/src/adapters/` |
| Plugins | `packages/plugin-sdk/`, `examples/plugins/` |
| Design system | `packages/design-system/`, `website/` Storybook |

## Commands

```bash
bun run test
bun run lint
bun run typecheck
bun run check
bun run storybook
bun run plugin:create
bun run dev:plugin
bun run test:plugins
```

## Pull requests

- Work on a branch from updated `main`.
- Keep PRs focused. Do not mix the `mobile/` → `mobile/` rename with unrelated features.
- Do not commit secrets, production hostnames, or operator runbooks.
- Add or update tests when behavior changes.
- Use the pull request template.

## License

Server and infrastructure contributions are AGPL-3.0-only. Client, website, docs, packages, and examples are Apache-2.0. See [LICENSE](LICENSE).
