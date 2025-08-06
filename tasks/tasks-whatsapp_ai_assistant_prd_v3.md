## Relevant Files

- `server/src/index.ts` - Main application entry point and server setup
- `server/src/config/index.ts` - Configuration management (environment variables, app settings)
- `server/src/auth/whatsapp-auth.ts` - WhatsApp Web authentication and QR code handling
- `server/src/services/message-ingestion.ts` - Message capture and processing pipeline
- `server/src/services/ai-processor.ts` - AI processing layer for response generation and analysis
- `server/src/services/memory-system.ts` - User preferences and conversation memory management
- `server/src/services/promise-detector.ts` - Promise/commitment detection and tracking
- `server/src/services/contact-inference.ts` - Contact identity inference and clarification
- `server/src/models/index.ts` - Database models and schemas
- `server/src/routes/auth.ts` - Authentication API routes
- `server/src/routes/messages.ts` - Message management API routes
- `server/src/routes/promises.ts` - Promise tracking API routes
- `server/src/routes/settings.ts` - User settings and preferences API routes
- `client/App.tsx` - Main Expo application entry point
- `client/app/(tabs)/_layout.tsx` - Tab navigation layout (Expo Router)
- `client/app/(tabs)/dashboard.tsx` - Message dashboard screen
- `client/app/(tabs)/promises.tsx` - Promise tracking screen
- `client/app/(auth)/login.tsx` - QR code login screen
- `client/components/MessageCard.tsx` - Individual message display component
- `client/components/ResponseSuggestion.tsx` - AI response suggestion component
- `client/components/ContactClarification.tsx` - Contact identity clarification card UI
- `client/services/supabase.ts` - Supabase client configuration
- `client/services/notifications.ts` - Cross-platform push notification handling
- `client/app.json` - Expo configuration
- `client/eas.json` - EAS Build configuration
- `client/tailwind.config.js` - Tailwind configuration with Gluestack plugin
- `client/nativewind.d.ts` - NativeWind TypeScript declarations
- `server/tests/auth/whatsapp-auth.test.ts` - Unit tests for WhatsApp authentication
- `server/tests/services/message-ingestion.test.ts` - Unit tests for message ingestion
- `server/tests/services/ai-processor.test.ts` - Unit tests for AI processor
- `server/tests/services/memory-system.test.ts` - Unit tests for memory system
- `server/tests/services/promise-detector.test.ts` - Unit tests for promise detection
- `server/tests/services/contact-inference.test.ts` - Unit tests for contact inference
- `client/tests/app/dashboard.test.tsx` - Unit tests for dashboard screen
- `client/tests/app/promises.test.tsx` - Unit tests for promises screen
- `client/tests/components/MessageCard.test.tsx` - Unit tests for message card
- `client/tests/components/ResponseSuggestion.test.tsx` - Unit tests for response suggestion
- `client/tests/components/ContactClarification.test.tsx` - Unit tests for contact clarification
- `supabase/migrations/001_initial_schema.sql` - Initial database schema
- `supabase/functions/` - Supabase Edge Functions directory
- `docker-compose.yml` - Docker configuration for services
- `package.json` - Project dependencies and scripts
- `.env.example` - Environment variables template

### Notes

- Unit tests are organized in separate `tests` directories mirroring the source structure
- Use `npm test` to run all tests or `npm test -- path/to/test/file` for specific tests
- The project will use a monorepo structure with separate backend and frontend directories

### Technology Stack

**Backend:**
- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js with TypeScript decorators
- **Database:** Supabase (PostgreSQL with built-in auth & real-time)
- **ORM:** Prisma with Supabase connection
- **Queue:** Supabase Edge Functions or Bull with Redis
- **WhatsApp Integration:** whatsapp-web.js with Puppeteer
- **AI/LLM:** OpenAI API (GPT-4)
- **Authentication:** Supabase Auth (JWT with RLS)
- **Real-time:** Supabase Realtime subscriptions
- **Storage:** Supabase Storage for media files
- **Testing:** Jest with Supertest for API testing

**Frontend (Universal App):**
- **Framework:** Expo (SDK 51+) with React Native & TypeScript
- **Routing:** Expo Router (file-based routing)
- **Styling:** NativeWind (Tailwind CSS for React Native)
- **UI Components:** Gluestack UI v2 (universal components)
- **State Management:** Zustand
- **API Client:** Supabase JS Client with React Query
- **Real-time:** Supabase Realtime subscriptions
- **Push Notifications:** Expo Notifications (FCM/APNs + Web Push)
- **Icons:** react-native-svg with Lucide icons
- **Web Support:** Expo Web with PWA capabilities
- **Testing:** Jest with React Native Testing Library

**Infrastructure:**
- **Containerization:** Docker & Docker Compose
- **Session Storage:** Redis
- **File Storage:** Local filesystem (development), S3-compatible storage (production)
- **Deployment:** Initially Docker Compose, with path to Kubernetes
- **Monitoring:** Basic logging with Winston, upgrade path to OpenTelemetry

## Tasks

- [ ] 1.0 Set Up Project Infrastructure and Development Environment
- [ ] 2.0 Implement WhatsApp Authentication and Session Management
- [ ] 3.0 Build Message Ingestion and Storage Pipeline
- [ ] 4.0 Develop AI Processing and Response Generation System
- [ ] 5.0 Create Frontend PWA with Core UI Components
- [ ] 6.0 Implement Promise Detection and Tracking System
- [ ] 7.0 Add Contact Inference and Memory System
- [ ] 8.0 Configure Push Notifications and Auto-Reply Rules
- [ ] 9.0 Testing, Security, and Deployment Setup