# Blueprint — 03 Start / Stop Ads

## Objective
Mengontrol status delivery campaign, ad set, dan ad dengan aman dan terbaca.

## Responsibilities
- pause/unpause object
- check effective status
- inspect parent blockers
- refresh state after action

## Design notes
Status bisnis tidak cukup dilihat dari object target saja. Parent chain harus dibaca.

## Service design
- `DeliveryControlService`
- `StatusResolverService`
- `HierarchyStateService`

## Action flow
1. identify target object
2. read current state
3. read parent states
4. apply requested status change
5. refresh object snapshot
6. report technical result + delivery readiness

## Guardrails
- jangan klaim “sudah jalan” bila parent masih block
- batasi aksi massal di fase awal
- semua status change wajib audited

## Whitelabeling
- Modul ini wajib memakai konfigurasi Meta (token, ad account) dari database `system_settings` via `configService`.

## Implementation status — 2026-04-17
### Selesai
- [x] `DeliveryControlService` + `StatusResolverService` + `HierarchyStateService` — service dasar untuk read current state, parent chain, apply status change, refresh snapshot
- [x] Generic endpoint `POST/PATCH /api/start-stop-ads/change-status` menerima `targetType: campaign | adset | ad` + reason wajib
- [x] Per-object endpoints Meta: `/campaigns/:id/status|start|stop`, `/ads/:id/status|start|stop` dry-run + live-blocked path
- [x] Write gate + approval token + audit trail pada semua status change
- [x] Settle handling untuk transisi `IN_PROCESS`
- [x] Refresh snapshot otomatis sesudah status change sukses

### Belum / pending
- [ ] Dedicated endpoint per-object untuk ad set status (saat ini ad set cuma lewat generic `change-status`) — opsional bila dibutuhkan parity dengan campaign/ad
