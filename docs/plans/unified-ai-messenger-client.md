# Unified AI Messenger: Client Implementation Plan

## Overview

Extend the Claire mobile client to support multiple messaging platforms (WhatsApp, Telegram, Instagram, iMessage) in a unified inbox. Users can connect each platform independently and view/send messages across all of them from a single interface.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native Client                       │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  Auth Flow   │    │   Dashboard  │    │   Settings    │  │
│  │              │    │              │    │               │  │
│  │ - Sign in    │    │ - Unified    │    │ - Platform    │  │
│  │ - Platform   │    │   Inbox      │    │   management  │  │
│  │   connection │    │ - Filtering  │    │ - Connect /   │  │
│  │   check      │    │   by platform│    │   disconnect  │  │
│  └──────────────┘    └──────────────┘    └───────────────┘  │
│           │                 │                   │            │
│           └─────────────────┴───────────────────┘           │
│                             │                                │
│                   ┌─────────▼─────────┐                     │
│                   │   platformStore   │                     │
│                   │  (Zustand state)  │                     │
│                   └─────────┬─────────┘                     │
│                             │                                │
│                   ┌─────────▼─────────┐                     │
│                   │  Platform Service │                     │
│                   │   (API calls)     │                     │
│                   └─────────┬─────────┘                     │
└─────────────────────────────┼───────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Claire Backend   │
                    │  /api/platforms/*  │
                    └───────────────────┘
```

## Components

### New Components

| Component | Path | Description |
|-----------|------|-------------|
| `PlatformIcon` | `components/PlatformIcon` | Platform logo with status indicator |
| `PlatformSelector` | `components/PlatformSelector` | Horizontal scroll to filter by platform |
| `PlatformAuthModal` | `components/PlatformAuthModal` | Platform connection flow (QR, phone, cookie) |
| `ConnectedPlatformsList` | `components/ConnectedPlatformsList` | List of connected platforms in settings |

### Modified Components / Screens

| File | Changes |
|------|---------|
| `components/MessageCard` | Add platform badge (icon + color) to each message |
| `screens/LoginScreen` | Add platform connection step after sign-in |
| `screens/DashboardScreen` | Unified inbox with platform filter tabs |
| `screens/SettingsScreen` | Platform management section |
| `screens/SignInScreen` | Check all platform connections on load |

## State Management

### platformStore (Zustand)

```typescript
interface PlatformStore {
  platforms: PlatformConnection[];       // All platforms with status
  activePlatformFilter: string | null;   // Current inbox filter
  isLoading: boolean;
  error: string | null;

  fetchPlatforms: () => Promise<void>;
  connectPlatform: (type: PlatformType) => Promise<void>;
  disconnectPlatform: (type: PlatformType) => Promise<void>;
  setFilter: (platform: string | null) => void;
}
```

### Client-Side Types

```typescript
type PlatformType = 'whatsapp' | 'telegram' | 'instagram' | 'imessage';

interface PlatformConnection {
  type: PlatformType;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  displayName: string;
  lastSeen?: Date;
}

interface UnifiedMessage extends Message {
  platform: PlatformType;
  platformChatId: string;
}
```

## Platform Auth Flows

| Platform | Method | User Action |
|----------|--------|-------------|
| WhatsApp | QR Code | Scan with WhatsApp mobile app |
| Telegram | Phone + Code | Enter phone, then SMS code |
| Instagram | Session cookie | Extract from browser (advanced) |
| iMessage | Mac pairing | Pair with local macOS device |

## API Endpoints Used

```
GET  /api/platforms              - List connected platforms + status
POST /api/platforms/:type/connect    - Start connection flow
POST /api/platforms/:type/disconnect - Disconnect platform
GET  /api/platforms/:type/status     - Poll connection status
GET  /api/messages?platform=all      - Unified inbox
GET  /api/messages?platform=whatsapp - Filtered inbox
```

## Tasks

| # | Task | Status |
|---|------|--------|
| 1 | Create platform service layer for API calls | Done |
| 2 | Create platformStore for multi-platform state management | Done |
| 3 | Create PlatformIcon component | Done |
| 4 | Create PlatformSelector component | Done |
| 5 | Create PlatformAuthModal component | Done |
| 6 | Update MessageCard to show platform badges | Done |
| 7 | Create ConnectedPlatformsList component | Done |
| 8 | Update login screen for multi-platform connection | Done |
| 9 | Update dashboard for unified inbox with platform filtering | Done |
| 10 | Update settings screen with platform management | Done |
| 11 | Create type definitions for client-side platform types | Done |
| 12 | Update signin flow to check all platform connections | Done |
| 13 | Add platform connection status polling | Pending |
| 14 | Create integration tests for platform flows | Pending |

## Remaining Work

### Task 13: Platform Connection Status Polling

Poll `GET /api/platforms/:type/status` while a connection is in progress (e.g. waiting for QR scan). Stop polling once connected or failed.

- Interval: every 3 seconds
- Timeout: 2 minutes
- Trigger: when platform status is `connecting`
- Update platformStore on each poll

### Task 14: Integration Tests

Cover the main platform flows end-to-end:
- Connect WhatsApp (QR code flow)
- Connect Telegram (phone + code flow)
- Filter unified inbox by platform
- Disconnect a platform
- Sign-in with all platforms already connected
