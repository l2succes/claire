# Claire

An AI-powered WhatsApp companion that ensures users never forget to respond to messages, with smart reply suggestions, promise tracking, and contact inference.

## Features

- 🤖 AI-powered response suggestions using GPT-4
- 📱 Universal app (iOS, Android, Web) built with Expo
- 💬 Real-time message synchronization
- 🎯 Promise/commitment detection and tracking
- 👥 Smart contact inference with relationship mapping
- 🔔 Cross-platform push notifications
- 🎨 Beautiful UI with Gluestack v2 components
- 🔐 Secure authentication with Supabase

## Tech Stack

### Backend
- Bun + TypeScript
- Express.js
- Supabase (PostgreSQL, Auth, Realtime, Storage)
- Prisma ORM
- WhatsApp Web.js + Puppeteer
- OpenAI GPT-4
- Redis + Bull for queues

### Frontend
- Expo (React Native) + TypeScript
- Expo Router for navigation
- Gluestack UI v2 + NativeWind
- Zustand for state management
- Supabase JS Client

## Prerequisites

- Node.js 18+ and npm 9+
- Docker and Docker Compose
- Supabase account
- OpenAI API key
- Expo account (for push notifications)

## Getting Started

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd claire
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start development servers**
   ```bash
   # Start all services
   npm run dev
   
   # Or run individually
   npm run dev:server  # Backend
   npm run dev:client  # Frontend
   ```

5. **Run tests**
   ```bash
   npm test
   ```

## Project Structure

```
.
├── server/               # Backend Node.js application
│   ├── src/
│   │   ├── auth/        # Authentication logic
│   │   ├── services/    # Business logic services
│   │   ├── models/      # Database models
│   │   ├── routes/      # API routes
│   │   └── config/      # Configuration
│   └── tests/           # Backend tests
├── client/              # Expo universal app
│   ├── app/            # Expo Router screens
│   ├── components/     # Reusable UI components
│   ├── services/       # API and service layers
│   └── tests/          # Frontend tests
├── supabase/           # Supabase configuration
│   ├── migrations/     # Database migrations
│   └── functions/      # Edge functions
└── docker-compose.yml  # Local development setup
```

## Development

### Running locally

1. Start Docker services (Redis, etc.):
   ```bash
   docker-compose up -d
   ```

2. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

3. Start development servers:
   ```bash
   npm run dev
   ```

### Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Linting and Formatting

```bash
# Lint code
npm run lint

# Format code
npm run format
```

## Deployment

### Mobile Apps (iOS/Android)

1. Configure EAS Build:
   ```bash
   cd client
   eas build:configure
   ```

2. Build for platforms:
   ```bash
   eas build --platform ios
   eas build --platform android
   ```

### Web (PWA)

```bash
cd client
expo export:web
```

## Contributing

Please read our contributing guidelines before submitting PRs.

## License

MIT