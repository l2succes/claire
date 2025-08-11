# Claire - WhatsApp AI Assistant

An AI-powered WhatsApp companion that ensures users never forget to respond to messages, with smart reply suggestions, promise tracking, and contact inference.

## Features

- 🤖 AI-powered response suggestions using GPT-4
- 📱 Universal app (iOS, Android, Web) built with Expo
- 💬 Real-time message synchronization
- 🎯 Promise/commitment detection and tracking
- 👥 Smart contact inference with relationship mapping
- 🔔 Cross-platform push notifications
- 🎨 Beautiful UI with NativeWind + Tailwind CSS
- 🔐 Secure authentication with Supabase
- 🔗 WhatsApp Web integration for seamless messaging

## Tech Stack

### Backend
- Bun + TypeScript
- Express.js
- Supabase (PostgreSQL, Auth, Realtime, Storage)
- WhatsApp Web.js + Puppeteer
- OpenAI GPT-4
- Redis + Bull for queues

### Frontend
- Expo SDK 50 + TypeScript
- Expo Router for navigation
- NativeWind (Tailwind CSS for React Native)
- Zustand for state management
- Supabase JS Client
- React Native 0.73.6

## How WhatsApp Login Works

Since the Claire mobile app and WhatsApp run on the same device, we've implemented a web portal solution for QR code scanning:

### The Login Flow

1. **User taps "Connect WhatsApp"** in the Claire mobile app
2. **App displays a portal URL** (e.g., `http://localhost:3001/portal/user123`)
3. **User opens this URL on their computer** (must be on the same network)
4. **Web portal displays the WhatsApp QR code** with a beautiful interface
5. **User scans the QR code using WhatsApp** on their phone:
   - Open WhatsApp → Settings → Linked Devices → Link a Device
6. **Connection established!** Both the web portal and mobile app update to show success
7. **Claire can now receive and respond to WhatsApp messages**

### Technical Details

- **WhatsApp Web Protocol**: Claire uses the WhatsApp Web protocol (similar to web.whatsapp.com) to connect as a "linked device"
- **Session Management**: Each user gets a unique session that persists across app restarts
- **Real-time Updates**: The app polls the server for connection status and receives real-time message updates via Supabase
- **Security**: All WhatsApp sessions are encrypted and isolated per user

### Test Mode

For development and testing without WhatsApp:
- The app detects when the server isn't running
- Offers "Test Mode" which simulates a successful login
- Allows testing of UI and features without WhatsApp connection

## Prerequisites

- Bun 1.0+ (JavaScript runtime and package manager)
- Docker and Docker Compose
- Supabase account
- OpenAI API key
- Expo account (for push notifications)
- A computer on the same network (for QR code scanning)

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/l2succes/claire.git
cd claire
```

### 2. Install dependencies

```bash
# Install root dependencies
bun install

# Install client dependencies
cd client && bun install

# Install server dependencies
cd ../server && bun install
```

### 3. Set up environment variables

#### Client (.env)
```bash
cd client
cp .env.example .env
# Edit .env with your Supabase credentials
```

Required variables:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_SERVER_URL` (default: http://localhost:3001)

#### Server (.env)
```bash
cd server
cp .env.example .env
# Edit .env with your configuration
```

Required variables:
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `DATABASE_URL`

### 4. Start development servers

```bash
# Terminal 1: Start the server
cd server
bun run dev

# Terminal 2: Start the client
cd client
bun run dev
```

### 5. Connect WhatsApp

1. Open the Claire app on your phone/simulator
2. Tap "Connect WhatsApp"
3. Open the displayed URL on your computer
4. Scan the QR code with WhatsApp (Settings → Linked Devices → Link a Device)
5. You're connected!

## Project Structure

```
.
├── server/               # Backend Bun application
│   ├── src/
│   │   ├── auth/        # Authentication logic
│   │   ├── services/    # Business logic services
│   │   │   ├── whatsapp.ts       # WhatsApp Web integration
│   │   │   ├── ai-processor.ts   # GPT-4 response generation
│   │   │   ├── context-builder.ts # Message context management
│   │   │   └── response-cache.ts  # Redis caching
│   │   ├── models/      # Database models
│   │   ├── routes/      # API routes
│   │   │   └── web-portal.ts     # QR code web portal
│   │   └── config/      # Configuration
│   └── tests/           # Backend tests
├── client/              # Expo universal app
│   ├── app/            # Expo Router screens
│   │   ├── (auth)/     # Authentication screens
│   │   ├── (tabs)/     # Main app tabs
│   │   └── _layout.tsx # Root layout
│   ├── components/     # Reusable UI components
│   │   ├── MessageCard.tsx       # Message display
│   │   ├── ResponseSuggestion.tsx # AI suggestions
│   │   └── GroupChatSummary.tsx  # Group analytics
│   ├── services/       # API and service layers
│   └── stores/         # Zustand state management
├── supabase/           # Supabase configuration
│   └── migrations/     # Database migrations
└── tasks/             # Project documentation
    └── tasks-whatsapp_ai_assistant_prd_v3.md
```

## Development

### Running locally

1. Start Docker services (Redis, etc.):
```bash
docker-compose up -d
```

2. Run database migrations:
```bash
cd supabase
bunx supabase db push
```

3. Start development servers:
```bash
# Terminal 1: Server
cd server && bun run dev

# Terminal 2: Client  
cd client && bun run dev
```

### Testing

```bash
# Run all tests
bun test

# Run with watch mode
bun test --watch
```

### Linting and Formatting

```bash
# Lint code
bun run lint

# Format code
bun run format
```

## Branches

- `main` - Stable version with Expo SDK 50
- `expo-53-upgrade` - Experimental upgrade to Expo SDK 53 with React 19

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
bunx expo export:web
```

### Server Deployment

The server can be deployed to any Node.js hosting platform:
- Railway
- Render
- Fly.io
- Heroku
- AWS/GCP/Azure

Ensure you set all required environment variables and have Redis available.

## Troubleshooting

### "Cannot find native module 'ExpoBarCodeScanner'"
- This is expected in Expo SDK 50
- The app will work normally despite this warning

### "Server Not Running" error
- Ensure the server is running: `cd server && bun run dev`
- Check that `EXPO_PUBLIC_SERVER_URL` in client/.env matches your server URL
- Use "Test Mode" to test the UI without the server

### WhatsApp Connection Issues
- Ensure your phone and computer are on the same network
- Check that the server has internet access for WhatsApp Web
- Try logging out of other WhatsApp Web sessions

## Contributing

Please read our contributing guidelines before submitting PRs.

## License

MIT