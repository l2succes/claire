# WhatsApp AI Assistant - Product Requirement Document (v1.4)

## Product Name (Working Title)
WhatsApp AI Assistant

---

## Problem Statement
People receive dozens (sometimes hundreds) of WhatsApp messages daily across personal, work, and group chats. It’s overwhelming and easy to forget to respond in time. This leads to missed opportunities, awkward social moments, and even strained relationships.

---

## Goal
Build an AI‑powered WhatsApp companion that ensures users **never forget to respond to a message again** by:
- Reminding them of pending replies.
- Suggesting thoughtful, context-aware responses.
- Optionally auto‑replying based on user rules.
- Highlighting promises made in conversations so users can follow through.
- Inferring the identity/relationship of the person being chatted with to improve personalization.

---

## Key Features (MVP)
1. **Seamless WhatsApp Login**
   - Connect via QR scan (same as WhatsApp Web).
   - Web companion app for QR scanning flow (user scans code from their WhatsApp mobile app).
   - Session persistence (re-login only if session expires).

2. **Message Dashboard**
   - Real-time stream of incoming messages.
   - Organized by contact/group.
   - “Unread” highlight and filters.

3. **AI Response Suggestions**
   - Draft replies based on context (past chat + tone settings).
   - User can accept, edit, or ignore.

4. **Reply Later / Snooze**
   - Mark messages to revisit later.
   - Notifications/reminders for snoozed messages.

5. **Auto-Reply Rules**
   - Basic triggers (e.g., birthday wishes, thank-you messages).
   - Safe defaults (avoid spammy behavior).

6. **Message Summaries**
   - Generate summaries for group chats or missed messages.
   - Quick context so users don’t have to scroll endlessly.

7. **Notifications**
   - PWA push notifications supported via Web Push API.
   - Android: native-like push works directly.
   - iOS: requires user to install the PWA (Add to Home Screen) before enabling push.
   - Future upgrade path: Expo/React Native native app wrapper for reliable push notifications (using FCM + APNs).

8. **Personalization & Memory**
   - Instead of using ChatGPT’s built-in memory (not available via API), app maintains its own memory system.
   - User profile: tone, language preferences, relationships, frequently used phrases.
   - Persistent conversation history for improved context.
   - Used to inject personalized context into AI prompts.

9. **Promises List (Commitment Tracking)**
   - AI detects when the user makes a promise or commitment in a chat (e.g., “I’ll send you that file,” “Let’s meet tomorrow”).
   - Extracts and saves these items in a **Promises List** (essentially a smart to-do list).
   - Sends reminders to fulfill promises.
   - Allows user to mark promises as completed directly from the app.

10. **Contact Inference & Clarification**
   - AI attempts to infer who the person is (e.g., “this seems like your accountant,” or “likely a family member”) based on conversation context, frequency, and message style.
   - If uncertain, the assistant presents a **card-based UI** asking clarifying questions: e.g., “Is this your boss, your friend, or someone else?”
   - Once clarified, the info is stored in the memory system for improved future responses.

---

## Future Features (v2+)
- Smart prioritization (urgent vs. casual messages).
- Multi-platform integration (Telegram, iMessage, Email).
- Voice input/output for replies.
- AI personalization (train on user’s writing style).
- Smart search across all messages.
- Enhanced promise management (integrate with calendar, reminders, or task managers).
- Advanced contact graph (relationship mapping across chats).

---

## System Architecture (MVP)

### A. User Authentication & Session Handling
- QR Code login using `whatsapp-web.js`.
- Companion web portal for login flow (desktop/laptop QR scan).
- Session tokens securely stored (encrypted DB or Redis).
- Session manager service for re-login and monitoring.

### B. Message Ingestion Pipeline
- Messages captured from WhatsApp Web (via Puppeteer sessions).
- Sent to message queue (RabbitMQ/Kafka/Redis pubsub).
- Stored in DB (Postgres/Firestore) for history and context.

### C. AI Processing Layer
- Fetches conversation history and metadata.
- Generates context-aware reply (via LLM, e.g. OpenAI API).
- Applies personality/tone rules from user memory system.
- Detects commitments/promises using intent classification.
- Infers likely identity/relationship of sender.
- Optional summarization + prioritization.

### D. Response Handling
- **Assist Mode**: Show reply suggestions in app → user approves.
- **Auto Mode**: Send replies automatically if rule matches.

