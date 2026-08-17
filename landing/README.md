# Claire landing page

Run from the repository root:

```bash
bun run landing
```

Then open `http://localhost:3000`. The page is dependency-free at runtime and can be deployed to any static host by publishing the `landing/` directory.

- `index.html` — semantic page structure and high-fidelity product mockups
- `styles.css` — responsive layouts and component styles
- `tokens.css` — production CSS design tokens
- `tailwind.config.js` — equivalent Tailwind theme mapping
- `script.js` — platform filters/details, install tabs, copy controls, and FAQ behavior
- `platform-catalog.js` — generated browser snapshot of the public connector registry
- `STYLE_GUIDE.md` — usage guidance for the unified brand system
- `style-guide.html` — visual, browser-based brand and component guide (Claire Lab home)
- `logo-explorations.html` — six production SVG directions for the Claire conversation mark
- `assets/brand/` — editable Claire logo SVGs used by the exploration and landing pages
- `app-mockups.html` — complete mobile information architecture and screen gallery
- `ask-claire-mockups.html` — Ask Claire tab, cited threads, and in-chat assistant gallery
- `desktop-mockups.html` — standalone and companion desktop app screen gallery
- `plugin-mockups.html` — plugin library, automation, approval, and activity reference
- `lab-nav.js` / `lab-nav.css` — shared Claire Lab header used by every design and mockup page
  (Style guide, Logo, Mobile, Ask Claire, Desktop, Plugins)
- `developer.html` — shareable developer hub linking product references and implementation specs
- `business.html` — Claire Business vision for shared customer conversations and automation

Regenerate the connector snapshot after editing `server/src/platform-catalog.ts`:

```bash
bun run catalog:generate
```

Platform marks are loaded as SVGs from [Simple Icons](https://simpleicons.org/) and
[Iconify](https://iconify.design/). Each registry entry includes its exact asset and source URL.
These catalogs make the artwork available, but vendor trademark and brand-usage requirements still
need to be verified before release. IRC uses a generic protocol symbol because it does not have a
single official vendor mark.
