# Unified AI Messenger - Research Summary

Building a Beeper clone with an AI layer for WhatsApp, Instagram, and iMessage.

---

## What Beeper Does

Beeper is a unified messaging app that consolidates 12+ chat platforms into one inbox. They use **on-device connections** for maximum privacy - messages go directly from your device to each network, not through their servers.

---

## Platform Analysis & Implementation Options

### ✅ WhatsApp - Already Working

**Current Implementation:** whatsapp-web.js (already in Claire)

**Approach:** Browser automation using Puppeteer
- Works with personal WhatsApp accounts
- Session persistence via QR code
- Real-time message syncing

**Risk:** Medium (ToS violation but widely tolerated for personal use)

**Status:** Ready to go

---

### ✅ iMessage - Recommended Next Step

**Best Approach:** **BlueBubbles Server**

**What is BlueBubbles?**
- Open-source ecosystem for iMessage access
- Self-hosted Mac server
- REST API + WebSocket for real-time messaging
- Cross-platform clients (Android, Windows, Linux, Web)

**Requirements:**
- Mac or macOS VM (required for iMessage)
- Apple ID
- Full Disk Access permission
- macOS Ventura recommended (best compatibility)

**Features:**
- Send and receive messages in real-time
- Group chat support
- Attachment handling
- Media uploads/downloads
- Typing indicators
- Read receipts

**Implementation:**
1. Install BlueBubbles Server on Mac
2. Configure for local network or self-hosted with Dynamic DNS
3. Create iMessage service module in Claire server
4. Connect to BlueBubbles REST API
5. Handle real-time messages via WebSocket

**Risk:** Low (local data access, no ToS violations)

**Effort:** 2-3 weeks

**Why BlueBubbles:**
- Most mature solution
- Active community
- Real-time bidirectional messaging
- Self-hostable
- Can be used as API backend for custom clients

---

### ⚠️ Instagram DMs - Possible with Caution

**Official API:** Business accounts only, customer-initiated messages only (not suitable for personal use)

**Unofficial Library:** **instagrapi** (Python)