### E. Frontend (User App)
- PWA (web-first) with push notification support.
- Displays chats, AI suggestions, reply options.
- Dedicated **Promises tab** where commitments are tracked and managed.
- **Card-based UI prompts** for clarifying contact identities.
- Settings: tone, rules, privacy.

### F. Infra & Security
- **Backend**: Node.js + Express/NestJS.
- **DB**: Postgres (chat data, user memory, promises, contact identities), Redis (sessions).
- **Queue**: RabbitMQ/Kafka.
- **AI**: OpenAI API or fine-tuned model.
- **Security**: encryption at rest + in transit, GDPR-style data deletion.

---

## Design Tools & Process
- **AI-Powered Design Tools**: Use platforms like **Uizard**, **Galileo AI**, or **Figma with AI plugins** to generate mobile-first wireframes and prototypes quickly.
- **Figma/Locofy.ai Workflow**: Build detailed screens in Figma and convert them into responsive React Native or web components with Locofy.ai.
- **User Testing**: Iterative design validation through quick user feedback sessions.
- **Deliverables**: Low-fidelity wireframes → high-fidelity mockups → clickable prototypes.

---

## Infrastructure Strategy
- **Firebase**: Strong option for push notifications (native integration with FCM), real-time database, authentication, hosting, and analytics.
- **Supabase**: SQL-based alternative with real-time subscriptions, great for structured relational data, open-source flexibility.
- **Other Options**: 
  - **Vercel** for fast PWA hosting.
  - **Render** or **Railway** for backend deployments.
- **Recommendation**: Start with Firebase or Supabase depending on developer comfort and leverage credits to keep initial costs minimal. Firebase may edge out for ease with notifications, while Supabase may be preferable for SQL workflows.

---

## User Stories

1. **As a user**, I want to connect my WhatsApp account via QR code (through a desktop flow) so that the AI assistant can read and help me manage my messages.
2. **As a user**, I want to see all my incoming messages in one dashboard so I don’t have to switch between chats.
3. **As a user**, I want AI to suggest a response draft that I can approve or edit, so I can save time.
4. **As a user**, I want to snooze certain messages and get reminded later, so I don’t forget to reply.
5. **As a user**, I want the assistant to auto-reply with safe, pre-configured responses in some scenarios, so I maintain communication without effort.
6. **As a user**, I want to receive a summary of unread group chats, so I can catch up quickly.
7. **As a user**, I want replies to reflect my personal style and preferences, so messages feel authentic.
8. **As a user**, I want the app to track promises I make in conversations, so I don’t forget to follow through.
9. **As a user**, I want to receive reminders about my promises, so I can act on them before they’re overdue.
10. **As a user**, I want the app to infer who I’m talking to and ask clarifying questions if needed, so replies are more accurate and personalized.

---

## Success Metrics
- % of messages replied to (vs. ignored).
- Avg. response time improvement.
- Daily active users (DAU).
- Retention after 30 days.
- % of users enabling auto-reply rules.
- User satisfaction with AI’s personalization (survey/feedback).
- % of promises fulfilled (tracked vs. completed).
- Accuracy of contact inference (measured via user confirmations).

---

## Risks
- WhatsApp may detect/block automation (ToS risk).
- Puppeteer session scaling challenges (each user = browser instance).
- Data privacy concerns around message storage.
- User trust (convincing users to connect personal WhatsApp).
- iOS push notification friction for PWAs.
- Accuracy of promise detection (false positives/negatives).
- Accuracy of contact inference (mislabeling risk).

---

## Marketing Positioning

**Tagline:**  
“Don’t ever forget to respond to a message again.”

**Supporting Messages:**
- “Your AI copilot for WhatsApp.”
- “Turn WhatsApp chaos into clarity.”
- “Stay thoughtful, even when you’re busy.”
- “Never forget a promise you made.”
- “Know who you’re talking to, every time.”

**Visual Concepts:**
- Overwhelmed inbox vs. clean inbox.
- AI writing draft replies in real-time.
- Message summaries collapsing 100+ chat messages into 3 lines.
- Promise tracker turning casual commitments into a clear to-do list.
- Card-based UI showing AI inference of contact identity (with user confirmation).

---

## Next Steps
- Define onboarding UX (desktop companion web flow for QR scan).
- Implement PWA push notifications.
- Build user memory system (tone, preferences, past chats).
- Implement promise detection + tracking system.
- Implement contact inference + card-based clarification UI.
- Prototype backend with `whatsapp-web.js`.
- Test feasibility with small user group.
- Validate engagement and perceived value before scaling.

