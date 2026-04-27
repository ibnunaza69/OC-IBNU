# Blueprint: ibnu_whatsapp

## Shared context links
- Tools: [`../TOOLS.md`](../TOOLS.md)
- Memory: [`../MEMORY.md`](../MEMORY.md)

## Objective
Membangun WhatsApp gateway berbasis Baileys yang bisa dipakai sebagai fondasi integrasi aplikasi Abi.

## Why Baileys
- Ringan, berbasis WebSocket
- Tidak butuh Selenium/Chromium
- Mendukung multi-device
- Community adoption cukup besar

## Important analysis
1. Baileys bukan API resmi WhatsApp.
2. Session/auth state adalah area paling sensitif.
3. Perlu strategi reconnect yang hati-hati.
4. Perlu batasan use case agar gateway tidak berubah menjadi tool spam.
5. Untuk production, store auth keys dan message state wajib dirancang serius.

## Recommended project principles
- TypeScript first
- Pisahkan domain transport WhatsApp dari business logic
- Semua config lewat environment variables
- Session storage jangan hardcoded ke local filesystem untuk production
- Logging dan healthcheck harus ada sejak awal

## Proposed target output
- 1 service gateway utama
- 1 storage strategy untuk auth/session
- 1 internal API atau webhook layer
- 1 deployment recipe (dev + production)
- 1 dokumen operasional dasar

## Decisions locked (answered by Abi)
1. **Arah pesan:** dua arah (inbound + outbound)
2. **Jumlah nomor:** multi-account
3. **Interface:** REST API + webhook
4. **Deploy target:** VPS sekarang (`43.134.74.130`)
5. **Dashboard:** perlu UI (Admin Dashboard)
6. **Stack:** TypeScript + Node.js

## Folder map
- `00_shared/blueprint.md` ✅
- `01_product/blueprint.md` ✅
- `02_architecture/blueprint.md` ✅
- `03_gateway_api/blueprint.md` ✅
- `04_sessions_security/blueprint.md` ✅
- `05_deployment_ops/blueprint.md` ✅
- `06_delivery_roadmap/blueprint.md` ✅
