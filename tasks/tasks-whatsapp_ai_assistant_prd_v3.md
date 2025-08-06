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
  - [x] 1.1 Initialize monorepo structure with server/ and client/ directories
  - [x] 1.2 Set up Supabase project and configure database connection
  - [x] 1.3 Initialize Expo app with TypeScript and configure Expo Router
  - [x] 1.4 Install and configure Gluestack UI v2 with NativeWind
  - [x] 1.5 Set up Prisma with Supabase connection and create initial schema
  - [x] 1.6 Configure Docker Compose for local development (Redis, Puppeteer)
  - [x] 1.7 Set up environment variables and .env.example files
  - [x] 1.8 Configure Jest testing framework for both server and client
  - [x] 1.9 Set up ESLint and Prettier for code consistency
  - [x] 1.10 Create initial README with setup instructions

- [ ] 2.0 Implement WhatsApp Authentication and Session Management
  - [ ] 2.1 Install and configure whatsapp-web.js with Puppeteer
  - [ ] 2.2 Create QR code generation endpoint for WhatsApp Web login
  - [ ] 2.3 Build QR code scanner screen in Expo app using expo-barcode-scanner
  - [ ] 2.4 Implement session persistence with Redis for WhatsApp sessions
  - [ ] 2.5 Create Supabase auth integration for user accounts
  - [ ] 2.6 Build session monitoring service to detect disconnections
  - [ ] 2.7 Implement automatic session restoration on server restart
  - [ ] 2.8 Add multi-device support (multiple WhatsApp accounts per user)
  - [ ] 2.9 Create session status real-time updates via Supabase Realtime
  - [ ] 2.10 Write tests for authentication flow and session management

- [ ] 3.0 Build Message Ingestion and Storage Pipeline
  - [ ] 3.1 Create message listener service using whatsapp-web.js events
  - [ ] 3.2 Design Supabase database schema for messages, contacts, and groups
  - [ ] 3.3 Implement message queue with Bull/Redis for processing
  - [ ] 3.4 Build message storage service with Prisma ORM
  - [ ] 3.5 Create media handling for images, videos, and documents
  - [ ] 3.6 Implement Supabase Storage integration for media files
  - [ ] 3.7 Set up real-time message synchronization with Supabase Realtime
  - [ ] 3.8 Build message deduplication logic to prevent duplicates
  - [ ] 3.9 Create message indexing for fast search capabilities
  - [ ] 3.10 Write tests for message ingestion pipeline

- [ ] 4.0 Develop AI Processing and Response Generation System
  - [ ] 4.1 Set up OpenAI API integration with GPT-4
  - [ ] 4.2 Create context builder service to compile conversation history
  - [ ] 4.3 Implement prompt templates for different message types
  - [ ] 4.4 Build response generation service with streaming support
  - [ ] 4.5 Create tone and personality configuration system
  - [ ] 4.6 Implement response validation and safety checks
  - [ ] 4.7 Add response caching to reduce API costs
  - [ ] 4.8 Build response editing and approval workflow
  - [ ] 4.9 Create response analytics and quality tracking
  - [ ] 4.10 Write tests for AI processing pipeline

- [ ] 5.0 Create Frontend Universal App with Core UI Components
  - [ ] 5.1 Set up Expo Router with tab navigation and auth flow
  - [ ] 5.2 Build Dashboard screen with message list using Gluestack components
  - [ ] 5.3 Create MessageCard component with gesture handling
  - [ ] 5.4 Implement ResponseSuggestion component with approve/edit/reject actions
  - [ ] 5.5 Build real-time message updates using Supabase subscriptions
  - [ ] 5.6 Create message filtering and search functionality
  - [ ] 5.7 Implement pull-to-refresh and infinite scrolling
  - [ ] 5.8 Add message status indicators (read, replied, pending)
  - [ ] 5.9 Build group chat summary view with collapsible messages
  - [ ] 5.10 Write tests for all UI components

- [ ] 6.0 Implement Promise Detection and Tracking System
  - [ ] 6.1 Create promise detection service using NLP/regex patterns
  - [ ] 6.2 Build Supabase schema for promises and commitments
  - [ ] 6.3 Implement promise extraction from message context
  - [ ] 6.4 Create Promises screen with list view in the app
  - [ ] 6.5 Build promise reminder system with configurable timing
  - [ ] 6.6 Add promise completion tracking and status updates
  - [ ] 6.7 Implement promise categorization (deadline, priority, type)
  - [ ] 6.8 Create promise notification system with Expo Notifications
  - [ ] 6.9 Build promise analytics dashboard
  - [ ] 6.10 Write tests for promise detection and tracking

- [ ] 7.0 Add Contact Inference and Memory System
  - [ ] 7.1 Design memory system schema in Supabase
  - [ ] 7.2 Build contact inference engine using conversation analysis
  - [ ] 7.3 Create ContactClarification card UI component
  - [ ] 7.4 Implement relationship mapping and storage
  - [ ] 7.5 Build user preference learning system
  - [ ] 7.6 Create conversation history indexing for context
  - [ ] 7.7 Implement memory injection into AI prompts
  - [ ] 7.8 Add memory management UI for user control
  - [ ] 7.9 Build privacy controls for memory data
  - [ ] 7.10 Write tests for inference and memory systems

- [ ] 8.0 Configure Push Notifications and Auto-Reply Rules
  - [ ] 8.1 Set up Expo Notifications with FCM and APNs
  - [ ] 8.2 Implement web push notifications for PWA
  - [ ] 8.3 Create notification preferences and settings screen
  - [ ] 8.4 Build auto-reply rule engine with triggers
  - [ ] 8.5 Implement safe default auto-reply templates
  - [ ] 8.6 Create rule configuration UI with Gluestack forms
  - [ ] 8.7 Add scheduling system for delayed replies
  - [ ] 8.8 Build notification grouping and priority system
  - [ ] 8.9 Implement Do Not Disturb and quiet hours
  - [ ] 8.10 Write tests for notifications and auto-reply

- [ ] 9.0 Testing, Security, and Deployment Setup
  - [ ] 9.1 Implement end-to-end encryption for sensitive data
  - [ ] 9.2 Set up Row Level Security (RLS) policies in Supabase
  - [ ] 9.3 Create comprehensive test suites with coverage targets
  - [ ] 9.4 Build CI/CD pipeline with GitHub Actions
  - [ ] 9.5 Configure EAS Build for iOS and Android deployment
  - [ ] 9.6 Set up monitoring with error tracking (Sentry)
  - [ ] 9.7 Implement rate limiting and abuse prevention
  - [ ] 9.8 Create backup and disaster recovery procedures
  - [ ] 9.9 Build admin dashboard for system monitoring
  - [ ] 9.10 Prepare production deployment with scaling strategy