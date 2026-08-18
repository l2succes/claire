// SPDX-License-Identifier: Apache-2.0
import { C, Code, Doc, P, Section, Table } from '@/components/docs/blocks';
import type { DocMeta } from '@/lib/docs-types';

export const meta: DocMeta = {
  title: "Conversation settings and smart cards plan",
  description: "Design and implementation plan for conversation settings, profiles, and AI smart cards.",
  section: 'plans',
  status: 'draft',
  lastReviewed: '2026-08-17',
  related: ['/docs/build-claire/design-system'],
};

export default function Page() {
  return (
    <Doc>
      <Section id="context" title="Context">
      <P>{"Users need to categorize their conversations (personal, friend, business, trip, romantic) so that Claire's AI layer can provide tailored smart suggestions. A trip group chat should surface flight/hotel cards and date pickers; a romantic conversation should nudge \"text good morning\" or suggest date spots. This screen also consolidates contact profile info (what Claire knows + user-editable fields) in one place, accessible from the chat header."}</P>
      </Section>
      <Section id="database-schema-changes" title="Database Schema Changes">
      <P><b>Migration file</b>: <C>supabase/migrations/20260330000001_add_conversation_settings.sql</C></P>
      <Section id="new-table-chat-categories" title="New table: chat_categories" level={3}>
      <Code lang="sql">{"CREATE TABLE chat_categories (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id UUID NOT NULL REFERENCES auth.users(id),\n  chat_id UUID NOT NULL REFERENCES chats(id),\n  category TEXT NOT NULL CHECK (category IN ('personal', 'friend', 'business', 'trip', 'romantic')),\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now(),\n  UNIQUE(user_id, chat_id)\n);\nALTER TABLE chat_categories ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"Users manage own\" ON chat_categories FOR ALL USING (auth.uid() = user_id);"}</Code>
      </Section>
      <Section id="new-table-contact-profiles" title="New table: contact_profiles" level={3}>
      <P>Stores user-editable + AI-inferred contact info (separate from platform-synced <C>contacts</C> table).</P>
      <Code lang="sql">{"CREATE TABLE contact_profiles (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id UUID NOT NULL REFERENCES auth.users(id),\n  contact_id UUID REFERENCES contacts(id),\n  chat_id UUID REFERENCES chats(id),\n  display_name TEXT,\n  email TEXT,\n  phone_number TEXT,\n  location TEXT,\n  key_facts JSONB DEFAULT '[]'::jsonb,\n  relationship_context TEXT,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now(),\n  UNIQUE(user_id, chat_id)\n);\nALTER TABLE contact_profiles ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"Users manage own\" ON contact_profiles FOR ALL USING (auth.uid() = user_id);"}</Code>
      </Section>
      <Section id="new-table-smart-cards" title="New table: smart_cards" level={3}>
      <Code lang="sql">{"CREATE TABLE smart_cards (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  user_id UUID NOT NULL REFERENCES auth.users(id),\n  chat_id UUID NOT NULL REFERENCES chats(id),\n  card_type TEXT NOT NULL CHECK (card_type IN ('maps', 'flight', 'datetime', 'reminder', 'action')),\n  title TEXT NOT NULL,\n  subtitle TEXT,\n  payload JSONB NOT NULL DEFAULT '{}'::jsonb,\n  priority INT DEFAULT 0,\n  dismissed BOOLEAN DEFAULT false,\n  acted_on BOOLEAN DEFAULT false,\n  expires_at TIMESTAMPTZ,\n  created_at TIMESTAMPTZ DEFAULT now()\n);\nALTER TABLE smart_cards ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"Users manage own\" ON smart_cards FOR ALL USING (auth.uid() = user_id);"}</Code>
      <P>Post-migration: <C>{"NOTIFY pgrst, 'reload schema';"}</C></P>
      </Section>
      </Section>
      <Section id="new-client-screen" title="New Client Screen">
      <Section id="route-mobile-app-chat-settings-chatid-tsx" title="Route: mobile/app/chat/settings/[chatId].tsx" level={3}>
      <P><b>Entry point</b>: Add an info/settings icon to the chat header in <C>mobile/app/chat/[chatId].tsx</C> (line ~header area). Tapping navigates:</P>
      <Code lang="ts">{"router.push({ pathname: '/chat/settings/[chatId]', params: { chatId, platform, contact_name, chat_name, is_group } });"}</Code>
      <P><b>Screen layout</b> (scrollable, top to bottom):</P>
      <ol>
              <li><b>Header</b>{" -- Back arrow + \"Conversation Settings\""}</li>
              <li><b>Contact avatar + platform badge</b> -- Large avatar, platform indicator</li>
              <li><b>Editable fields</b> -- Name, Phone, Email, Location (save on blur via upsert to <C>contact_profiles</C>)</li>
              <li><b>Category picker</b> -- 5 horizontal pills with icons. Tap to set, saves immediately via upsert to <C>chat_categories</C></li>
              <li>Personal (User icon), Friend (Users), Business (Briefcase), Trip (Plane), Romantic (Heart)</li>
              <li><b>Smart Cards</b> -- Horizontal scroll of suggestion cards, generated based on category + messages</li>
              <li><b>What Claire Knows</b> -- List of AI-inferred key facts from <C>contact_profiles.key_facts</C></li>
              <li><b>Platform Info</b> -- Read-only: platform username, phone from <C>contacts</C> table</li>
            </ol>
      </Section>
      </Section>
      <Section id="new-components" title="New Components">
      <P>All in <C>mobile/components/</C>:</P>
      <Table
              head={[<>Component</>, <>Purpose</>]}
              rows={[
                [<><C>CategoryPicker.tsx</C></>, <>Horizontal pill row for 5 categories. Icons from lucide-react-native.</>],
                [<><C>SmartCard.tsx</C></>, <>Rich card with icon, title, subtitle, CTA. Renders differently per <C>card_type</C>.</>],
                [<><C>SmartCardList.tsx</C></>, <>Horizontal ScrollView of SmartCard components. Filters dismissed cards.</>],
                [<><C>ContactProfileSection.tsx</C></>, <>{"\"What Claire knows\" fact list with confidence indicators + \"Refresh insights\" button."}</>],
                [<><C>EditableField.tsx</C></>, <>Tap-to-edit inline text field. Label + value, editable on tap, saves on blur.</>],
              ]}
            />
      </Section>
      <Section id="smart-card-ui-ux-detailed-spec" title="Smart Card UI/UX — Detailed Spec">
      <Section id="card-layout-all-types-share-this-shell" title="Card Layout (all types share this shell)" level={3}>
      <P>Each card is a <C>TouchableOpacity</C> inside the horizontal <C>ScrollView</C>, sized at <b>280px wide x auto height</b>, with 12px gap between cards. Rounded corners (16px). Subtle border. Dark background slightly elevated from the screen bg.</P>
      <Code lang="text">{"+-----------------------------------------------+\n|  [Icon 24px]   Title (bold, 16px)        [X]  |   <- header row\n|                Subtitle (secondary, 13px)      |   <- optional\n|                                                |\n|  [ --- card-type-specific content --- ]        |   <- body (varies)\n|                                                |\n|  [ CTA Button (full width, rounded, 40px) ]   |   <- action\n+-----------------------------------------------+"}</Code>
      <ul>
              <li><b>[X]</b> dismiss button: top-right, 20x20, muted color. Tapping sets <C>dismissed=true</C> via API.</li>
              <li><b>Icon</b>: Colored circle (32px) with white lucide icon inside. Color matches card type.</li>
              <li><b>CTA Button</b>: Solid fill, white text. Color matches card type accent.</li>
            </ul>
      </Section>
      <Section id="card-type-variants" title="Card Type Variants" level={3}>
      <Section id="maps-venue-location-card" title="maps — Venue / Location Card" level={4}>
      <ul>
              <li><b>Icon</b>: MapPin (green accent)</li>
              <li><b>Title</b>{": Place name (e.g., \"Lucali Brooklyn\")"}</li>
              <li><b>Subtitle</b>{": Address or short description (e.g., \"575 Henry St — Highly rated Italian\")"}</li>
              <li><b>Body</b>{": Optional star rating row (filled/empty stars) + price level (\"$$\")"}</li>
              <li><b>CTA</b>{": \"Open in Maps\" — calls "}<C>Linking.openURL()</C> with Google Maps URL: <C>{"https://www.google.com/maps/search/?api=1&query={lat},{lng}"}</C> or <C>{"&query={encodeURIComponent(address)}"}</C></li>
              <li><b>Payload schema</b>: ``<C>{"ts { place_name: string, address: string, lat?: number, lng?: number, rating?: number, price_level?: string, image_url?: string } "}</C>``</li>
            </ul>
      </Section>
      <Section id="flight-flight-search-card" title="flight — Flight Search Card" level={4}>
      <ul>
              <li><b>Icon</b>: Plane (blue accent)</li>
              <li><b>Title</b>{": Route (e.g., \"NYC to Lisbon\")"}</li>
              <li><b>Subtitle</b>{": Suggested dates if detected (e.g., \"Jun 15 - Jun 22\") or \"Dates flexible\""}</li>
              <li><b>Body</b>: Origin + destination displayed as <C>{"JFK --> LIS"}</C> with city names below each code. Dotted line between them with a small plane icon.</li>
              <li><b>CTA</b>{": \"Search Flights\" — opens Google Flights URL: "}<C>{"https://www.google.com/travel/flights?q=flights+from+{origin}+to+{destination}+on+{date}"}</C></li>
              <li><b>Payload schema</b>: ``<C>{"ts { origin: string, origin_code?: string, destination: string, dest_code?: string, date?: string, return_date?: string, search_url?: string } "}</C>``</li>
            </ul>
      </Section>
      <Section id="datetime-date-time-suggestion-card" title="datetime — Date/Time Suggestion Card" level={4}>
      <ul>
              <li><b>Icon</b>: Calendar (purple accent)</li>
              <li><b>Title</b>{": Event type (e.g., \"Plan the trip dates\" or \"Schedule dinner date\")"}</li>
              <li><b>Subtitle</b>{": Suggested date/time if detected (e.g., \"Saturday, Jun 15 at 7pm\")"}</li>
              <li><b>Body</b>{": If no date detected, shows \"Pick a date\" prompt. If date is present, shows a formatted date display."}</li>
              <li><b>CTA</b>{": \"Add to Calendar\" — opens device calendar via "}<C>{"Linking.openURL('calshow:')"}</C> on iOS or <C>content://com.android.calendar/time/</C>{" on Android. Or \"Suggest in Chat\" to draft a message proposing the time."}</li>
              <li><b>Payload schema</b>: ``<C>{"ts { suggested_date?: string, suggested_time?: string, event_type?: string, event_title?: string, draft_message?: string } "}</C>``</li>
            </ul>
      </Section>
      <Section id="reminder-nudge-reminder-card" title="reminder — Nudge / Reminder Card" level={4}>
      <ul>
              <li><b>Icon</b>: Bell (amber/yellow accent)</li>
              <li><b>Title</b>{": Reminder text (e.g., \"Text good morning\" or \"Follow up on invoice\")"}</li>
              <li><b>Subtitle</b>{": Timing context (e.g., \"Every morning at 9am\" or \"It's been 3 days\")"}</li>
              <li><b>Body</b>{": For recurring reminders, shows frequency badge (\"Daily\", \"Weekly\"). For one-time, shows how long since last message."}</li>
              <li><b>CTA</b>{": \"Send Now\" (pre-fills chat input with a suggested message) or \"Remind Me Later\" (schedules local notification via expo-notifications)"}</li>
              <li><b>Payload schema</b>: ``<C>{"ts { message: string, remind_at?: string, recurring?: boolean, frequency?: 'daily' | 'weekly', draft_message?: string } "}</C>``</li>
            </ul>
      </Section>
      <Section id="action-generic-action-card" title="action — Generic Action Card" level={4}>
      <ul>
              <li><b>Icon</b>{": Sparkles (Claire's accent color)"}</li>
              <li><b>Title</b>{": Action description (e.g., \"Plan a date this week\" or \"Book accommodation\")"}</li>
              <li><b>Subtitle</b>{": Context (e.g., \"You mentioned wanting to try somewhere new\")"}</li>
              <li><b>Body</b>: Optional list of 2-3 quick-pick options as small tappable chips (e.g., restaurant names, activity types)</li>
              <li><b>CTA</b>{": Dynamic label from payload (e.g., \"Search Restaurants\", \"Draft Message\", \"Browse Ideas\")"}</li>
              <li><b>Payload schema</b>: ``<C>{"ts { action_label: string, action_url?: string, draft_message?: string, quick_picks?: Array<{ label: string, value: string }> } "}</C>``</li>
            </ul>
      </Section>
      </Section>
      <Section id="smart-card-interactions" title="Smart Card Interactions" level={3}>
      <ul>
              <li><b>Swipe left</b>{" on a card to reveal a red \"Dismiss\" zone (alternative to X button)"}</li>
              <li><b>Tap CTA</b> performs the action and sets <C>acted_on=true</C> via API</li>
              <li><b>Long press</b>{" shows a tooltip: \"Why this suggestion?\" with a 1-line AI reasoning"}</li>
              <li><b>Empty state</b>{": When no cards exist yet, show a muted message: \"Set a category above to get smart suggestions\" with a sparkle icon"}</li>
              <li><b>Loading state</b>: While cards are generating after category change, show 2 skeleton placeholder cards (pulsing animation)</li>
              <li><b>Refresh</b>: Pull-down on the smart cards section or a small refresh icon in the section header re-triggers <C>POST /conversations/:chatId/smart-cards</C></li>
            </ul>
      </Section>
      </Section>
      <Section id="ai-prompt-templates-per-category" title="AI Prompt Templates Per Category">
      <Section id="system-prompt-base-shared-across-all-categories" title="System prompt base (shared across all categories)" level={3}>
      <Code lang="text">{"You are Claire, a personal AI messaging assistant. You analyze conversations and generate\nactionable smart card suggestions. You return structured JSON only.\n\nThe user has categorized this conversation as: {category}\nContact profile: {contact_profile_json}\nRecent messages (last {n}): {messages_json}\n\nGenerate 3-5 smart card suggestions. Each card must have:\n- card_type: one of \"maps\", \"flight\", \"datetime\", \"reminder\", \"action\"\n- title: short, clear (max 40 chars)\n- subtitle: context line (max 80 chars)\n- payload: structured data for the card type (see schemas below)\n- priority: 1-10 (10 = most important)\n\nReturn JSON: { \"cards\": [...] }"}</Code>
      </Section>
      <Section id="category-trip" title="Category: trip" level={3}>
      <Code lang="text">{"This is a TRIP/TRAVEL group conversation. Focus on logistics and planning.\n\nPrioritize these card types:\n1. \"flight\" cards — if destinations or travel dates are mentioned, suggest flight searches\n   with origin/destination extracted from context. Use the user's location as default origin.\n2. \"maps\" cards — suggest hotels, restaurants, and attractions at the destination.\n   Include real place names if mentioned, or popular suggestions for the destination.\n3. \"datetime\" cards — if date ranges are being discussed, suggest finalizing dates.\n   Extract any mentioned dates and propose them.\n4. \"action\" cards — suggest practical next steps: \"Book accommodation\", \"Create shared itinerary\",\n   \"Split costs estimate\", \"Check visa requirements\"\n\nDo NOT generate reminder or romantic-type suggestions.\nIf no destination is mentioned yet, generate an action card: \"Pick a destination\" with\nquick_picks of 3 trending destinations."}</Code>
      </Section>
      <Section id="category-romantic" title="Category: romantic" level={3}>
      <Code lang="text">{"This is a ROMANTIC conversation. The user is dating or interested in this person.\nBe warm, thoughtful, and encouraging. Never be creepy or manipulative.\n\nPrioritize these card types:\n1. \"reminder\" cards — generate recurring nudges:\n   - \"Text good morning\" (daily, 9am, draft_message: a sweet but not over-the-top greeting)\n   - \"Plan something for the weekend\" (weekly, Thursday evening)\n   - \"Check in — you haven't messaged in {days}\" (if last message > 2 days ago)\n2. \"maps\" cards — suggest date spots: restaurants, cafes, parks, activities near the user.\n   Vary between casual (coffee shop) and special (nice dinner spot).\n   Use the user's location from their profile if available.\n3. \"datetime\" cards — suggest scheduling a date. If a date was discussed, propose finalizing it.\n4. \"action\" cards — thoughtful gestures: \"Send a song recommendation\", \"Share something funny\",\n   \"Plan a surprise date\"\n\nNever suggest anything too forward too fast. Match the energy of the conversation.\nIf messages are flirty, lean into fun date ideas. If messages are early-stage,\nkeep suggestions light (coffee, walks, casual hangouts)."}</Code>
      </Section>
      <Section id="category-business" title="Category: business" level={3}>
      <Code lang="text">{"This is a BUSINESS/PROFESSIONAL conversation. Keep suggestions crisp and action-oriented.\n\nPrioritize these card types:\n1. \"reminder\" cards — follow-up nudges:\n   - \"Follow up on {topic}\" if a request or proposal was discussed and no response in 2+ days\n   - \"Send meeting recap\" after a meeting discussion\n   - \"Invoice reminder\" if money/payment was mentioned\n2. \"datetime\" cards — meeting scheduling. Extract proposed times and suggest confirming.\n3. \"action\" cards — professional next steps: \"Draft proposal\", \"Share document\",\n   \"Schedule follow-up call\", \"Send introduction email\"\n4. \"maps\" cards — ONLY if a meeting location is being discussed\n\nTone: professional, efficient. No casual suggestions.\nFocus on deliverables, deadlines, and follow-through."}</Code>
      </Section>
      <Section id="category-friend" title="Category: friend" level={3}>
      <Code lang="text">{"This is a FRIEND conversation. Keep it fun, casual, and social.\n\nPrioritize these card types:\n1. \"reminder\" cards — social nudges:\n   - \"Catch up — you haven't talked in {days}\" (if > 7 days since last message)\n   - \"Their birthday is coming up on {date}\" (if birthday detected in messages)\n   - \"Follow up on {event}\" if plans were discussed but not finalized\n2. \"maps\" cards — suggest hangout spots: bars, restaurants, activity venues, parks.\n   Prefer casual/fun over formal. Use user's location.\n3. \"datetime\" cards — if hangout plans are being discussed, suggest locking in a date.\n4. \"action\" cards — social ideas: \"Share that meme you mentioned\", \"Plan a game night\",\n   \"Start a group activity\", \"Send that recommendation\"\n\nKeep the energy fun and low-pressure. Friends don't need aggressive follow-ups."}</Code>
      </Section>
      <Section id="category-personal" title="Category: personal" level={3}>
      <Code lang="text">{"This is a PERSONAL conversation (family member, close personal contact, or general).\n\nPrioritize these card types:\n1. \"reminder\" cards — caring check-ins:\n   - \"Check in on {person}\" if they mentioned going through something\n   - \"It's been a while — send a message\" (if > 14 days since last message)\n   - \"Remember to {thing}\" if a personal favor or task was mentioned\n2. \"action\" cards — thoughtful gestures: \"Send a photo from last time you hung out\",\n   \"Ask how {thing they mentioned} went\", \"Share an article they'd like\"\n3. \"maps\" cards — only if meeting up was discussed\n4. \"datetime\" cards — only if a visit or event was being planned\n\nBe warm and genuine. Personal conversations deserve thoughtful, not transactional, suggestions."}</Code>
      </Section>
      <Section id="smart-card-generation-output-schema-enforced-via-json-mode" title="Smart Card Generation Output Schema (enforced via JSON mode)" level={3}>
      <Code lang="json">{"{\n  \"cards\": [\n    {\n      \"card_type\": \"maps\",\n      \"title\": \"Try Lucali in Brooklyn\",\n      \"subtitle\": \"Highly rated Italian — perfect date spot\",\n      \"payload\": {\n        \"place_name\": \"Lucali\",\n        \"address\": \"575 Henry St, Brooklyn, NY 11231\",\n        \"lat\": 40.6831,\n        \"lng\": -73.9945,\n        \"rating\": 4.7,\n        \"price_level\": \"$$$\"\n      },\n      \"priority\": 8\n    },\n    {\n      \"card_type\": \"reminder\",\n      \"title\": \"Text good morning\",\n      \"subtitle\": \"Start the day on a sweet note\",\n      \"payload\": {\n        \"message\": \"Good morning text\",\n        \"recurring\": true,\n        \"frequency\": \"daily\",\n        \"draft_message\": \"Good morning! Hope you have an amazing day\"\n      },\n      \"priority\": 9\n    },\n    {\n      \"card_type\": \"datetime\",\n      \"title\": \"Plan a date this weekend\",\n      \"subtitle\": \"You mentioned wanting to hang out Saturday\",\n      \"payload\": {\n        \"suggested_date\": \"2026-04-04\",\n        \"event_type\": \"date\",\n        \"event_title\": \"Date with Sarah\",\n        \"draft_message\": \"Hey! Are we still on for Saturday? What time works?\"\n      },\n      \"priority\": 7\n    }\n  ]\n}"}</Code>
      </Section>
      </Section>
      <Section id="server-changes" title="Server Changes">
      <Section id="new-route-server-src-routes-conversations-ts" title="New route: server/src/routes/conversations.ts" level={3}>
      <P>Register in <C>server/src/index.ts</C>.</P>
      <Table
              head={[<>Method</>, <>Path</>, <>Purpose</>]}
              rows={[
                [<>GET</>, <><C>/conversations/:chatId/settings</C></>, <>Fetch category + profile + smart cards</>],
                [<>PUT</>, <><C>/conversations/:chatId/category</C></>, <>Upsert category</>],
                [<>PUT</>, <><C>/conversations/:chatId/profile</C></>, <>Upsert contact profile fields</>],
                [<>POST</>, <><C>/conversations/:chatId/smart-cards</C></>, <>Generate smart cards via AI</>],
                [<>DELETE</>, <><C>/conversations/:chatId/smart-cards/:cardId</C></>, <>Dismiss card</>],
                [<>POST</>, <><C>/conversations/:chatId/refresh-insights</C></>, <>Re-run contact fact extraction</>],
              ]}
            />
      </Section>
      <Section id="new-service-server-src-services-smart-card-generator-ts" title="New service: server/src/services/smart-card-generator.ts" level={3}>
      <P>The generator:</P>
      <ol>
              <li>Fetches chat category from <C>chat_categories</C></li>
              <li>Fetches recent messages (last 50-100) from <C>messages</C></li>
              <li>Fetches contact profile from <C>contact_profiles</C></li>
              <li>Selects the category-specific prompt template (see above)</li>
              <li>Calls OpenAI with JSON mode enforced (<C>{"response_format: { type: \"json_object\" }"}</C>)</li>
              <li>Validates returned cards against the payload schemas</li>
              <li>Upserts cards into <C>smart_cards</C> table (clears old non-acted-on cards for the chat first)</li>
              <li>Returns the generated cards</li>
            </ol>
      <P>{"Cards are generated on: category set/change, manual \"refresh\", and (later) on new message batches."}</P>
      </Section>
      <Section id="modify-existing-services" title="Modify existing services" level={3}>
      <ul>
              <li><b>`server/src/services/context-builder.ts`</b>: Add <C>chatCategory</C> to <C>ConversationContext</C>. Fetch from <C>chat_categories</C> in <C>buildContext()</C>.</li>
              <li><b>`server/src/services/contact-inference.ts`</b>: Add <C>extractKeyFacts(chatId, userId)</C> method -- sends recent messages to LLM, returns <C>{"[{fact, confidence, source}]"}</C>, upserts into <C>contact_profiles.key_facts</C>.</li>
              <li><b>`server/src/services/ai-processor.ts`</b>: When <C>chatCategory</C> is present, select category-specific prompt templates for suggestion generation.</li>
            </ul>
      </Section>
      </Section>
      <Section id="mobile-state-management" title="Mobile State Management">
      <Section id="new-store-mobile-stores-conversationsettingsstore-ts" title="New store: mobile/stores/conversationSettingsStore.ts" level={3}>
      <P>Zustand store (following existing pattern from <C>platformStore.ts</C>):</P>
      <Code lang="ts">{"interface ConversationSettingsState {\n  settings: Record<string, { category, profile, smartCards, isLoading }>;\n  fetchSettings(chatId): Promise<void>;\n  setCategory(chatId, category): Promise<void>;\n  updateProfile(chatId, updates): Promise<void>;\n  generateSmartCards(chatId): Promise<void>;\n  dismissCard(chatId, cardId): Promise<void>;\n  refreshInsights(chatId): Promise<void>;\n}"}</Code>
      <P>Reads use Supabase client directly. Writes go through server API routes (for AI processing triggers). Cache per chatId in a Record.</P>
      </Section>
      </Section>
      <Section id="implementation-phases" title="Implementation Phases">
      <Section id="phase-1-foundation-db-screen-category-picker" title="Phase 1: Foundation (DB + Screen + Category Picker)" level={3}>
      <ol>
              <li>Create migration SQL, apply to Supabase</li>
              <li>Create <C>mobile/app/chat/settings/[chatId].tsx</C> with basic layout</li>
              <li>Add settings icon to <C>mobile/app/chat/[chatId].tsx</C> header</li>
              <li>Build <C>CategoryPicker.tsx</C> and <C>EditableField.tsx</C></li>
              <li>Implement direct Supabase reads/writes for category + profile (no server routes yet)</li>
            </ol>
      </Section>
      <Section id="phase-2-server-routes-contact-insights" title="Phase 2: Server Routes + Contact Insights" level={3}>
      <ol>
              <li>Create <C>server/src/routes/conversations.ts</C></li>
              <li>Register in <C>server/src/index.ts</C></li>
              <li>Add <C>extractKeyFacts()</C> to <C>contact-inference.ts</C></li>
              <li>Build <C>ContactProfileSection.tsx</C></li>
              <li>Create <C>conversationSettingsStore.ts</C></li>
            </ol>
      </Section>
      <Section id="phase-3-smart-card-system" title="Phase 3: Smart Card System" level={3}>
      <ol>
              <li>Create <C>server/src/services/smart-card-generator.ts</C></li>
              <li>Build <C>SmartCard.tsx</C> and <C>SmartCardList.tsx</C></li>
              <li>Wire card generation to category changes</li>
              <li>Implement card actions (open maps, search flights via <C>Linking.openURL</C>)</li>
            </ol>
      </Section>
      <Section id="phase-4-smart-cards-in-chat-screen-ai-integration" title="Phase 4: Smart Cards in Chat Screen + AI Integration" level={3}>
      <ol>
              <li>Build <C>ChatSmartCardTray.tsx</C> (see section below)</li>
              <li>Integrate tray into <C>mobile/app/chat/[chatId].tsx</C> between FlatList and input bar</li>
              <li>Modify <C>context-builder.ts</C> to include category</li>
              <li>Add category-specific prompt templates</li>
              <li>Modify <C>ai-processor.ts</C> for category-aware suggestions</li>
            </ol>
      </Section>
      </Section>
      <Section id="smart-cards-in-chat-screen-detailed-spec" title="Smart Cards in Chat Screen — Detailed Spec">
      <P><b>File</b>: <C>mobile/app/chat/[chatId].tsx</C> (modify existing)</P>
      <P><b>New component</b>: <C>mobile/components/ChatSmartCardTray.tsx</C></P>
      <Section id="placement" title="Placement" level={3}>
      <P>The tray sits <b>between the message FlatList and the input bar</b>, inside the existing <C>KeyboardAvoidingView</C>. It slides up when cards are available and collapses when dismissed.</P>
      <Code lang="text">{"+-----------------------------------+\n|          Chat Header              |\n+-----------------------------------+\n|                                   |\n|         Message FlatList          |\n|         (scrollable)              |\n|                                   |\n+-----------------------------------+\n|  [sparkle] Smart Suggestions  [v] |  <- tray header (collapsible)\n|  +--------+  +--------+  +----   |  <- horizontal card scroll\n|  | Card 1 |  | Card 2 |  | Ca   |\n|  +--------+  +--------+  +----   |\n+-----------------------------------+\n|  [attach] [Message...    ] [send] |  <- input bar\n+-----------------------------------+"}</Code>
      </Section>
      <Section id="tray-behavior" title="Tray Behavior" level={3}>
      <ul>
              <li><b>Auto-shows</b> when <C>smart_cards</C> for this chatId exist (fetched from store on mount)</li>
              <li><b>Collapsed state</b>{": Single row, 48px tall. Shows: sparkle icon + \"3 suggestions\" text + chevron-up icon. Tapping expands."}</li>
              <li><b>Expanded state</b>: ~160px tall. Horizontal <C>ScrollView</C> of mini smart cards. Chevron-down icon to collapse.</li>
              <li><b>Collapse animation</b>: <C>Animated.timing</C> height transition (200ms, easeInOut)</li>
              <li><b>Dismiss all</b>{": Long-press the tray header shows \"Hide suggestions\" option. Sets a local flag (per session, not persisted — cards reappear on next open)."}</li>
              <li><b>When keyboard is open</b>: Tray stays visible but collapses to the single-row state automatically to preserve screen space.</li>
              <li><b>No category set</b>: Tray does not render at all if no <C>chat_categories</C> row exists for this chat.</li>
            </ul>
      </Section>
      <Section id="mini-card-layout-chat-screen-variant" title="Mini Card Layout (chat screen variant)" level={3}>
      <P>Cards in the chat tray are <b>compact</b> compared to the settings screen. 200px wide, ~120px tall.</P>
      <Code lang="text">{"+----------------------------------+\n|  [Icon]  Title (bold, 14px)      |\n|          Subtitle (12px, 1 line) |\n|                                  |\n|  [ CTA Button (compact, 32px) ]  |\n+----------------------------------+"}</Code>
      <ul>
              <li>No dismiss X button (dismiss via swipe-left only to keep it clean)</li>
              <li>No body section (maps rating, flight route diagram, etc. are settings-screen only)</li>
              <li>CTA button is smaller (32px height, 13px font)</li>
              <li>Same card type colors as full cards</li>
            </ul>
      </Section>
      <Section id="card-actions-from-chat-screen" title="Card Actions from Chat Screen" level={3}>
      <P>Actions that <b>pre-fill the input</b> have special behavior:</P>
      <ul>
              <li><C>reminder</C> cards with <C>draft_message</C>{" -> tapping \"Send Now\" populates "}<C>inputText</C> state and auto-focuses the TextInput. User confirms by pressing Send.</li>
              <li><C>datetime</C> cards with <C>draft_message</C>{" -> same: populates input with the suggested scheduling message."}</li>
              <li><C>action</C> cards with <C>draft_message</C>{" -> same pattern."}</li>
            </ul>
      <P>Actions that <b>open external apps</b>:</P>
      <ul>
              <li><C>maps</C>{" cards -> "}<C>Linking.openURL(googleMapsUrl)</C></li>
              <li><C>flight</C>{" cards -> "}<C>Linking.openURL(googleFlightsUrl)</C></li>
              <li><C>datetime</C>{" cards with \"Add to Calendar\" -> "}<C>Linking.openURL(calendarUrl)</C></li>
            </ul>
      <P>After any CTA tap, the card animates out (slide left + fade, 200ms) and is marked <C>acted_on=true</C>.</P>
      </Section>
      <Section id="integration-into-mobile-app-chat-chatid-tsx" title="Integration into mobile/app/chat/[chatId].tsx" level={3}>
      <P>Changes to the existing file:</P>
      <ol>
              <li><b>Import</b> <C>ChatSmartCardTray</C> and <C>useConversationSettingsStore</C></li>
              <li><b>Add state</b>: <C>{"const { settings, fetchSettings } = useConversationSettingsStore()"}</C></li>
              <li><b>Fetch on mount</b>: Add <C>fetchSettings(chatId)</C> to the existing <C>useEffect</C></li>
              <li><b>Render tray</b> between the <C>FlatList</C> and the input bar <C>View</C>: ``<C>{"tsx {settings[chatId]?.smartCards?.length > 0 && ( <ChatSmartCardTray cards={settings[chatId].smartCards} onDismiss={(cardId) => dismissCard(chatId, cardId)} onDraftMessage={(text) => setInputText(text)} /> )} "}</C>``</li>
              <li>The <C>onDraftMessage</C> callback sets the existing <C>inputText</C> state, which the TextInput already reads from.</li>
            </ol>
      </Section>
      <Section id="new-component-file-mobile-components-chatsmartcardtray-tsx" title="New component file: mobile/components/ChatSmartCardTray.tsx" level={3}>
      <P>Props:</P>
      <Code lang="ts">{"interface ChatSmartCardTrayProps {\n  cards: SmartCard[];\n  onDismiss: (cardId: string) => void;\n  onDraftMessage: (text: string) => void;\n}"}</Code>
      <P>Internal state:</P>
      <ul>
              <li><C>isExpanded: boolean</C> (default <C>true</C> on first render, collapses after user manually collapses)</li>
              <li><C>heightAnim: Animated.Value</C> for expand/collapse transition</li>
              <li>Listens to keyboard events via <C>{"Keyboard.addListener('keyboardDidShow')"}</C> to auto-collapse</li>
            </ul>
      </Section>
      </Section>
      <Section id="verification" title="Verification">
      <ol>
              <li><b>DB</b>: Run migration, verify tables exist: <C>{"docker exec supabase-db psql -U postgres -d postgres -c \"\\dt chat_categories; \\dt contact_profiles; \\dt smart_cards;\""}</C></li>
              <li><b>Navigation</b>{": Tap settings icon in chat header -> conversation settings screen opens with correct chatId"}</li>
              <li><b>Category</b>{": Select a category pill -> verify row upserted in "}<C>chat_categories</C></li>
              <li><b>Profile</b>{": Edit name/phone/email/location -> verify saved in "}<C>contact_profiles</C></li>
              <li><b>Smart Cards</b>{": Set category to \"trip\" -> trigger card generation -> verify cards render in horizontal scroll"}</li>
              <li><b>Card Actions</b>{": Tap a maps card -> verify it opens Maps app via Linking"}</li>
              <li><b>Insights</b>{": Tap \"Refresh insights\" -> verify key facts appear in contact profile section"}</li>
              <li><b>iOS + Android</b>: Run on both simulators to verify cross-platform rendering</li>
            </ol>
      </Section>
    </Doc>
  );
}
