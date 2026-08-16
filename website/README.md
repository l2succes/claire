# Claire website

The public Claire site, developer hub, and component reference built with Next.js App Router.

## Local development

```bash
bun install
bun run dev
```

## Component workshop

```bash
bun run storybook
```

## Migration policy

The legacy `landing/` pages remain the visual baseline while their content is migrated. Do not remove a legacy page until its Next.js route has matching responsive behavior, interactions, accessibility, and content.

Deep product and architecture specifications remain in the repository-level `docs/` folder and will be converted to MDX incrementally.
