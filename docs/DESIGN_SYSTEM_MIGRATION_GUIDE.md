# Migrating the existing Claire app to the new design system

This guide moves the existing Expo client toward the visual system demonstrated by:

- [`landing/style-guide.html`](../landing/style-guide.html)
- [`landing/app-mockups.html`](../landing/app-mockups.html)
- [`landing/desktop-mockups.html`](../landing/desktop-mockups.html)

The migration must remain incremental. Do not rewrite routing, data fetching, and presentation in one change.

## 1. Migration goals

- One semantic token source for iOS, Android, macOS, Windows, and marketing web.
- Shared product language without pretending mobile and desktop layouts are identical.
- Replace one-off colors, radii, and text sizes with primitives.
- Preserve existing messaging, bridge, authentication, and AI behavior throughout the visual rollout.
- Make every migrated screen easy to compare against the HTML design reference.

## 2. Proposed design-system package

```text
packages/design-system/
├── src/
│   ├── tokens/
│   │   ├── color.ts
│   │   ├── type.ts
│   │   ├── space.ts
│   │   ├── radius.ts
│   │   ├── motion.ts
│   │   └── index.ts
│   ├── theme/
│   │   ├── ThemeProvider.tsx
│   │   └── useTheme.ts
│   ├── primitives/
│   │   ├── ClaireText.tsx
│   │   ├── ClaireButton.tsx
│   │   ├── ClaireIconButton.tsx
│   │   ├── ClaireCard.tsx
│   │   ├── ClaireAvatar.tsx
│   │   ├── ClaireChip.tsx
│   │   ├── ClaireField.tsx
│   │   └── ClaireDivider.tsx
│   └── patterns/
│       ├── ConversationRow.tsx
│       ├── MessageBubble.tsx
│       ├── PlatformBadge.tsx
│       ├── AIAssistCard.tsx
│       └── PromiseCard.tsx
└── package.json
```

Start this package inside `client/design-system/` if workspace/package wiring would slow the first PR. Extract it to `packages/` when the desktop bootstrap begins.

## 3. Token translation

The HTML files use CSS custom properties only as documentation. Native apps should import typed token objects.

```ts
export const colors = {
  ink: '#10120F',
  cream: '#F4F1EA',
  paper: '#FFFDF8',
  lime: '#DFFF64',
  limeHover: '#D2F04F',
  sky: '#B9DCFF',
  blush: '#F2CFE1',
  lavender: '#D8CCFF',
  mint: '#BDEBD5',
  coral: '#FF745F',
  focus: '#3C68FF',
  success: '#18794E',
  warning: '#B75D00',
  danger: '#C83A3A',
  neutral: {
    50: '#FAF9F6',
    100: '#F0EEE8',
    200: '#DFDCD3',
    400: '#9B9B91',
    600: '#62635D',
    800: '#2D2F2B',
    950: '#10120F',
  },
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64, 24: 96 } as const;
export const radius = { control: 12, card: 20, panel: 32, feature: 48, pill: 999 } as const;
```

Native typography should use the system font first. Inter may remain in marketing pages, but an AppKit/UIKit system font gives better platform metrics and accessibility. DM Mono is optional for compact metadata; use the platform monospaced system font where possible.

## 4. Semantic typography

Define variants instead of passing raw font sizes:

| Variant        | Mobile | Desktop | Usage                             |
| -------------- | ------ | ------- | --------------------------------- |
| `display`      | 42/42  | 52/52   | onboarding and major empty states |
| `screenTitle`  | 31/34  | 28/31   | screen/window destination title   |
| `sectionTitle` | 20/24  | 18/22   | section and inspector headings    |
| `body`         | 15/22  | 14/20   | primary reading text              |
| `bodySmall`    | 13/18  | 12/17   | supporting content                |
| `label`        | 11/15  | 10/14   | controls and metadata             |
| `monoLabel`    | 10/14  | 9/13    | AI/status labels                  |

Every text component must support Dynamic Type/font scaling. Avoid fixed-height containers around user-generated text.

