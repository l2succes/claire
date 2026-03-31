# Plan: Conversation Settings Screen

## Context

Users need to categorize their conversations (personal, friend, business, trip, romantic) so that Claire's AI layer can provide tailored smart suggestions. A trip group chat should surface flight/hotel cards and date pickers; a romantic conversation should nudge "text good morning" or suggest date spots. This screen also consolidates contact profile info (what Claire knows + user-editable fields) in one place, accessible from the chat header.

## Database Schema Changes

**Migration file**: `supabase/migrations/20260330000001_add_conversation_settings.sql`

### New table: `chat_categories`
```sql
CREATE TABLE chat_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  chat_id UUID NOT NULL REFERENCES chats(id),
  category TEXT NOT NULL CHECK (category IN ('personal', 'friend', 'business', 'trip', 'romantic')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, chat_id)
);
ALTER TABLE chat_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own" ON chat_categories FOR ALL USING (auth.uid() = user_id);
```

### New table: `contact_profiles`
Stores user-editable + AI-inferred contact info (separate from platform-synced `contacts` table).
```sql
CREATE TABLE contact_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  contact_id UUID REFERENCES contacts(id),
  chat_id UUID REFERENCES chats(id),
  display_name TEXT,
  email TEXT,
  phone_number TEXT,
  location TEXT,
  key_facts JSONB DEFAULT '[]'::jsonb,
  relationship_context TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, chat_id)
);
ALTER TABLE contact_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own" ON contact_profiles FOR ALL USING (auth.uid() = user_id);
```

### New table: `smart_cards`
```sql
CREATE TABLE smart_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  chat_id UUID NOT NULL REFERENCES chats(id),
  card_type TEXT NOT NULL CHECK (card_type IN ('maps', 'flight', 'datetime', 'reminder', 'action')),
  title TEXT NOT NULL,
  subtitle TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT DEFAULT 0,
  dismissed BOOLEAN DEFAULT false,
  acted_on BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE smart_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own" ON smart_cards FOR ALL USING (auth.uid() = user_id);
```

Post-migration: `NOTIFY pgrst, 'reload schema';`

---

## New Client Screen

### Route: `client/app/chat/settings/[chatId].tsx`

**Entry point**: Add an info/settings icon to the chat header in `client/app/chat/[chatId].tsx` (line ~header area). Tapping navigates:
```ts
router.push({ pathname: '/chat/settings/[chatId]', params: { chatId, platform, contact_name, chat_name, is_group } });
```

**Screen layout** (scrollable, top to bottom):

1. **Header** -- Back arrow + "Conversation Settings"
2. **Contact avatar + platform badge** -- Large avatar, platform indicator
3. **Editable fields** -- Name, Phone, Email, Location (save on blur via upsert to `contact_profiles`)
4. **Category picker** -- 5 horizontal pills with icons. Tap to set, saves immediately via upsert to `chat_categories`
   - Personal (User icon), Friend (Users), Business (Briefcase), Trip (Plane), Romantic (Heart)
5. **Smart Cards** -- Horizontal scroll of suggestion cards, generated based on category + messages
6. **What Claire Knows** -- List of AI-inferred key facts from `contact_profiles.key_facts`
7. **Platform Info** -- Read-only: platform username, phone from `contacts` table

---

## New Components

All in `client/components/`:

| Component | Purpose |
|-----------|---------|
| `CategoryPicker.tsx` | Horizontal pill row for 5 categories. Icons from lucide-react-native. |
| `SmartCard.tsx` | Rich card with icon, title, subtitle, CTA. Renders differently per `card_type`. |
| `SmartCardList.tsx` | Horizontal ScrollView of SmartCard components. Filters dismissed cards. |
| `ContactProfileSection.tsx` | "What Claire knows" fact list with confidence indicators + "Refresh insights" button. |
| `EditableField.tsx` | Tap-to-edit inline text field. Label + value, editable on tap, saves on blur. |

---

## Smart Card UI/UX — Detailed Spec

### Card Layout (all types share this shell)

