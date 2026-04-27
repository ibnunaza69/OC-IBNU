# 03_gateway_api / Blueprint

## Shared context links
- [`../README.md`](../README.md)
- [`../TOOLS.md`](../../../TOOLS.md)
- [`../MEMORY.md`](../../../MEMORY.md)
- [`../../00_shared/blueprint.md`](../../00_shared/blueprint.md)
- [`../../01_product/blueprint.md`](../../01_product/blueprint.md)
- [`../../02_architecture/blueprint.md`](../../02_architecture/blueprint.md)

---

## API design principles

- RESTful where natural, pragmatic over purist
- All endpoints return JSON
- All mutations require API key authentication
- All responses include a `requestId` for tracing
- Errors use standard HTTP status codes + structured error body

---

## Authentication

Header: `X-API-Key: <key>`

Multiple API keys supported (for different internal clients). Keys managed via env var `API_KEYS`.

---

## Endpoints

### `GET /health`
Health check. No auth required.

**Response 200:**
```json
{
  "status": "ok",
  "uptime": 3600,
  "accounts": 2,
  "version": "1.0.0"
}
```

---

### `GET /accounts`
List all WhatsApp accounts.

**Response 200:**
```json
{
  "accounts": [
    {
      "id": "uuid-1",
      "phone": "6281234567890",
      "name": "Account Utama",
      "status": "connected",
      "connectedAt": "2026-04-13T10:00:00Z"
    }
  ]
}
```

---

### `POST /accounts`
Add a new WhatsApp account. Generates a pairing code / returns QR URL.

**Request:**
```json
{
  "name": "Akun Kedua",
  "pairingMethod": "pairingcode"
}
```

**Response 201:**
```json
{
  "id": "uuid-new",
  "name": "Akun Kedua",
  "status": "awaiting_pairing",
  "pairingCode": "XXX-XXX-XXX",
  "message": "Scan with WhatsApp within 60 seconds"
}
```

**Alternative:** if using QR:
```json
{
  "id": "uuid-new",
  "status": "awaiting_qr",
  "qrUrl": "data:image/png;base64,..."  // or separate GET endpoint
}
```

---

### `DELETE /accounts/:id`
Remove and disconnect an account.

**Response 200:**
```json
{
  "id": "uuid-1",
  "status": "removed"
}
```

---

### `GET /accounts/:id/status`
Get detailed connection status.

**Response 200:**
```json
{
  "id": "uuid-1",
  "status": "connected",
  "phone": "6281234567890",
  "deviceName": "iPhone",
  "lastSeen": "2026-04-13T10:05:00Z"
}
```

---

### `POST /send`
Send a WhatsApp message.

**Request:**
```json
{
  "accountId": "uuid-1",
  "to": "6289876543210",
  "type": "text",
  "content": {
    "text": "Halo dari gateway!"
  }
}
```

Supported `type` values:
- `text` — plain text
- `image` — with URL or base64
- `document` — file with caption
- `audio` — audio file
- `video` — video with caption
- `location` — lat/long + name

**Response 202:**
```json
{
  "requestId": "req-uuid",
  "messageId": "msg-uuid",
  "accountId": "uuid-1",
  "to": "6289876543210",
  "status": "queued",
  "estimatedDelivery": "2026-04-13T10:00:05Z"
}
```

**Error 429 (Rate limited):**
```json
{
  "error": "rate_limited",
  "accountId": "uuid-1",
  "retryAfter": 30
}
```

---

### `GET /messages`
Query sent/received messages.

**Query params:**
- `accountId` (optional)
- `direction` (optional): `inbound` | `outbound`
- `from` (optional): sender JID
- `to` (optional): recipient JID
- `limit` (default 50, max 200)
- `cursor` (optional): pagination cursor

**Response 200:**
```json
{
  "messages": [...],
  "nextCursor": "base64-cursor"
}
```

---

### `POST /webhooks`
Register a webhook URL.

**Request:**
```json
{
  "url": "https://my-app.com/wa-webhook",
  "events": ["message.inbound", "account.status"],
  "secret": "shared-secret-for-signature"
}
```

---

### `GET /webhooks`
List registered webhooks.

---

### `DELETE /webhooks/:id`
Remove a webhook.

---

## Webhook payload (inbound)

When an inbound message is received, gateway POSTs to registered webhook URLs:

```json
{
  "event": "message.inbound",
  "requestId": "evt-uuid",
  "timestamp": "2026-04-13T10:00:00Z",
  "accountId": "uuid-1",
  "data": {
    "from": "6289876543210",
    "fromName": "John Doe",
    "to": "6281234567890",
    "messageId": "wa-msg-id",
    "type": "text",
    "content": {
      "text": "Halo!"
    },
    "timestamp": 1713004800
  }
}
```

**Webhook signature:** requests include `X-Webhook-Signature` header — HMAC-SHA256 of the raw body using the registered secret.

---

## Error response format

```json
{
  "error": "error_code",
  "message": "Human-readable description",
  "requestId": "req-uuid",
  "details": {}
}
```

| HTTP Status | error code | When |
|---|---|---|
| 400 | `invalid_request` | Malformed body or missing fields |
| 401 | `unauthorized` | Missing or invalid API key |
| 404 | `not_found` | Account or resource not found |
| 422 | `unprocessable` | Valid format but semantically wrong |
| 429 | `rate_limited` | Too many requests |
| 500 | `internal_error` | Server-side failure |
| 503 | `account_disconnected` | Target account not connected |