## 5. Component rules

### Avatar

- Always set equal width and height, `aspectRatio: 1`, and `flexShrink: 0`.
- Platform badge is positioned relative to the avatar wrapper, never allowed to change avatar layout.
- Text fallback uses initials and a stable contact-derived color.

### Platform badge

- Include a glyph and accessible platform name; color alone is insufficient.
- Keep the badge subordinate to the person/conversation.
- Use actual vector/SF Symbol assets in production, not the letter placeholders used in HTML mockups.

### Conversation row

- Person name, latest message, timestamp, unread state, and platform badge.
- Platform capability/health is not shown unless action is required.
- Swipe/context actions are declared from platform capabilities.

### AI assist card

- Always states why it appeared: quick context, promise found, suggested reply, or answer.
- Generated answers link to source messages.
- Primary action is explicit; dismissal and correction are always available.
- AI color is contextual (`sky`, `lavender`, or warm promise yellow), never a generic gradient.

### Button

- Mobile touch target: at least 44 points even when the visual icon is smaller.
- Desktop pointer target: at least 28 points, preferred 32–36.
- Focus ring: 3-point `focus` token with offset.
- Destructive actions use `danger` only after intent is clear.

## 6. Existing-screen mapping

| Existing route/component         | New design target             | Migration notes                                                 |
| -------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| `app/(tabs)/dashboard.tsx`       | Daily Brief                   | Keep existing smart-card data; replace section composition      |
| `app/(tabs)/messages.tsx`        | Unified Inbox                 | Move platform filters into chips; normalize conversation rows   |
| `app/chat/[chatId].tsx`          | Standard Chat                 | Add AI context ribbon and inline promise card behind flags      |
| `app/(tabs)/promises.tsx`        | Promises                      | Introduce summary metrics and source-message links              |
| `app/(tabs)/contacts.tsx`        | People                        | Add context-needed section and relationship entry               |
| `app/chat/settings/[chatId].tsx` | Relationship Memory           | Recompose prompt, type, and tone around a contact model         |
| `app/(tabs)/settings.tsx`        | Settings Hub                  | Split Claire behavior from app/infrastructure settings          |
| `app/settings/ai.tsx`            | AI Behavior                   | Independent toggles plus privacy explanation                    |
| `PlatformAuthModal.tsx`          | Connection Setup              | Render steps from capability/connection definitions             |
| `MessageCard.tsx`                | Conversation/Message Patterns | Split inbox row from chat bubble instead of one card doing both |

## 7. Recommended rollout

### Step 1 — snapshot and protect behavior

- Capture screenshots and flow tests for sign-in, inbox filters, chat send, platform auth, promise tracking, and relationship settings.
- Record existing analytics and accessibility identifiers.
- Add a `newDesignSystem` local/development flag. Do not maintain two data implementations; switch only presentation.

### Step 2 — tokens and primitives

- Add typed tokens.
- Build text, button, icon button, card, avatar, chip, field, and divider primitives.
- Add Storybook-like development route or component gallery in the Expo app.
- Test light mode first; do not invent dark mode colors by inverting values.

### Step 3 — shared patterns

- Platform badge.
- Conversation row.
- Message bubble and composer.
- AI assist and promise cards.
- Settings row and toggle.
- Empty, error, and skeleton states.

### Step 4 — migrate the core loop

1. Inbox.
2. Chat.
3. Daily brief.
4. Promises.
5. Search.

Ship one screen at a time behind the design flag. Run existing functional tests on both variants until the new variant replaces the old one.

### Step 5 — people and settings

- Migrate People and relationship memory.
- Replace free-form relationship strings with an enum plus optional custom label.
- Keep the prompt user-authored and visible.
- Migrate settings and connection setup after the core loop is stable.

### Step 6 — remove legacy styling

- Delete old color constants only when no references remain.
- Collapse duplicate cards and button variants.
- Remove the feature flag.
- Update screenshots and end-to-end selectors.

### Step 7 — extract for desktop

