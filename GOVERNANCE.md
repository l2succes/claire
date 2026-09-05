# Governance

Claire is in alpha and is maintained by a small core team.

## Roles

- **Maintainers** can merge to `main`, cut releases, and change repository settings. Listed in [MAINTAINERS.md](MAINTAINERS.md).
- **Contributors** submit pull requests.
- **Plugin authors** publish examples or community plugins under Apache-2.0 unless they include AGPL server code.

## Decisions

Day-to-day product and engineering decisions are made by maintainers on GitHub. Larger changes should be proposed as a discussion or a short design note in `docs/project/`.

## Releases

Alpha tags use `v0.1.0-alpha.N`. A release requires:

- Current-tree secret scan clean
- `bun run check`
- Website, Storybook, server, mobile, and desktop checks
- No unresolved verified secret alerts

## Conflict

If a discussion stalls, maintainers decide. The Code of Conduct is not optional.
