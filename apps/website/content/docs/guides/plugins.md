---
title: Plugin development
description: Create and test a local Claire plugin with fixtures.
status: current
audience: contributors
owner: maintainers
keywords: plugins, sdk, fixtures
last-reviewed: 2026-08-15
---

# Plugin development

The basic plugin path uses local fixtures. You do not need Google Calendar, a task manager account, or any messaging login.

## Create

```bash
bun run plugin:create my-plugin
```

This writes `examples/plugins/my-plugin` with a signed-off-style manifest and one dry-run action.

## Run and test

```bash
bun run dev:plugin
bun run test:plugins
```

The calendar example creates a mock event from a fixture:

```ts
await runPluginAction(calendarPlugin, 'calendar.events.create', {
  conversationId: 'chat_fixture',
  sourceMessageIds: ['msg_1'],
  input: { title: 'Send Maya the proposal', startsAt: '2026-08-18T15:00:00Z' },
});
```

## Contract

See `packages/plugin-sdk` and [docs/CLAIRE_PLUGIN_SYSTEM_SPEC.md](../CLAIRE_PLUGIN_SYSTEM_SPEC.md) for manifests, permissions, approvals, and risk classes.

Rules for v1 examples:

- Detection is not permission.
- Sensitive writes require approval.
- No raw-message retention in fixture plugins.
- No real provider credentials in tests.