- Move tokens/primitives to `packages/design-system`.
- Keep mobile navigation and desktop window composition outside the shared package.
- Share patterns only when their inputs and behavior match; allow `.macos.tsx`
  and `.windows.tsx` variants for layout and native affordances.

## 8. Navigation migration

The proposed mobile shell is Home, Inbox, Promises, and Search. People is an Inbox subview and Settings opens from profile.

Do not change the tab topology in the same PR that visually redesigns the screens. Suggested order:

1. Reskin existing tabs without route changes.
2. Add the Search destination and global search implementation.
3. Move Contacts into the Inbox/People stack.
4. Move Settings to the profile entry.
5. Update deep links and notification routes.
6. Remove old tab routes only after telemetry and tests confirm equivalent access.

## 9. Data-model additions for relationship memory

```ts
type RelationshipType =
  | 'business'
  | 'client'
  | 'colleague'
  | 'mentor'
  | 'family'
  | 'close_friend'
  | 'friend'
  | 'acquaintance'
  | 'dating'
  | 'partner'
  | 'former_partner'
  | 'community'
  | 'service_provider'
  | 'other';

type SuggestionTone = 'warm_direct' | 'professional' | 'casual' | 'playful' | 'custom';

interface RelationshipMemory {
  contactId: string;
  type: RelationshipType;
  customType?: string;
  prompt?: string;
  suggestionTone: SuggestionTone;
  updatedAt: string;
}
```

Relationship type changes suggestion context only. It must never change access, notification priority, retention, or safety policy without a separate explicit control.

## 10. Platform-specific styling policy

Use three layers:

1. **Shared semantics:** colors, spacing, typography variants, state names.
2. **Shared patterns:** data and interaction contract.
3. **Platform composition:** mobile tab screens versus desktop panes/windows.

Examples:

- `ConversationRow.tsx` shares behavior and base visuals.
- `ConversationRow.macos.tsx` and `ConversationRow.windows.tsx` add host
  keyboard conventions, hover, context menus, selection, and pointer density.
- `ChatScreen` remains separate mobile/desktop composition while reusing bubbles, AI cards, and composer logic.
- Do not scale a 390-point phone screen to fill a desktop window.

## 11. Styling technology

The marketing mockups use CSS, but native production code should consume token
objects and React Native style props. Do not make Tailwind/NativeWind a
requirement for the shared desktop package until both desktop-host compatibility
spikes are proven.

During migration:

- Existing NativeWind screens can import token values through the client Tailwind mapping.
- New shared primitives should accept semantic props and produce native styles internally.
- Feature screens should not contain raw hex codes.
- Use continuous border curves on Apple platforms where supported.
- Use native `boxShadow`, not legacy `shadow*`/`elevation` APIs in new components.

## 12. Accessibility checklist

- 44-point mobile touch targets.
- Visible keyboard focus on desktop.
- Correct roles and labels for icon-only buttons.
- Platform badges announced after the contact/conversation name.
- Dynamic Type and system text scaling.
- Reduced motion and transparency.
- Contrast testing for cream/paper and all pastel surfaces.
- Text or icons accompany every status color.
- Message state (sending, failed, read) is not communicated only through color.

## 13. Visual QA matrix

Test each migrated screen at:

- iPhone SE width, standard iPhone, and large iPhone.
- iPad split view if tablet support remains enabled.
- macOS and Windows at 1,024×680 minimum, 1,280×800, and 1,440×900.
- Increased text size at 135% and 200%.
- Reduce Motion, Increase Contrast, and VoiceOver.
- Empty, one-item, typical, and high-density data.
- Every platform capability combination.
- Light mode; add dark mode only after semantic dark tokens are approved.

## 14. Definition of done for each screen

- No raw colors, radii, or spacing values outside an approved exception.
- All icon-only controls have accessible names and correct target sizes.
- Existing functional flow tests pass.
- New visual states have screenshot coverage.
- Loading, empty, offline, error, and partial states exist.
- User-generated text scales without clipping.
- Platform-specific actions are capability-gated.
- Design reference and implementation differ only for documented native behavior.