Each card is a `TouchableOpacity` inside the horizontal `ScrollView`, sized at **280px wide x auto height**, with 12px gap between cards. Rounded corners (16px). Subtle border. Dark background slightly elevated from the screen bg.

```
+-----------------------------------------------+
|  [Icon 24px]   Title (bold, 16px)        [X]  |   <- header row
|                Subtitle (secondary, 13px)      |   <- optional
|                                                |
|  [ --- card-type-specific content --- ]        |   <- body (varies)
|                                                |
|  [ CTA Button (full width, rounded, 40px) ]   |   <- action
+-----------------------------------------------+
```

- **[X]** dismiss button: top-right, 20x20, muted color. Tapping sets `dismissed=true` via API.
- **Icon**: Colored circle (32px) with white lucide icon inside. Color matches card type.
- **CTA Button**: Solid fill, white text. Color matches card type accent.

### Card Type Variants

#### `maps` — Venue / Location Card
- **Icon**: MapPin (green accent)
- **Title**: Place name (e.g., "Lucali Brooklyn")
- **Subtitle**: Address or short description (e.g., "575 Henry St — Highly rated Italian")
- **Body**: Optional star rating row (filled/empty stars) + price level ("$$")
- **CTA**: "Open in Maps" — calls `Linking.openURL()` with Google Maps URL: `https://www.google.com/maps/search/?api=1&query={lat},{lng}` or `&query={encodeURIComponent(address)}`
- **Payload schema**:
  ```ts
  { place_name: string, address: string, lat?: number, lng?: number,
    rating?: number, price_level?: string, image_url?: string }
  ```

#### `flight` — Flight Search Card
- **Icon**: Plane (blue accent)
- **Title**: Route (e.g., "NYC to Lisbon")
- **Subtitle**: Suggested dates if detected (e.g., "Jun 15 - Jun 22") or "Dates flexible"
- **Body**: Origin + destination displayed as `JFK --> LIS` with city names below each code. Dotted line between them with a small plane icon.
- **CTA**: "Search Flights" — opens Google Flights URL: `https://www.google.com/travel/flights?q=flights+from+{origin}+to+{destination}+on+{date}`
- **Payload schema**:
  ```ts
  { origin: string, origin_code?: string, destination: string, dest_code?: string,
    date?: string, return_date?: string, search_url?: string }
  ```

#### `datetime` — Date/Time Suggestion Card
- **Icon**: Calendar (purple accent)
- **Title**: Event type (e.g., "Plan the trip dates" or "Schedule dinner date")
- **Subtitle**: Suggested date/time if detected (e.g., "Saturday, Jun 15 at 7pm")
- **Body**: If no date detected, shows "Pick a date" prompt. If date is present, shows a formatted date display.
- **CTA**: "Add to Calendar" — opens device calendar via `Linking.openURL('calshow:')` on iOS or `content://com.android.calendar/time/` on Android. Or "Suggest in Chat" to draft a message proposing the time.
- **Payload schema**:
  ```ts
  { suggested_date?: string, suggested_time?: string, event_type?: string,
    event_title?: string, draft_message?: string }
  ```

#### `reminder` — Nudge / Reminder Card
- **Icon**: Bell (amber/yellow accent)
- **Title**: Reminder text (e.g., "Text good morning" or "Follow up on invoice")
- **Subtitle**: Timing context (e.g., "Every morning at 9am" or "It's been 3 days")
- **Body**: For recurring reminders, shows frequency badge ("Daily", "Weekly"). For one-time, shows how long since last message.
- **CTA**: "Send Now" (pre-fills chat input with a suggested message) or "Remind Me Later" (schedules local notification via expo-notifications)
- **Payload schema**:
  ```ts
  { message: string, remind_at?: string, recurring?: boolean,
    frequency?: 'daily' | 'weekly', draft_message?: string }
  ```

