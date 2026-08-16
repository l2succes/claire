# Design to app

The Claire Lab mockups are the visual source of truth. This spec applies those screens to the live Expo app. Start with Ask Claire, then the shared tab bar, then chat chrome.

Do not invent a second design system. Tokens already live in `@claire/design-system` (`cream`, `paper`, `ink`, `lime`, `sky`). Reuse `ClaireComposer`, `AskComposer`, and `AskToolGrid` instead of new one-off controls.

## Liquid Glass

We cannot ship true Apple Liquid Glass on a custom floating tab bar today.

- **System Liquid Glass** comes with `UITabBar` / Expo Router `NativeTabs`. That is the edge-to-edge iOS tab bar. It will pick up Liquid Glass on iOS 26 automatically.
- **The mockup bar** is a floating capsule over content, with a lime Claire tile in the center. That is a custom view. Expo does not expose Liquid Glass materials for arbitrary views.
- **`expo-blur`** (`BlurView`) is the honest match for the mockup: frosted paper, not Liquid Glass.

**Decision:** ship the custom floating capsule (same as the lab) with `expo-blur`. Keep the system Liquid Glass bar in [`client/components/claire/liquid-glass-tabs.tsx`](client/components/claire/liquid-glass-tabs.tsx). Switch `TAB_BAR_STYLE` in [`client/app/(tabs)/_layout.tsx`](client/app/(tabs)/_layout.tsx) to `'liquid-glass'` to restore it on iOS. That bar cannot hold a centered Claire mark on lime.

## Shared tab bar

Replace `client/app/(tabs)/_layout.tsx` (`NativeTabs`) and `client/app/(tabs)/_layout.web.tsx` (solid paper dock) with one custom tab bar.

- Five equal columns: Home, Inbox, Ask Claire, Loops, More.
- Center slot is the Kept Thread mark (`claire-kept-thread-flipped-paper-dot`) on a 42px lime tile, optically centered (`translate(-50%, -50%)` on the tile).
- No sparkles for Ask Claire.
- Bar sits inset (`left/right ~18`, `bottom` above the home indicator), height ~64, radius 22, 1px ink-at-10% border.
- Background: `BlurView` intensity ~40–50, cream/paper tint, fallback `rgba(255,253,248,0.86)` on Android/web.
- Hide the bar on chat detail and on an open Ask Claire thread (lab: `.no-tab`). Keep it on Ask Claire home.
- Hide labels. Selected side tabs use ink; unselected use `neutral.400`.

## Phase 1 — Ask Claire

Live file: `client/app/assistant.tsx` (tab wrapper: `client/app/(tabs)/ask-claire.tsx`).

Lab: `landing/ask-claire-mockups.html`.

### Home (no open thread)

Match screen 01.

- Sky canvas from the status bar through the header. No paper cap.
- Title + New (lime pill). No composer.
- Recent threads as a **vertical list**, not horizontal pills.
- 2×2 `AskToolGrid`: Catch me up, Find open loops, Check the tone, Find something.
- Drop the manifesto card (“ASK ACROSS YOUR CHATS”).
- Tab bar stays visible.

### Thread

Match screens 02–06.

- Hide the tab bar.
- Composer appears only after New or an open thread. Use `AskComposer`, not `MobileSearchField`.
- Left control is the small + on a grey disc. Menu: Tag a person, Filter by platform, Focus a chat, Find open loops, Check the tone, Find something, Clear conversation, Delete thread.
- No sparkles in the input. Loading copy can say “Claire is searching…” without a sparkles glyph — or use the Claire mark at 16px.
- User bubbles: ink. Claire answers: paper, cited sources.
- Sky still goes to the top.

### Out of scope for phase 1

In-chat Claire (quiet chip, sheet, catch-me-up, cross-chat pull, draft rewrite) lives on `client/app/chat/[chatId].tsx` and `client/app/chat/assistant/[chatId].tsx`. Do that in phase 3 so Ask Claire ships as one tab first.

## Phase 2 — Tab bar in the running app

Implement the shared bar above. Wire it once; every tab inherits it. This can land in the same PR as phase 1 if the Ask Claire home needs the new bar to look finished.

## Phase 3 — Chat chrome

- Cream canvas from the status bar through the header and composer tray. Paper only on incoming bubbles and the input field.
- Circle avatars (`aspect-ratio: 1`).
- Replace the inline composer with `ChatComposer`.
- Header stays cream, not a white WhatsApp bar.

## Phase 4 — The rest of the lab

- Rename Promises → Loops in the tab and copy. Internal `promises` table / routes can stay.
- Home / Inbox / More: match `landing/app-mockups.html` spacing, chips, and empty states.
- Replace remaining “AI = sparkles” marks that stand for Claire herself (tab, empty Ask states). Keep sparkles only if a mockup still uses them for a generic assist chip.

## Checks

- Ask Claire home has no composer and shows the tab bar.
- Open thread hides the tab bar and shows `AskComposer` + menu.
- Center tab icon is the Claire mark, centered on lime, on iOS, Android, and web.
- Chat screens are one cream surface, status bar included.
- No new color tokens. No second composer implementation.
