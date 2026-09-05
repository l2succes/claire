---
title: Contribution workflow
description: Branching, DCO, tests, and review.
status: current
audience: contributors
owner: maintainers
keywords: dco, pull request
last-reviewed: 2026-08-15
---

# Contribution workflow

1. Branch from updated `main`.
2. Sign every commit with `git commit -s` (DCO).
3. Keep changes focused.
4. Run `bun run check` or the relevant package checks.
5. Open a pull request with the template.

Do not commit secrets or production hostnames. See [SECURITY.md](../../SECURITY.md) and [CONTRIBUTING.md](../../CONTRIBUTING.md).
