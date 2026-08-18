# Documentation

Claire's documentation lives at [`website/src/content/docs/`](../website/src/content/docs)
and is published at **/docs** on the website.

It is authored as React (`.tsx`) modules rather than Markdown. Each module
exports typed `meta` and a component composed from the shared block library in
`website/src/components/docs/blocks` — `<Steps>`, `<Mockup>`, `<Diagram>`,
`<Code>`, `<Table>`, `<Callout>`, and so on. That lets a page embed the live
product mockups and branded diagrams instead of describing them.

Because `meta` is typed, an invalid section, status, or roadmap stage is a
compile error rather than a runtime surprise. `website/scripts/build-docs.ts`
covers what types cannot: date formats, duplicate routes, and every internal
`/docs/...` reference resolving to a page that exists.

## Reading the docs

- Rendered: **/docs**
- Markdown rendition of any page: append `.md` to its URL
- Whole corpus for tools: `/llms.txt` and `/llms-full.txt`

## Adding a document

1. Create `website/src/content/docs/<section>/<slug>.tsx`
2. Export `meta: DocMeta` and a default component

```bash
cd website && bun run build-docs && bun run extract-docs && bun run dev
```
