---
title: Testing
description: Unit, plugin fixture, lint, typecheck, and Storybook checks.
status: current
audience: contributors
owner: maintainers
keywords: test, lint, storybook
last-reviewed: 2026-08-15
---

# Testing

```bash
bun run test
bun run test:plugins
bun run lint
bun run typecheck
bun run check
bun run storybook
```

- Server tests use Bun’s test runner.
- Mobile unit tests use Jest.
- Mobile web e2e uses Playwright with `MOCK_BRIDGE=true`.
- Plugin examples use local fixtures and must not call real providers.
