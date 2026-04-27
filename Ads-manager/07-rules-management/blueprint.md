# Blueprint — 07 Rules Management

## Objective
Mengelola lifecycle automated rules Meta Ads secara aman, terbaca, dan bisa diaudit.

## Responsibilities
- create rule draft
- validate rule spec
- submit/update/delete rule
- enable/disable rule
- sync rule history

## Meta official anchors
Ad Rule reference memuat komponen utama:
- `evaluation_spec`
- `execution_spec`
- `schedule_spec`
- `status`
- `history`

Execution types yang relevan:
- PAUSE
- UNPAUSE
- CHANGE_BUDGET
- CHANGE_CAMPAIGN_BUDGET
- REBALANCE_BUDGET
- NOTIFICATION
- PING_ENDPOINT

## Service design
- `RuleDraftService`
- `RuleValidationService`
- `RuleSyncService`
- `RuleHistoryService`

## Guardrails
- rule write wajib audited
- validation dilakukan sebelum submit
- perubahan rule yang bisa memengaruhi budget/status massal harus explicit

## Whitelabeling
- Modul ini wajib memakai konfigurasi Meta dari `system_settings` via `configService`, bukan hardcode.

## Implementation status — 2026-04-17
### Selesai
- [x] `RuleDraftService` — endpoint `POST /internal/providers/meta/rules/drafts/validate`
- [x] `RuleValidationService` — validasi `evaluation_spec` / `execution_spec` / `schedule_spec` sebelum submit
- [x] `RuleSyncService` — sync snapshot rules + endpoints `POST /rules`, `POST /rules/:id`, `DELETE /rules/:id`
- [x] Status control: `POST /rules/:id/status`, `/enable`, `/disable` (dry-run + live)
- [x] `RuleHistoryService` — `/rules/history` + `/rules/history/sync`
- [x] Guardrail `confirmHighImpact` untuk live rule write
- [x] Controlled live test rule create disabled + delete restore sukses
- [x] Controlled live test rule create + enable + disable + delete sukses
- [x] Controlled live test rule update + restore + delete sukses
- [x] Audit trail + snapshot refresh pada setiap write

### Belum / pending
- Tidak ada. Modul ini **SELESAI**.
