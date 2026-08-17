# Claire brand system

Claire is calm, capable, and human. The visual language pairs editorial scale with friendly rounded geometry and high-contrast utility surfaces. The supplied finance-app reference informed the soft color fields, bold black controls, and modular cards; Claire adds a warmer paper base and an electric lime signal color.

## Color

| Role               | Token               | Hex       |
| ------------------ | ------------------- | --------- |
| Primary            | `claire-lime`       | `#DFFF64` |
| Primary hover      | `claire-lime-hover` | `#D2F04F` |
| Ink / primary text | `claire-ink`        | `#10120F` |
| Page background    | `claire-cream`      | `#F4F1EA` |
| Elevated surface   | `claire-paper`      | `#FFFDF8` |
| Secondary sky      | `claire-sky`        | `#B9DCFF` |
| Secondary blush    | `claire-blush`      | `#F2CFE1` |
| Secondary lavender | `claire-lavender`   | `#D8CCFF` |
| Accent coral       | `claire-coral`      | `#FF745F` |
| Accent mint        | `claire-mint`       | `#BDEBD5` |
| Focus              | `focus`             | `#3C68FF` |
| Success            | `success`           | `#18794E` |

The full neutral scale and CSS custom properties live in `tokens.css`.

## Typography

Claire uses **three families, with strict jobs**. Extra weights can look like extra fonts — they are not.

| Family | Loaded weights | Token | Use |
| --- | --- | --- | --- |
| **Public Sans** | 400, 500, 600, 700 | `--font-sans` | Body, nav, buttons, cards, labels, forms — everything at section-title size and below |
| **Inter** | 600, 700 | `--font-display` | Big titles only: `h1`, `h2`, hero display, mobile `display`/`screenTitle`, the price figure |
| **DM Mono** | 400, 500 | `--font-mono` | Kickers, status pills, captions, code, system metadata |

Do not introduce a fourth family. The split exists because Public Sans is the more comfortable reading and interface face, while Inter holds the very tight display tracking (-0.05em to -0.075em) that the marketing headlines rely on. If a title is under ~24px it is UI, not display, and takes Public Sans.

Weight roles:

- Public Sans 400 — body and supporting paragraphs
- Public Sans 500 — navigation and quiet UI labels
- Public Sans 600 — buttons and emphasis
- Public Sans 700 — card titles (`h3`, `h4`)
- Inter 600 — hero and display titles
- Inter 700 — section headings (`h1`, `h2`)
- DM Mono 400 — inline code
- DM Mono 500 — kickers, pills, and mono captions

Scale:

- Display: Inter 600, `clamp(3.25rem, 8vw, 7.5rem)`, 0.88 line-height, -0.075em tracking.
- Section heading: Inter 700, `clamp(1.8rem, 3vw, 2.75rem)`, 1.02 line-height, -0.05em tracking.
- Card title: Public Sans 700, ~18px, -0.035em tracking.
- Body: Public Sans 400, 1rem / 1.5. Large intro copy uses 1.125rem.
- Labels: DM Mono 500, 0.75rem or smaller, 0.08–0.12em tracking.

Fallbacks are Avenir Next/Helvetica for sans and SFMono/Consolas for mono. The website loads these faces in `website/src/app/layout.tsx`; the native apps bundle static TTFs from `mobile/assets/fonts/` and `desktop/macos/assets/fonts/`. All three families are SIL OFL 1.1.

## Foundations

- Spacing follows a 4px base: 4, 8, 12, 16, 24, 32, 48, 64, 96px.
- Radius: 12px for compact controls, 20px for cards, 32px for large modules, 48px for feature surfaces, and fully rounded pills for CTAs.
- Shadows: small `0 1px 2px rgb(16 18 15 / 8%)`; medium `0 14px 32px rgb(16 18 15 / 10%)`; large `0 30px 80px rgb(16 18 15 / 14%)`.
- Borders use `#10120F` for expressive modules and `#DFDCD3` for quiet separators.
- Hover: primary lime becomes `#D2F04F`; dark actions become `#292C28`; primary CTAs rise 2px.
- Focus: 3px `#3C68FF` outline with 3px offset.
- Active: controls translate down 1px. Motion is disabled when `prefers-reduced-motion` is set.

## Voice

Copy is short, specific, and considerate. Prefer “Promises don’t slip” over “AI-powered task extraction,” and always explain what Claire does for the person before how the infrastructure works.
