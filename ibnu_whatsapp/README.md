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

## Minimal Baileys repro

Untuk memisahkan masalah Baileys/runtime dari layer gateway utama, jalankan repro minimal ini:

```bash
BAILEYS_REPRO_PAIRING_NUMBER=6281222627969 npm run repro
```

Opsional:
- `BAILEYS_REPRO_SESSION_DIR=./sessions/repro`
- `BAILEYS_REPRO_QR_PATH=./sessions/repro-qr.png`
- `PREFER_IPV4=true`

Repro ini hanya fokus pada:
- `connection.update`
- QR save
- pairing code request
- disconnect code/message/detail
- auth creds summary

## Baileys repro v2 (variasi fingerprint/options)

Versi v2 dipakai untuk A/B test beberapa fingerprint/profile koneksi tanpa menyentuh layer gateway utama.

Contoh:

```bash
BAILEYS_REPRO_PAIRING_NUMBER=6281222627969 BAILEYS_REPRO_PROFILE=mac-desktop npm run repro:v2
```

Profile yang tersedia:
- `mac-desktop`
- `mac-safari`
- `ubuntu-desktop`
- `ubuntu-chrome`
- `windows-desktop`
- `windows-chrome`

Env penting:
- `BAILEYS_REPRO_PROFILE`
- `BAILEYS_REPRO_PAIRING_NUMBER`
- `BAILEYS_REPRO_SESSION_DIR`
- `BAILEYS_REPRO_QR_PATH`
- `PREFER_IPV4`

Default path v2 dipisah per profile agar sesi tiap eksperimen tidak saling menimpa:
- session: `./sessions/repro-v2/<profile>`
- QR: `./sessions/repro-v2/<profile>/qr.png`

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
- `API_KEYS` (opsional; kalau kosong, middleware API key dimatikan)
- `PREFER_IPV4` (default `true`; berguna di VPS yang IPv6-nya tidak benar-benar usable)

## Endpoint utama

### Health & status
- `GET /health`
- `GET /status`
- `GET /accounts`
- `GET /accounts/:accountId`
  - sekarang juga expose metadata registry account
- `GET /diagnostics`
  - ringkasan service/runtime + registry + account error state untuk troubleshooting
  - sekarang juga expose jejak pairing/runtime seperti `pairingRequested`, `lastPairingAttemptAt`, `lastPairingCodeAt`, `lastDisconnectCode`, dan `authStateSummary`

### Account control
- `POST /accounts`
- `POST /accounts/:accountId/reset-session`
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
- `gateway.error`

### Admin
- `GET /admin`
- `GET /admin/overview`
- `GET /admin/contracts`
- `GET /diagnostics`
- admin page sekarang menampilkan status reconnect/error dan quick actions untuk stop/restart/reset/remove per account

### Security headers
- API key: `x-api-key`
- Webhook signature: `x-webhook-signature`

## Contoh curl

```bash
curl -H 'x-api-key: dev-key-123' http://localhost:8080/health
curl -H 'x-api-key: dev-key-123' http://localhost:8080/accounts
curl -H 'x-api-key: dev-key-123' http://localhost:8080/admin/overview
curl -H 'x-api-key: dev-key-123' http://localhost:8080/diagnostics

curl -X POST http://localhost:8080/accounts \
  -H "Content-Type: application/json" \
  -d '{"accountId":"acc-2","pairingNumber":"6281234567890"}'

curl -X POST http://localhost:8080/accounts/acc-2/reset-session
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
1. richer diagnostic detail per account
2. audit race condition reconnect vs manual lifecycle action di runtime nyata
3. admin dashboard frontend terpisah
4. pembuktian pairing dari environment lain
5. lanjutkan isolasi environment VPS bila pairing tetap gagal sebelum code/QR muncul
