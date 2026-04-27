# 04_sessions_security / Blueprint

## Shared context links
- [`../README.md`](../README.md)
- [`../TOOLS.md`](../../../TOOLS.md)
- [`../MEMORY.md`](../../../MEMORY.md)
- [`../../00_shared/blueprint.md`](../../00_shared/blueprint.md)

---

## Session management

### How Baileys sessions work

Baileys uses Signal Protocol for E2E encryption. Each WhatsApp account session consists of:
- **Auth state** — credentials, keys, and session data
- **Key state** — signal protocol keys that change over time
- Both must be persisted and restored on restart

### Session storage strategy

Default: `useMultiFileAuthState` (file-based, one folder per account)

```
sessions/
├── account-uuid-1/
│   ├── creds.json       # credentials (ENCRYPTED at rest)
│   ├── keys/
│   └── ...
└── account-uuid-2/
    └── ...
```

**Production recommendation:** Swap file store for a DB-backed store (Redis or PostgreSQL) to enable:
- Multi-instance deployment
- Session encryption at rest with KMS
- Easier backup/restore

### Session lifecycle

1. **Pairing** — first connection, requires QR scan or pairing code
2. **Connected** — active, can send/receive
3. **Disconnected** — temporary (network issue), auto-reconnect
4. **Logged out** — session invalidated, must re-pair
5. **Removed** — session deleted from storage

### Pairing methods

**QR Code** (default)
- Works with any WhatsApp account
- Shows in terminal or Admin UI
- 60-second expiry per QR

**Pairing Code** (phone number based)
- User sends pairing request via WhatsApp
- Code displayed in gateway logs / API response
- Only for same-device linking

---

## Security considerations

### API key management

- API keys passed via `X-API-Key` header
- Keys stored in env var `API_KEYS` (comma-separated for multiple)
- In production, use a secrets manager (e.g., Vault, AWS Secrets Manager)
- Keys should be rotatable without downtime

### Session file permissions

```bash
chmod 700 sessions/
chmod 600 sessions/*/creds.json
```

Never commit session files to git. Add to `.gitignore`:

```
sessions/
*.json
!sessions/.gitkeep
```

### Webhook signature verification

Every inbound webhook delivery includes:
```
X-Webhook-Signature: sha256=<hmac>
```

Verify before processing:

```typescript
import crypto from 'crypto'

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  )
}
```

### Rate limiting

Per account, per minute:
- Outbound: max 20 messages/minute (WhatsApp unofficial limit)
- Configurable via `RATE_LIMIT_PER_ACCOUNT` env

Implementation: in-memory sliding window counter per account, reset every minute.

### Abuse prevention

- Validate `to` number format before sending
- Maintain a blocklist table in DB
- Log all message attempts with requestId for audit
- Webhook should return 200 quickly — don't process heavy logic in the callback

### WhatsApp-specific risks

| Risk | Mitigation |
|---|---|
| Account ban | Don't spam; use verified use cases; avoid bulk |
| Session invalidation | Auto-reconnect; monitor status; alert on disconnect |
| Number reported | Quick detection via `account.update` events |
| Reconnect storm | Debounce reconnect attempts; exponential backoff |

---

## Compliance note

Baileys is an **unofficial** WhatsApp library. WhatsApp's Terms of Service prohibit:
- Automated bulk messaging / spam
- Using unofficial clients for commercial purposes without WhatsApp's approval
- Reverse engineering or violating WhatsApp's API limits

This gateway is for **internal/system use** with legitimate use cases. The operator (Abi) bears responsibility for how it's used.

---

## Monitoring signals

Track these for session health:
- `account.status` events (connect/disconnect/reconnect)
- `creds.update` frequency (should be rare)
- Message failure rate per account
- Baileys log warnings for protocol-level issues
