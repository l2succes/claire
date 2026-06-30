# Claire — E2E Test Selector Map

All stable `testID` values (rendered as `data-testid` on web via React Native Web) used by Playwright e2e tests.

> **Convention:** `testID` props are used on React Native components. On web they surface as `data-testid` attributes. Playwright uses `page.getByTestId(id)` which maps to `[data-testid="id"]`.

---

## Auth screens

### Sign-in (`/(auth)/signin`)

| Selector | Element |
|---|---|
| `signin-screen` | Root `KeyboardAvoidingView` |
| `signin-email-input` | Email `TextInput` |
| `signin-password-input` | Password `TextInput` |
| `signin-submit` | Sign-in submit `TouchableOpacity` |
| `google-sign-in-signin` | Google sign-in button |

### Sign-up (`/(auth)/signup`)

| Selector | Element |
|---|---|
| `signup-screen` | Root view |
| `signup-name-input` | Name `TextInput` |
| `signup-email-input` | Email `TextInput` |
| `signup-password-input` | Password `TextInput` |
| `signup-submit` | Submit `TouchableOpacity` |

### Platform connect (`/(auth)/login`)

| Selector | Element |
|---|---|
| `platform-login-screen` | Root `View` |
| `platform-selector-whatsapp` | WhatsApp selector tile |
| `platform-selector-telegram` | Telegram selector tile |
| `platform-selector-instagram` | Instagram selector tile |
| `platform-login-continue` | "Continue to Inbox" `Button` (shown when ≥1 platform connected) |
| `platform-login-skip-dev` | "Skip (dev mode)" link (only in `__DEV__`) |

---

## Tab screens

### Dashboard / Home (`/(tabs)/dashboard`)

| Selector | Element |
|---|---|
| `dashboard-screen` | Root `ScrollView` |

### Messages / Inbox (`/(tabs)/messages`)

| Selector | Element |
|---|---|
| `messages-screen` | Root `View` |
| `messages-loading` | Loading spinner `View` |
| `messages-search-input` | Search `TextInput` |
| `messages-list` | Conversation `FlatList` |
| `messages-empty` | Empty state `View` |
| `message-card-<id>` | Individual `MessageCard` row (dynamic, `id` = message UUID) |

### Contacts (`/(tabs)/contacts`)

| Selector | Element |
|---|---|
| `contacts-screen` | Root `View` |
| `contacts-search-input` | Search `TextInput` |
| `contacts-list` | Contacts `FlatList` |
| `contacts-empty` | Empty state `View` |

### Promises (`/(tabs)/promises`)

| Selector | Element |
|---|---|
| `promises-screen` | Root `ScrollView` |
| `promises-empty` | Empty state `View` (shown when no promises exist) |
| `promises-list` | Promises list (added by #18) |
| `promise-item-<id>` | Individual promise row (added by #18) |
| `promise-complete-<id>` | Mark-complete button (added by #18) |

### Settings (`/(tabs)/settings`)

| Selector | Element |
|---|---|
| `settings-screen` | Root `ScrollView` |
| `settings-refresh-platforms` | Refresh platforms `TouchableOpacity` |
| `settings-add-platform` | Add platform `TouchableOpacity` |
| `settings-no-platforms` | Empty platforms `View` |
| `settings-connect-platform` | "Connect Platform" button in empty state |
| `settings-account` | Account row `TouchableOpacity` |
| `settings-notifications` | Notifications row `TouchableOpacity` |
| `settings-ai` | AI Settings row `TouchableOpacity` |
| `settings-logout` | Logout row `TouchableOpacity` |
| `connected-platforms-list` | Connected platforms `View` |
| `connected-platforms-empty` | Empty connected platforms `View` |
| `connected-platform-<platform>` | Platform row (e.g. `connected-platform-whatsapp`) |
| `reconnect-platform-<platform>` | Reconnect button per platform |
| `disconnect-platform-<platform>` | Disconnect button per platform |

---

## Chat screen (`/chat/[chatId]`)

| Selector | Element |
|---|---|
| `chat-screen` | Root `SafeAreaView` |
| `chat-loading` | Loading spinner `View` |
| `chat-message-list` | Messages `FlatList` |
| `chat-empty` | Empty state `View` |
| `chat-input` | Message composer `TextInput` |
| `chat-send-button` | Send `TouchableOpacity` |

---

## Platform auth modal

| Selector | Element |
|---|---|
| `platform-auth-modal` | Modal root `View` |
| `platform-auth-scroll` | Scrollable content area |
| `platform-auth-success` | Success state `View` |
| `platform-auth-error` | Error state `View` |

### Instagram auth (web)

| Selector | Element |
|---|---|
| `instagram-web-login` | Instagram login root `View` |
| `instagram-username-input` | Username `TextInput` |
| `instagram-password-input` | Password `TextInput` |
| `instagram-toggle-password` | Show/hide password `TouchableOpacity` |
| `instagram-sign-in-button` | Sign-in `TouchableOpacity` |
| `instagram-2fa-input` | 2FA code `TextInput` |
| `instagram-2fa-submit` | 2FA submit `TouchableOpacity` |
| `instagram-try-again` | Retry `TouchableOpacity` |
| `instagram-web-login-close` | Close/cancel `TouchableOpacity` |

### Instagram auth (native)

| Selector | Element |
|---|---|
| `instagram-native-webview` | Native WebView |
| `instagram-native-login-loading` | Loading `View` |
| `instagram-native-login-close` | Close `TouchableOpacity` |

---

## Notes

- Selectors prefixed with a platform name (e.g. `platform-selector-whatsapp`) use the platform's lowercase `Platform` enum value.
- Dynamic selectors using `<id>` use the DB UUID of the entity.
- Selectors marked "(added by #N)" are placeholders for upcoming issues and will be wired in those tickets.
- The web build is required for Playwright (`bunx expo start --web`); see `client/playwright.config.mjs`.
