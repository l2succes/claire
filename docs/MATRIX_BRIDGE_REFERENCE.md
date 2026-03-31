# Mautrix Bridge API Reference

Quick reference for the mautrix bridge APIs used in Claire. For full docs, see https://docs.mau.fi/

## Bridge Bot Commands

Each platform bridge has a bot user that accepts commands in a control room (DM with the bot).

### WhatsApp (`@whatsappbot:claire.local`)

| Command | Description |
|---------|-------------|
| `login qr` | Start QR code login flow |
| `login phone` | Start phone pairing code flow |
| `logout` | Disconnect WhatsApp |
| `ping` | Check connection status |
| `help` | List available commands |

Auth docs: https://docs.mau.fi/bridges/go/whatsapp/authentication.html

After login, the bridge:
1. Sends `"Successfully logged in as +<phone>"` as `m.notice`
2. Creates portal rooms for each WhatsApp chat (~1 minute)
3. Backfills 50 most recent messages per room (configurable)

### Telegram (`@telegrambot:claire.local`)

| Command | Description |
|---------|-------------|
| `login` | Start login (prompts for phone number, then verification code) |
| `logout` | Disconnect Telegram |
| `ping` | Check connection status |

### Instagram (`@instagrambot:claire.local`)

| Command | Description |
|---------|-------------|
| `login-cookie` | Login with browser cookies |
| `logout` | Disconnect Instagram |
| `ping` | Check connection status |

Note: Instagram bridge uses `meta_` prefix (Meta platform). Configure `network.mode` for Instagram DMs.

## Ghost User Patterns

Ghost users represent remote platform contacts in Matrix. Their IDs follow this pattern:

```
@<prefix><platform_id>:<server_name>
```

| Platform | Prefix | Example |
|----------|--------|---------|
| WhatsApp | `whatsapp_` | `@whatsapp_15166100494:claire.local` |
| Telegram | `_telegram_` | `@_telegram_123456789:claire.local` |
| Instagram | `meta_` | `@meta_987654321:claire.local` |
| iMessage | `_imessage_` | `@_imessage_+15551234567:claire.local` |

These prefixes are configured in `server/src/adapters/matrix/types.ts` and must match the `username_template` in each bridge's appservice registration.

### Self Ghost User

Without double puppeting, the user's own messages come from their ghost user (not the bot). For example, if the logged-in WhatsApp number is +15166100494, outgoing messages come from `@whatsapp_15166100494:claire.local`.

The server parses the phone number from the login success message and tracks this as the "self ghost ID" per session.

## Double Puppeting

Docs: https://docs.mau.fi/bridges/general/double-puppeting.html

**Current status**: Not enabled in Claire.

Without double puppeting:
- User's outgoing messages appear as their ghost user
- The server must track the "self ghost ID" to set `isFromMe` correctly

With double puppeting (recommended for future):
- User's outgoing messages appear as their actual Matrix account
- Automatic invite acceptance for new chats
- Settings sync (mute status, etc.)

Setup requires adding `double_puppet.secrets` to bridge config with the appservice's `as_token`.

## Backfill Behavior

Docs: https://docs.mau.fi/bridges/general/backfill.html

- Matrix doesn't support inserting messages into room history
- Backfilled messages appear at end of timeline regardless of original timestamp
- Historical backfill only works in new, empty rooms
- WhatsApp uses one-time "history sync" blobs sent after device linking
- MSC2716 (true history insertion) was abandoned

## Appservice Registration

Docs: https://docs.mau.fi/bridges/general/registering-appservices.html

Each bridge needs an appservice registration file added to Synapse's `homeserver.yaml`:

```yaml
app_service_config_files:
  - /data/whatsapp-registration.yaml
  - /data/telegram-registration.yaml
  - /data/instagram-registration.yaml
```

Key fields:
- `as_token` / `hs_token` — Authentication between bridge and Synapse
- `username_template` — Controls ghost user ID format (must match our `GHOST_USER_PREFIXES`)
- `bot_username` — The bridge bot user ID

## Troubleshooting

Docs: https://docs.mau.fi/bridges/general/troubleshooting.html

Common issues:
- **Bot not responding**: Check appservice connectivity (`docker logs claire-synapse`)
- **No messages bridged**: Verify bridge is logged in (`ping` command in control room)
- **Login loop**: WhatsApp may disconnect linked devices after phone is offline >2 weeks
- **"User not found"**: Ghost user prefix mismatch between bridge config and our `types.ts`

### Our Docker Config

```
docker/matrix/docker-compose.matrix.yml
docker/matrix/data/synapse/       — Synapse config + homeserver.yaml
docker/matrix/data/whatsapp/      — mautrix-whatsapp config
docker/matrix/data/telegram/      — mautrix-telegram config
docker/matrix/data/instagram/     — mautrix-instagram config
```

Logs:
```bash
docker logs claire-mautrix-whatsapp -f
docker logs claire-mautrix-telegram -f
docker logs claire-mautrix-instagram -f
docker logs claire-synapse -f
```
