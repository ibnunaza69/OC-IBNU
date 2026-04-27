# 02_architecture / Blueprint

## Shared context links
- [`../README.md`](../README.md)
- [`../TOOLS.md`](../../../TOOLS.md)
- [`../MEMORY.md`](../../../MEMORY.md)
- [`../../00_shared/blueprint.md`](../../00_shared/blueprint.md)
- [`../../01_product/blueprint.md`](../../01_product/blueprint.md)

---

## System architecture

```
                    ┌─────────────────┐
                    │   Admin UI      │  (React/Vite, port 3000)
                    │  (Dashboard)    │
                    └────────┬────────┘
                             │ HTTP/REST
                    ┌────────▼────────┐
                    │   Gateway Core  │  (Node.js + Express/Fastify)
                    │  (TypeScript)   │  port 8080
          ┌─────────┼─────────────────┼─────────┐
          │         │                 │         │
┌─────────▼───┐ ┌───▼────┐  ┌──────▼──────┐ ┌─▼────────┐
│  Baileys A  │ │ Baileys B│  │  Baileys N  │ │Webhook   │
│  (Account 1)│ │(Account 2)│  │ (Account N) │ │Sender    │
└─────────────┘ └─────────┘  └─────────────┘ └──────────┘
     WhatsApp      WhatsApp      WhatsApp      External
     Network       Network       Network      Systems
```

---

## Component breakdown

### 1. Gateway Core (`/src/core/`)
Main entry point. Manages lifecycle, event bus, and coordinates all components.
- `index.ts` — bootstrap, load accounts, start server
- `EventBus.ts` — internal pub/sub for cross-component events
- `Config.ts` — environment variable loader

### 2. WhatsApp Adapter (`/src/adapters/whatsapp/`)
Wraps Baileys per account. One instance per account.
- `WhatsAppAccount.ts` — class that manages one Baileys socket
- `AccountManager.ts` — registry of all accounts, handles add/remove
- `SessionStore.ts` — persists auth state to disk (can swap for DB later)

### 3. REST API Server (`/src/api/`)
Exposes HTTP endpoints for outbound operations.
- `routes/send.ts` — POST /send
- `routes/account.ts` — GET/POST /accounts
- `routes/health.ts` — GET /health
- `middleware/auth.ts` — API key validation
- `middleware/rateLimit.ts` — per-account rate limiting

### 4. Webhook Forwarder (`/src/api/webhook.ts`)
Receives inbound Baileys events and forwards to configured URLs.
- `inboundHandler.ts` — processes `messages.upsert` events
- `forwarder.ts` — delivers to registered webhook URLs with retry logic

### 5. Admin Dashboard (`/src/dashboard/` or separate repo)
- `pages/accounts.tsx` — account listing, QR scan modal
- `pages/messages.tsx` — message log viewer
- `pages/settings.tsx` — webhook URL, rate limits config

### 6. Session Storage (`/src/storage/`)
- File-based via `useMultiFileAuthState` (dev/default)
- Interface designed to swap for Redis/PostgreSQL later

---

## Data flow

### Outbound message
```
Client → POST /send
       → API validates key + rate limit
       → AccountManager selects account
       → BaileysAccount.sendMessage()
       → Baileys sends via WhatsApp network
       → Response: { messageId, status: "sent" }
```

### Inbound message
```
WhatsApp user → Baileys socket (WebSocket)
             → Gateway EventBus emits "message:inbound"
             → WebhookForwarder receives event
             → POST to configured webhook URL
             → External system can POST /send to reply
```

---

## Database schema (recommended)

### Table: `accounts`
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| phone | VARCHAR | WhatsApp number (unique) |
| name | VARCHAR | Friendly label |
| status | ENUM | `disconnected`, `connecting`, `connected` |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Table: `messages`
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| account_id | UUID | FK to accounts |
| direction | ENUM | `inbound`, `outbound` |
| from | VARCHAR | Sender JID |
| to | VARCHAR | Recipient JID |
| content | TEXT | Message body |
| status | ENUM | `queued`, `sent`, `delivered`, `failed` |
| created_at | TIMESTAMP | |

### Table: `webhooks`
| Column | Type | Description |
|---|---|---|
| id | UUID | Primary key |
| url | VARCHAR | Target webhook URL |
| events | JSON | Array of event types to forward |
| active | BOOLEAN | |

---

## Environment variables

```env
# Server
PORT=8080
NODE_ENV=production

# Security
API_KEYS=key1,key2,key3

# Storage
SESSION_DIR=./sessions

# Webhook
WEBHOOK_URL=https://your-system.com/wa-webhook
WEBHOOK_SECRET=shared_secret

# Rate limiting
RATE_LIMIT_PER_ACCOUNT=20  # per minute

# Logging
LOG_LEVEL=info
```
