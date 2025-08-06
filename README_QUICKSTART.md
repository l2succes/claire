# Claire - Quick Start Guide

## ✅ Prerequisites Completed
- Bun runtime installed
- Supabase project created (khhvrwomoghmwhfxlnky)
- Dependencies installed

## 🚀 Quick Start

### 1. Setup Database (One-time setup)
```bash
# Go to Supabase SQL Editor:
# https://supabase.com/dashboard/project/khhvrwomoghmwhfxlnky/sql

# Copy and run the migration from:
# supabase/migrations/20250806092049_initial_schema.sql
```

### 2. Configure Environment Variables

**Server** (`server/.env`):
```env
SUPABASE_URL=https://khhvrwomoghmwhfxlnky.supabase.co
SUPABASE_ANON_KEY=your-anon-key-from-supabase
SUPABASE_SERVICE_KEY=your-service-key-from-supabase
DATABASE_URL=your-database-url-from-supabase
OPENAI_API_KEY=your-openai-key
JWT_SECRET=your-jwt-secret-min-32-chars
ENCRYPTION_KEY=your-32-char-encryption-key
```

**Client** (`client/.env`):
```env
EXPO_PUBLIC_SUPABASE_URL=https://khhvrwomoghmwhfxlnky.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-from-supabase
EXPO_PUBLIC_API_URL=http://localhost:3001
```

### 3. Start Development

**Option A: Start Both Together**
```bash
./scripts/dev.sh
```

**Option B: Start Separately**

Terminal 1 - Server:
```bash
cd server
bun run dev
```

Terminal 2 - Client:
```bash
cd client
bun run dev
```

### 4. Access the App

- **Web**: Press `w` in the Expo terminal or go to http://localhost:8081
- **iOS**: Press `i` to open iOS Simulator
- **Android**: Press `a` to open Android Emulator
- **Phone**: Scan QR code with Expo Go app

## 🎯 Current Status

### ✅ Completed
- Project infrastructure setup
- Bun runtime migration
- Database schema created
- WhatsApp authentication system
- Message ingestion pipeline
- Server runs successfully
- Client runs successfully

### 📋 Next Steps
1. Complete database migration in Supabase
2. Add real API keys to environment variables
3. Test WhatsApp QR code authentication
4. Implement frontend UI components

## 🛠️ Troubleshooting

### Babel Error
Fixed! The babel.config.js has been updated for Expo SDK 50.

### Port Already in Use
```bash
# Kill server port
lsof -ti:3001 | xargs kill -9

# Kill client port
lsof -ti:8081 | xargs kill -9
```

### Clear Caches
```bash
# Clear Metro bundler
cd client && bunx expo start --clear

# Clear Watchman
watchman watch-del-all
```

### Database Connection Error
Make sure you've:
1. Run the migration in Supabase SQL Editor
2. Added correct Supabase credentials to `.env` files

## 📱 Features Implemented

### Backend (Server)
- WhatsApp Web integration with session management
- Message capture and storage pipeline
- AI response generation (GPT-4)
- Promise/commitment detection
- Contact identity inference
- Real-time sync with Supabase
- Redis queue system for async processing

### Frontend (Client)
- Expo Router navigation
- Authentication flow
- Dashboard view
- Promise tracking view
- Settings page
- NativeWind (Tailwind) styling
- Zustand state management

## 🔗 Important Links
- **Supabase Dashboard**: https://supabase.com/dashboard/project/khhvrwomoghmwhfxlnky
- **Expo Dev Client**: http://localhost:8081
- **Backend API**: http://localhost:3001

## 📝 Development Commands

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type checking
bun run typecheck

# Linting
bun run lint

# Build for production
cd server && bun run build
cd client && bunx expo export
```