**GitHub:** [subzeroid/instagrapi](https://github.com/subzeroid/instagrapi)

**Status:** Actively maintained, last verified working May 25, 2025

#### DM Features

| Method | Description |
|--------|-------------|
| `direct_threads()` | Get inbox threads (filter by unread/flagged) |
| `direct_pending_inbox()` | Get pending message requests |
| `direct_thread(thread_id)` | Get specific conversation |
| `direct_messages(thread_id)` | Get messages from a thread |
| `direct_send(text, user_ids)` | Send text message |
| `direct_send_photo()` | Send photo via DM |
| `direct_send_video()` | Send video via DM |
| `direct_answer(thread_id, text)` | Reply to conversation |
| `direct_media_share()` | Share posts via DM |
| `direct_story_share()` | Share stories via DM |

#### Example Code

```python
from instagrapi import Client

cl = Client()
cl.login("username", "password")

# Get all DM threads
threads = cl.direct_threads()

# Send a message
cl.direct_send("Hello!", user_ids=[user_id])

# Get messages from a thread
messages = cl.direct_messages(thread_id)
```

#### Risk Assessment

| Factor | Reality |
|--------|---------|
| **Does it work?** | Yes, actively maintained and verified working |
| **Ban risk** | Medium-High - Instagram does ban accounts using private APIs |
| **Detection** | Instagram uses device fingerprinting, IP analysis, behavior patterns |
| **Best practice** | Instagrapi devs say it "suits for testing or research rather than a working business" |

#### How to Reduce Ban Risk

1. **Use your real device info** - instagrapi can simulate your phone
2. **Add delays between actions** - don't blast requests
3. **Don't automate outbound spam** - receiving/reading is safer than mass sending
4. **Use session persistence** - don't re-login constantly
5. **Consider a secondary account** for testing first

#### Implementation Options

Since instagrapi is Python and Claire is TypeScript/Bun:

**Option 1: Python Microservice**
- Run instagrapi as separate service
- Expose REST API
- Call from Claire server via HTTP

**Option 2: Use instagrapi-rest**
- Pre-built REST wrapper for instagrapi
- Deploy as Docker container
- GitHub: [subzeroid/instagrapi-rest](https://github.com/subzeroid/instagrapi-rest)

---

## Recommended Architecture

```
Claire Server (Bun + TypeScript)
├── WhatsApp Service (whatsapp-web.js) ✓ Already implemented
├── iMessage Service (BlueBubbles API) → New
└── Instagram Service (instagrapi-rest) → New (optional)

Unified Message Layer
├── Message normalization
├── Contact merging across platforms
├── AI processing (existing GPT-4)
└── Smart response routing
```

---

## Implementation Phases

### Phase 1: Add iMessage (2-3 weeks)

1. Install BlueBubbles Server on Mac
2. Create iMessage service module in Claire
3. Connect to BlueBubbles REST API
4. Handle real-time messages via WebSocket
5. Extend database schema for multi-platform contacts

**Database Schema Extension:**
```typescript
table contacts {
  id
  name
  whatsapp_number
  imessage_handle  // New
  instagram_handle // New (optional)
  unified_contact_id
}

table messages {
  id
  contact_id
  platform: 'whatsapp' | 'imessage' | 'instagram'
  platform_message_id
  content
  timestamp
  direction: 'inbound' | 'outbound'
}
```

### Phase 2: Unified Experience (2-3 weeks)

1. Merge WhatsApp + iMessage contacts
2. Unified conversation view
3. Platform-agnostic AI suggestions
4. Smart routing for replies

### Phase 3: Instagram Integration (Optional, 2-3 weeks)

1. Deploy instagrapi-rest as Python microservice
2. Create Instagram service module in Claire
3. Implement careful rate limiting and ban prevention
4. Test with secondary account first

---

## Platform Feasibility Summary

| Platform | Library | Risk | Recommended | Status |
|----------|---------|------|-------------|--------|
| **WhatsApp** | whatsapp-web.js | Medium | ✅ Use | Already working |
| **iMessage** | BlueBubbles | Low | ✅ High priority | Next step |
| **Instagram** | instagrapi | Medium-High | ⚠️ Proceed with caution | Optional |

---

## Expected Timeline

- **Phase 1 (iMessage):** 2-3 weeks
- **Phase 2 (Unification):** 2-3 weeks
- **Phase 3 (Instagram - Optional):** 2-3 weeks
- **Total for WhatsApp + iMessage:** 4-6 weeks
- **Total with Instagram:** 6-9 weeks

---

## File Structure (Proposed)

```
server/src/
├── services/
│   ├── whatsapp.ts           # Existing
│   ├── imessage.ts           # New - BlueBubbles client
│   ├── instagram.ts          # New - instagrapi-rest client (optional)
│   ├── platform-adapter.ts   # New - Platform abstraction
│   └── message-router.ts     # New - Unified routing
│
├── models/
│   ├── unified-contact.ts    # New - Contact merging
│   └── platform-message.ts   # New - Platform-agnostic messages
│
└── adapters/                  # New directory
    ├── whatsapp/
    ├── imessage/
    └── instagram/
```

---

## Key Resources

### WhatsApp
- [whatsapp-web.js GitHub](https://github.com/pedroslopez/whatsapp-web.js)
- Current implementation in Claire server

### iMessage
- [BlueBubbles Website](https://bluebubbles.app/)
- [BlueBubbles GitHub](https://github.com/BlueBubblesApp/bluebubbles-server)
- [BlueBubbles API Documentation](https://docs.bluebubbles.app/)

### Instagram
- [instagrapi GitHub](https://github.com/subzeroid/instagrapi)
- [instagrapi Documentation](https://subzeroid.github.io/instagrapi/)
- [instagrapi-rest GitHub](https://github.com/subzeroid/instagrapi-rest)
- [instagrapi Direct Message Docs](https://subzeroid.github.io/instagrapi/usage-guide/direct.html)

### Alternative Libraries
- [instagram-private-api (Node.js)](https://github.com/dilame/instagram-private-api) - v3 features are paid
- [InstagramApiSharp (.NET)](https://github.com/ramtinak/InstagramApiSharp)
- [aiograpi (Async Python)](https://github.com/subzeroid/aiograpi)

---

## Next Steps

1. ✅ Research completed
2. Install BlueBubbles Server on Mac
3. Design iMessage service architecture
4. Implement iMessage integration
5. Build unified message layer
6. (Optional) Evaluate Instagram integration with test account
7. Deploy unified AI messenger

---

## Notes

- **Risk tolerance:** Instagram carries the highest ban risk, but instagrapi is actively maintained and used by many
- **Privacy:** Self-hosting BlueBubbles and using local libraries maximizes privacy
- **Scalability:** Start with WhatsApp + iMessage, add Instagram only if needed
- **Testing:** Use secondary accounts for Instagram testing before committing production account
