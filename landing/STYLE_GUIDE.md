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

Claire uses **two families only**. Extra weights can look like extra fonts — they are not.

| Family | Loaded weights | Token | Use |
| --- | --- | --- | --- |
| **Inter** | 400, 500, 600, 700 | `--font-sans` | Voice, headings, body, nav, buttons, card titles |
| **DM Mono** | 400, 500 | `--font-mono` | Kickers, status pills, captions, code, system metadata |

Do not introduce a third family for marketing, cards, or the website. Card titles such as “Claire AI credits” use Inter 700, same as `h1–h4`.

Weight roles:

- Inter 400 — body and supporting paragraphs
- Inter 500 — navigation and quiet UI labels
- Inter 600 — display titles and some buttons
- Inter 700 — section headings, card titles (`h1–h4`)
- DM Mono 400 — inline code
- DM Mono 500 — kickers, pills, and mono captions

Scale:

- Display: Inter 600, `clamp(3.25rem, 8vw, 7.5rem)`, 0.88 line-height, -0.075em tracking.
- Section heading: Inter 700, `clamp(1.8rem, 3vw, 2.75rem)`, 1.02 line-height, -0.05em tracking.
- Card title: Inter 700, ~18px, -0.035em tracking.
- Body: Inter 400, 1rem / 1.5. Large intro copy uses 1.125rem.
- Labels: DM Mono 500, 0.75rem or smaller, 0.08–0.12em tracking.

Fallbacks are Avenir Next/Helvetica for sans and SFMono/Consolas for mono. The website loads these faces in `website/src/app/layout.tsx`.

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