#### `action` — Generic Action Card
- **Icon**: Sparkles (Claire's accent color)
- **Title**: Action description (e.g., "Plan a date this week" or "Book accommodation")
- **Subtitle**: Context (e.g., "You mentioned wanting to try somewhere new")
- **Body**: Optional list of 2-3 quick-pick options as small tappable chips (e.g., restaurant names, activity types)
- **CTA**: Dynamic label from payload (e.g., "Search Restaurants", "Draft Message", "Browse Ideas")
- **Payload schema**:
  ```ts
  { action_label: string, action_url?: string, draft_message?: string,
    quick_picks?: Array<{ label: string, value: string }> }
  ```

### Smart Card Interactions

- **Swipe left** on a card to reveal a red "Dismiss" zone (alternative to X button)
- **Tap CTA** performs the action and sets `acted_on=true` via API
- **Long press** shows a tooltip: "Why this suggestion?" with a 1-line AI reasoning
- **Empty state**: When no cards exist yet, show a muted message: "Set a category above to get smart suggestions" with a sparkle icon
- **Loading state**: While cards are generating after category change, show 2 skeleton placeholder cards (pulsing animation)
- **Refresh**: Pull-down on the smart cards section or a small refresh icon in the section header re-triggers `POST /conversations/:chatId/smart-cards`

---

## AI Prompt Templates Per Category

### System prompt base (shared across all categories)

```
You are Claire, a personal AI messaging assistant. You analyze conversations and generate
actionable smart card suggestions. You return structured JSON only.

The user has categorized this conversation as: {category}
Contact profile: {contact_profile_json}
Recent messages (last {n}): {messages_json}

Generate 3-5 smart card suggestions. Each card must have:
- card_type: one of "maps", "flight", "datetime", "reminder", "action"
- title: short, clear (max 40 chars)
- subtitle: context line (max 80 chars)
- payload: structured data for the card type (see schemas below)
- priority: 1-10 (10 = most important)

Return JSON: { "cards": [...] }
```

### Category: `trip`

```
This is a TRIP/TRAVEL group conversation. Focus on logistics and planning.

Prioritize these card types:
1. "flight" cards — if destinations or travel dates are mentioned, suggest flight searches
   with origin/destination extracted from context. Use the user's location as default origin.
2. "maps" cards — suggest hotels, restaurants, and attractions at the destination.
   Include real place names if mentioned, or popular suggestions for the destination.
3. "datetime" cards — if date ranges are being discussed, suggest finalizing dates.
   Extract any mentioned dates and propose them.
4. "action" cards — suggest practical next steps: "Book accommodation", "Create shared itinerary",
   "Split costs estimate", "Check visa requirements"

Do NOT generate reminder or romantic-type suggestions.
If no destination is mentioned yet, generate an action card: "Pick a destination" with
quick_picks of 3 trending destinations.
```

### Category: `romantic`

```
This is a ROMANTIC conversation. The user is dating or interested in this person.
Be warm, thoughtful, and encouraging. Never be creepy or manipulative.

Prioritize these card types:
1. "reminder" cards — generate recurring nudges:
   - "Text good morning" (daily, 9am, draft_message: a sweet but not over-the-top greeting)
   - "Plan something for the weekend" (weekly, Thursday evening)
   - "Check in — you haven't messaged in {days}" (if last message > 2 days ago)
2. "maps" cards — suggest date spots: restaurants, cafes, parks, activities near the user.
   Vary between casual (coffee shop) and special (nice dinner spot).
   Use the user's location from their profile if available.
3. "datetime" cards — suggest scheduling a date. If a date was discussed, propose finalizing it.
4. "action" cards — thoughtful gestures: "Send a song recommendation", "Share something funny",
   "Plan a surprise date"

Never suggest anything too forward too fast. Match the energy of the conversation.
If messages are flirty, lean into fun date ideas. If messages are early-stage,
keep suggestions light (coffee, walks, casual hangouts).
```

### Category: `business`

```
This is a BUSINESS/PROFESSIONAL conversation. Keep suggestions crisp and action-oriented.

Prioritize these card types:
1. "reminder" cards — follow-up nudges:
   - "Follow up on {topic}" if a request or proposal was discussed and no response in 2+ days
   - "Send meeting recap" after a meeting discussion
   - "Invoice reminder" if money/payment was mentioned
2. "datetime" cards — meeting scheduling. Extract proposed times and suggest confirming.
3. "action" cards — professional next steps: "Draft proposal", "Share document",
   "Schedule follow-up call", "Send introduction email"
4. "maps" cards — ONLY if a meeting location is being discussed

Tone: professional, efficient. No casual suggestions.
Focus on deliverables, deadlines, and follow-through.
```

### Category: `friend`

```
This is a FRIEND conversation. Keep it fun, casual, and social.

Prioritize these card types:
1. "reminder" cards — social nudges:
   - "Catch up — you haven't talked in {days}" (if > 7 days since last message)
   - "Their birthday is coming up on {date}" (if birthday detected in messages)
   - "Follow up on {event}" if plans were discussed but not finalized
2. "maps" cards — suggest hangout spots: bars, restaurants, activity venues, parks.
   Prefer casual/fun over formal. Use user's location.
3. "datetime" cards — if hangout plans are being discussed, suggest locking in a date.
4. "action" cards — social ideas: "Share that meme you mentioned", "Plan a game night",
   "Start a group activity", "Send that recommendation"

Keep the energy fun and low-pressure. Friends don't need aggressive follow-ups.
```

### Category: `personal`

```
This is a PERSONAL conversation (family member, close personal contact, or general).

Prioritize these card types:
1. "reminder" cards — caring check-ins:
   - "Check in on {person}" if they mentioned going through something
   - "It's been a while — send a message" (if > 14 days since last message)
   - "Remember to {thing}" if a personal favor or task was mentioned
2. "action" cards — thoughtful gestures: "Send a photo from last time you hung out",
   "Ask how {thing they mentioned} went", "Share an article they'd like"
3. "maps" cards — only if meeting up was discussed
4. "datetime" cards — only if a visit or event was being planned

Be warm and genuine. Personal conversations deserve thoughtful, not transactional, suggestions.
```

### Smart Card Generation Output Schema (enforced via JSON mode)

```json
{
  "cards": [
    {
      "card_type": "maps",
      "title": "Try Lucali in Brooklyn",
      "subtitle": "Highly rated Italian — perfect date spot",
      "payload": {
        "place_name": "Lucali",
        "address": "575 Henry St, Brooklyn, NY 11231",
        "lat": 40.6831,
        "lng": -73.9945,
        "rating": 4.7,
        "price_level": "$$$"
      },
      "priority": 8
    },
    {
      "card_type": "reminder",
      "title": "Text good morning",
      "subtitle": "Start the day on a sweet note",
      "payload": {
        "message": "Good morning text",
        "recurring": true,
        "frequency": "daily",
        "draft_message": "Good morning! Hope you have an amazing day"
      },
      "priority": 9
    },
    {
      "card_type": "datetime",
      "title": "Plan a date this weekend",
      "subtitle": "You mentioned wanting to hang out Saturday",
      "payload": {
        "suggested_date": "2026-04-04",
        "event_type": "date",
        "event_title": "Date with Sarah",
        "draft_message": "Hey! Are we still on for Saturday? What time works?"
      },
      "priority": 7
    }
  ]
}
```

---

## Server Changes

### New route: `server/src/routes/conversations.ts`

Register in `server/src/index.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/conversations/:chatId/settings` | Fetch category + profile + smart cards |
| PUT | `/conversations/:chatId/category` | Upsert category |
| PUT | `/conversations/:chatId/profile` | Upsert contact profile fields |
| POST | `/conversations/:chatId/smart-cards` | Generate smart cards via AI |
| DELETE | `/conversations/:chatId/smart-cards/:cardId` | Dismiss card |
| POST | `/conversations/:chatId/refresh-insights` | Re-run contact fact extraction |

### New service: `server/src/services/smart-card-generator.ts`

The generator:
1. Fetches chat category from `chat_categories`
2. Fetches recent messages (last 50-100) from `messages`
3. Fetches contact profile from `contact_profiles`
4. Selects the category-specific prompt template (see above)
5. Calls OpenAI with JSON mode enforced (`response_format: { type: "json_object" }`)
6. Validates returned cards against the payload schemas
7. Upserts cards into `smart_cards` table (clears old non-acted-on cards for the chat first)
8. Returns the generated cards

Cards are generated on: category set/change, manual "refresh", and (later) on new message batches.

### Modify existing services

- **`server/src/services/context-builder.ts`**: Add `chatCategory` to `ConversationContext`. Fetch from `chat_categories` in `buildContext()`.
- **`server/src/services/contact-inference.ts`**: Add `extractKeyFacts(chatId, userId)` method -- sends recent messages to LLM, returns `[{fact, confidence, source}]`, upserts into `contact_profiles.key_facts`.
- **`server/src/services/ai-processor.ts`**: When `chatCategory` is present, select category-specific prompt templates for suggestion generation.

---

## Client State Management

### New store: `client/stores/conversationSettingsStore.ts`

Zustand store (following existing pattern from `platformStore.ts`):

```ts
interface ConversationSettingsState {
  settings: Record<string, { category, profile, smartCards, isLoading }>;
  fetchSettings(chatId): Promise<void>;
  setCategory(chatId, category): Promise<void>;
  updateProfile(chatId, updates): Promise<void>;
  generateSmartCards(chatId): Promise<void>;
  dismissCard(chatId, cardId): Promise<void>;
  refreshInsights(chatId): Promise<void>;
}
```

Reads use Supabase client directly. Writes go through server API routes (for AI processing triggers). Cache per chatId in a Record.

---

## Implementation Phases

### Phase 1: Foundation (DB + Screen + Category Picker)
1. Create migration SQL, apply to Supabase
2. Create `client/app/chat/settings/[chatId].tsx` with basic layout
3. Add settings icon to `client/app/chat/[chatId].tsx` header
4. Build `CategoryPicker.tsx` and `EditableField.tsx`
5. Implement direct Supabase reads/writes for category + profile (no server routes yet)

### Phase 2: Server Routes + Contact Insights
1. Create `server/src/routes/conversations.ts`
2. Register in `server/src/index.ts`
3. Add `extractKeyFacts()` to `contact-inference.ts`
4. Build `ContactProfileSection.tsx`
5. Create `conversationSettingsStore.ts`

### Phase 3: Smart Card System
1. Create `server/src/services/smart-card-generator.ts`
2. Build `SmartCard.tsx` and `SmartCardList.tsx`
3. Wire card generation to category changes
4. Implement card actions (open maps, search flights via `Linking.openURL`)

### Phase 4: Smart Cards in Chat Screen + AI Integration
1. Build `ChatSmartCardTray.tsx` (see section below)
2. Integrate tray into `client/app/chat/[chatId].tsx` between FlatList and input bar
3. Modify `context-builder.ts` to include category
4. Add category-specific prompt templates
5. Modify `ai-processor.ts` for category-aware suggestions

---

## Smart Cards in Chat Screen — Detailed Spec

**File**: `client/app/chat/[chatId].tsx` (modify existing)

**New component**: `client/components/ChatSmartCardTray.tsx`

### Placement

The tray sits **between the message FlatList and the input bar**, inside the existing `KeyboardAvoidingView`. It slides up when cards are available and collapses when dismissed.

```
+-----------------------------------+
|          Chat Header              |
+-----------------------------------+
|                                   |
|         Message FlatList          |
|         (scrollable)              |
|                                   |
+-----------------------------------+
|  [sparkle] Smart Suggestions  [v] |  <- tray header (collapsible)
|  +--------+  +--------+  +----   |  <- horizontal card scroll
|  | Card 1 |  | Card 2 |  | Ca   |
|  +--------+  +--------+  +----   |
+-----------------------------------+
|  [attach] [Message...    ] [send] |  <- input bar
+-----------------------------------+
```

### Tray Behavior

- **Auto-shows** when `smart_cards` for this chatId exist (fetched from store on mount)
- **Collapsed state**: Single row, 48px tall. Shows: sparkle icon + "3 suggestions" text + chevron-up icon. Tapping expands.
- **Expanded state**: ~160px tall. Horizontal `ScrollView` of mini smart cards. Chevron-down icon to collapse.
- **Collapse animation**: `Animated.timing` height transition (200ms, easeInOut)
- **Dismiss all**: Long-press the tray header shows "Hide suggestions" option. Sets a local flag (per session, not persisted — cards reappear on next open).
- **When keyboard is open**: Tray stays visible but collapses to the single-row state automatically to preserve screen space.
- **No category set**: Tray does not render at all if no `chat_categories` row exists for this chat.

### Mini Card Layout (chat screen variant)

Cards in the chat tray are **compact** compared to the settings screen. 200px wide, ~120px tall.

```
+----------------------------------+
|  [Icon]  Title (bold, 14px)      |
|          Subtitle (12px, 1 line) |
|                                  |
|  [ CTA Button (compact, 32px) ]  |
+----------------------------------+
```

- No dismiss X button (dismiss via swipe-left only to keep it clean)
- No body section (maps rating, flight route diagram, etc. are settings-screen only)
- CTA button is smaller (32px height, 13px font)
- Same card type colors as full cards

### Card Actions from Chat Screen

Actions that **pre-fill the input** have special behavior:
- `reminder` cards with `draft_message` -> tapping "Send Now" populates `inputText` state and auto-focuses the TextInput. User confirms by pressing Send.
- `datetime` cards with `draft_message` -> same: populates input with the suggested scheduling message.
- `action` cards with `draft_message` -> same pattern.

Actions that **open external apps**:
- `maps` cards -> `Linking.openURL(googleMapsUrl)`
- `flight` cards -> `Linking.openURL(googleFlightsUrl)`
- `datetime` cards with "Add to Calendar" -> `Linking.openURL(calendarUrl)`

After any CTA tap, the card animates out (slide left + fade, 200ms) and is marked `acted_on=true`.

### Integration into `client/app/chat/[chatId].tsx`

Changes to the existing file:

1. **Import** `ChatSmartCardTray` and `useConversationSettingsStore`
2. **Add state**: `const { settings, fetchSettings } = useConversationSettingsStore()`
3. **Fetch on mount**: Add `fetchSettings(chatId)` to the existing `useEffect`
4. **Render tray** between the `FlatList` and the input bar `View`:
   ```tsx
   {settings[chatId]?.smartCards?.length > 0 && (
     <ChatSmartCardTray
       cards={settings[chatId].smartCards}
       onDismiss={(cardId) => dismissCard(chatId, cardId)}
       onDraftMessage={(text) => setInputText(text)}
     />
   )}
   ```
5. The `onDraftMessage` callback sets the existing `inputText` state, which the TextInput already reads from.

### New component file: `client/components/ChatSmartCardTray.tsx`

Props:
```ts
interface ChatSmartCardTrayProps {
  cards: SmartCard[];
  onDismiss: (cardId: string) => void;
  onDraftMessage: (text: string) => void;
}
```

Internal state:
- `isExpanded: boolean` (default `true` on first render, collapses after user manually collapses)
- `heightAnim: Animated.Value` for expand/collapse transition
- Listens to keyboard events via `Keyboard.addListener('keyboardDidShow')` to auto-collapse

---

## Verification

1. **DB**: Run migration, verify tables exist: `docker exec supabase-db psql -U postgres -d postgres -c "\dt chat_categories; \dt contact_profiles; \dt smart_cards;"`
2. **Navigation**: Tap settings icon in chat header -> conversation settings screen opens with correct chatId
3. **Category**: Select a category pill -> verify row upserted in `chat_categories`
4. **Profile**: Edit name/phone/email/location -> verify saved in `contact_profiles`
5. **Smart Cards**: Set category to "trip" -> trigger card generation -> verify cards render in horizontal scroll
6. **Card Actions**: Tap a maps card -> verify it opens Maps app via Linking
7. **Insights**: Tap "Refresh insights" -> verify key facts appear in contact profile section
8. **iOS + Android**: Run on both simulators to verify cross-platform rendering
