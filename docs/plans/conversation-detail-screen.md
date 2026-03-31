# Fix: Tapping a Conversation Loads the Chat Screen

## Context
Tapping a message card on the dashboard currently does nothing (only logs to console). Two things are missing:
1. **No chat detail screen exists** — there's no `app/chat/[chatId].tsx` file
2. **Navigation is not wired up** — `handleMessagePress` in `dashboard.tsx` is a stub

We'll use **`react-native-gifted-chat`** (v3.3.2, 95k weekly downloads, actively maintained) for the chat UI instead of building bubbles from scratch. It handles keyboard avoidance, scroll-to-bottom, timestamps, and message rendering out of the box.

---

## Dependencies to Install

```bash
cd client
bun add react-native-gifted-chat react-native-reanimated react-native-keyboard-controller
```

`react-native-gesture-handler` and `react-native-safe-area-context` are already installed (see `package.json` lines 48-49). Only `react-native-reanimated` and `react-native-keyboard-controller` are new.

---

## Changes

### 1. Create `client/app/chat/[chatId].tsx` (NEW FILE)

Expo Router auto-discovers this — no layout changes needed.

**Logic:**
- `useLocalSearchParams()` to get `chatId`, `contact_name`, `chat_name`, `platform`, `is_group`
- On mount: fetch messages from Supabase where `chat_id = chatId AND user_id = user.id`, ordered `timestamp DESC` (newest first — GiftedChat's expected order)
- Subscribe to Supabase realtime channel filtered to this `chat_id` for live updates
- Map Supabase rows → GiftedChat `IMessage` shape:
  ```typescript
  {
    _id: msg.id,
    text: msg.content,
    createdAt: new Date(msg.timestamp),
    user: {
      _id: msg.from_me ? user.id : (msg.contact_phone || 'them'),
      name: msg.from_me ? 'Me' : (msg.contact_name || msg.contact_phone || 'Unknown'),
    }
  }
  ```
- `<GiftedChat messages={messages} user={{ _id: user.id }} onSend={handleSend} />`
- **Send flow**: query `chats` table for `platform_chat_id` and `platform`, find session via `platformStore.connectedSessions`, call `platformsApi.sendMessage(platform, sessionId, platform_chat_id, content)`, optimistically append to message list
- Custom header with back button (`router.back()`) and contact/group name + `PlatformBadge`

**Key imports reused:**
- `supabase` from `../../services/supabase`
- `useAuthStore` from `../../stores/authStore`
- `usePlatformStore` from `../../stores/platformStore`
- `platformsApi` from `../../services/platforms`
- `PlatformBadge` from `../../components/PlatformIcon`

### 2. Edit `client/app/(tabs)/dashboard.tsx` — lines 207–210 only

Replace stub with:
```typescript
const handleMessagePress = (message: Message) => {
  router.push({
    pathname: '/chat/[chatId]',
    params: {
      chatId: message.chat_id,
      contact_name: message.contact_name || '',
      chat_name: message.chat_name || '',
      platform: message.platform || '',
      is_group: message.is_group ? '1' : '0',
    },
  });
};
```

---

## Files Changed
- **CREATE** `client/app/chat/[chatId].tsx`
- **EDIT** `client/app/(tabs)/dashboard.tsx` (4 lines)
- **EDIT** `client/package.json` (2 new deps via `bun add`)

## Files NOT changing
- `app/_layout.tsx` — Expo Router auto-discovers `chat/[chatId]`
- Server routes — detail screen queries Supabase directly, same pattern as dashboard

---

## Verification
1. `cd client && bun add react-native-gifted-chat react-native-reanimated react-native-keyboard-controller`
2. `bunx expo run:ios` (native rebuild needed for new native modules)
3. Tap any conversation on the Messages tab → chat screen opens
4. Messages render as bubbles (green = sent, gray = received)
5. Type a message and tap Send → message appears and is delivered via the platform
6. Back button returns to Messages list
