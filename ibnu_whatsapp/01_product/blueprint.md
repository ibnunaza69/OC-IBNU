# 01_product / Blueprint

## Shared context links
- [`../README.md`](../README.md) — project root
- [`../TOOLS.md`](../../../TOOLS.md)
- [`../MEMORY.md`](../../../MEMORY.md)
- [`../../00_shared/blueprint.md`](../../00_shared/blueprint.md)

---

## Product vision

WhatsApp gateway yang jadi jembatan antara sistem/internal tools dengan WhatsApp. Bisa kirim notifikasi, menerima input dari user via WhatsApp, dan mengelola banyak akun WhatsApp dari satu titik.

---

## Use cases

### outbound (server → WhatsApp user)
1. **Kirim notifikasi** — order status, payment confirmation, reminder
2. **Kirim broadcast** — announcements ke banyak kontak (dengan rate limit)
3. **Kirim pesan terjadwal** — delayed message delivery
4. **Kirim media** — gambar, dokumen, audio, video

### inbound (WhatsApp user → server)
5. **Terima pesan** — relay inbound messages ke webhook/internal system
6. **Auto-reply / chatbot** — respons otomatis berdasarkan keyword atau AI
7. **Command handling** — user kirim perintah khusus (e.g. `/status`, `/help`)
8. **Group event handling** — join/leave group events forwarded

### admin / management
9. ** Kelola akun** — add/remove WhatsApp accounts
10. **Lihat status** — connected/disconnected per akun
11. **Scan QR** — pairwise account registration via UI
12. **Monitor queue** — outbound message queue and delivery status
13. **Blacklist** — block specific numbers from interacting

---

## User flows

### Flow 1: Admin adds new WhatsApp account
```
Admin opens Dashboard
→ clicks "Add Account"
→ gateway shows QR code in UI
→ Admin scans with WhatsApp phone
→ Session saved, account appears as "Connected"
```

### Flow 2: System sends outbound notification
```
Internal system calls REST API POST /send
→ Gateway validates API key
→ Checks account availability
→ Sends message via Baileys
→ Returns message ID + delivery status
→ Updates status via webhook callback
```

### Flow 3: User sends inbound message
```
User sends WhatsApp message
→ Baileys receives via WebSocket
→ Gateway forwards to configured webhook URL
→ External system processes and optionally replies
→ Reply sent back via POST /send or auto-reply engine
```

---

## Feature scope

### In scope (v1)
- Multi-account WhatsApp (2–5 accounts)
- REST API for sending messages
- Webhook for inbound messages
- Admin dashboard UI
- QR code pairing
- Session persistence (survive restart)
- Rate limiting per account
- Basic logging

### Out of scope (v1, revisit later)
- AI chatbot / NLP
- Scheduled campaigns with analytics
- Multi-tenant (several clients)
- Message template management
- Official WhatsApp Business API integration

---

## Non-functional requirements

- **Availability** — gateway should auto-reconnect after network drop
- **Latency** — outbound message delivery < 5s under normal conditions
- **Rate limit** — max 20 messages/minute per account to avoid spam
- **Session security** — auth state stored encrypted at rest
- **Logging** — all API calls, message events, errors logged with timestamps

---

## Metrics to track

- Message delivery rate (sent vs delivered)
- Account uptime per number
- Average message latency
- Failed message retry count
- Active sessions count
