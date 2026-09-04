---
name: testflight-ticket-import
description: Import Claire TestFlight screenshot feedback into deduplicated GitHub issues. Use when asked to pull, sync, triage, or turn TestFlight feedback into tickets.
---

# TestFlight ticket import

Use the repository command from the Claire project root:

```bash
bun run testflight:tickets
```

The command reads TestFlight feedback using Claire's `production` EAS submit profile and previews new GitHub issues. It is safe to rerun because issue bodies contain a stable TestFlight feedback ID.

When the user explicitly asks to import, pull, sync, or create the tickets, inspect the preview and then run:

```bash
bun run testflight:tickets --write
```

For narrower pulls, use `--limit`, `--offset`, or `--profile`. Run with `--help` for the full interface.

The importer intentionally excludes tester names, tester email addresses, and signed screenshot URLs from GitHub. It records the stable feedback ID so screenshots can be reopened in TestFlight later.

When investigating one imported issue, refresh its full TestFlight details and screenshot URL with:

```bash
cd apps/client
bunx eas-cli@23.2.0 testflight:feedback <feedback-id> --json
```

Report the fetched, skipped, and created counts plus the created issue URLs. Do not implement the imported tickets unless the user also asks for implementation.
