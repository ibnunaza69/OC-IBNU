# ibnu_whatsapp

WhatsApp gateway foundation berbasis Baileys untuk kebutuhan Abi.

## Status sekarang

Project sudah masuk fondasi implementasi dengan komponen berikut:
- TypeScript + Node.js
- Gateway manager untuk multi-account
- REST API dasar
- Webhook contract + outbound dispatcher
- Admin API skeleton
- Simple admin page
- Auth/session storage abstraction
- Account registry metadata
- Per-account send queue dasar

> Catatan: pairing WhatsApp di VPS ini masih gagal sebelum QR keluar. Jadi fondasinya jalan, tapi login WA belum terbukti sukses di environment ini.

## Menjalankan project

```bash
npm install
npm run build
npm start
```

Default API server:
- `http://localhost:8080`

## Environment

Lihat `.env.example`.

Variabel penting:
- `PORT`
- `SESSION_DIR`
- `DEFAULT_ACCOUNT_ID`
- `WA_PAIRING_NUMBER`
- `WEBHOOK_PATH`

## Endpoint utama

### Health & status
- `GET /health`
- `GET /status`
- `GET /accounts`
- `GET /accounts/:accountId`
  - sekarang juga expose metadata registry account

### Account control
- `POST /accounts`
- `POST /accounts/:accountId/stop`
- `POST /accounts/:accountId/restart`
- `DELETE /accounts/:accountId`

Body contoh:
```json
{
  "accountId": "acc-2",
  "pairingNumber": "6281234567890"
}
```

### Send message
- `POST /send`

Body contoh:
```json
{
  "accountId": "default",
  "jid": "6281234567890@s.whatsapp.net",
  "text": "Halo dari gateway"
}
```

### Webhook
- `POST /webhook`
- outbound dispatch event ke `WEBHOOK_URL` bila di-set
- outbound request membawa:
  - `x-webhook-secret`
  - `x-webhook-signature` (HMAC SHA-256)
- retry dasar: 3 attempt

Event yang sudah disiapkan:
- `gateway.started`
- `gateway.connection.update`
- `gateway.qr.received`
- `gateway.message.received`
- `gateway.creds.updated`

### Admin
- `GET /admin`
- `GET /admin/overview`
- `GET /admin/contracts`

## Contoh curl

```bash
curl http://localhost:8080/health
curl http://localhost:8080/accounts
curl http://localhost:8080/admin/overview

curl -X POST http://localhost:8080/accounts \
  -H "Content-Type: application/json" \
  -d '{"accountId":"acc-2","pairingNumber":"6281234567890"}'

curl -X POST http://localhost:8080/accounts/acc-2/stop
curl -X POST http://localhost:8080/accounts/acc-2/restart \
  -H "Content-Type: application/json" \
  -d '{"pairingNumber":"6281234567890"}'
curl -X DELETE http://localhost:8080/accounts/acc-2

curl -X POST http://localhost:8080/send \
  -H "Content-Type: application/json" \
  -d '{"accountId":"default","jid":"6281234567890@s.whatsapp.net","text":"Halo dari gateway"}'
```

## Struktur src
- `src/index.ts` → bootstrap server
- `src/config.ts` → config app
- `src/auth-store.ts` → abstraction auth/session storage
- `src/gateway-manager.ts` → lifecycle account/socket
- `src/api.ts` → REST API
- `src/webhook-contract.ts` → contract event webhook
- `src/webhook-dispatcher.ts` → outbound webhook dispatcher
- `src/admin-contract.ts` → contract admin API
- `src/admin-page.ts` → HTML admin page sederhana
- `src/account-registry.ts` → metadata registry account
- `src/send-queue.ts` → serial queue per account
- `src/event-bus.ts` → internal event bus

## Next recommended steps
1. persistent DB-backed auth store
2. admin dashboard frontend terpisah
3. persistent DB-backed auth/session store
4. richer admin dashboard frontend
5. pembuktian pairing dari environment lain
