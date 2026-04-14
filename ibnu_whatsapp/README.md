# ibnu_whatsapp

WhatsApp gateway foundation berbasis Baileys untuk kebutuhan Abi.

## Status sekarang

Project sudah masuk fondasi implementasi dengan komponen berikut:
- TypeScript + Node.js
- Gateway manager untuk multi-account
- REST API dasar
- Webhook placeholder + contract
- Admin API skeleton
- Simple admin page
- Auth/session storage abstraction

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

### Account control
- `POST /accounts`

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
- `src/admin-contract.ts` → contract admin API
- `src/admin-page.ts` → HTML admin page sederhana

## Next recommended steps
1. real webhook dispatcher
2. persistent DB-backed auth store
3. admin dashboard frontend terpisah
4. retry / queue / rate-limit layer
5. pembuktian pairing dari environment lain
