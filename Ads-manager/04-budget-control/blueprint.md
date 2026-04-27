# Blueprint — 04 Budget Control

## Objective
Mengubah budget iklan secara aman dengan memahami letak budget yang benar.

## Responsibilities
- detect budget owner
- set/increase/decrease budget
- validate mutation safety
- record change reason

## Meta official anchors
Budget dapat muncul di ad set atau campaign context. Ad Rule juga menyediakan action terkait budget seperti:
- CHANGE_BUDGET
- CHANGE_CAMPAIGN_BUDGET
- REBALANCE_BUDGET

## Service design
- `BudgetResolverService`
- `BudgetMutationService`
- `BudgetValidationService`

## Action flow
1. resolve target hierarchy
2. detect budget locus
3. validate intended change
4. write to Meta
5. refresh snapshot
6. persist audit and reason

## Guardrails
- reject ambiguous budget owner
- reject unsafe decreases
- avoid repeated chained changes without re-fetch

## Whitelabeling
- Semua write ke Meta mengambil konfigurasi runtime dari `system_settings` via `configService` (tidak hardcode).

## Implementation status — 2026-04-17
### Selesai
- [x] `BudgetResolverService` — deteksi budget owner (campaign vs ad set context)
- [x] `BudgetMutationService` — set / increase / decrease campaign budget (dry-run + live + approval)
- [x] `BudgetValidationService` + guardrail: preview oversized change ditandai out-of-guardrail
- [x] Endpoints `/internal/providers/meta/campaigns/:id/budget`, `/budget/increase`, `/budget/decrease` terverifikasi dry-run + live
- [x] Controlled live budget flow sukses dengan restore ke nilai semula
- [x] Refresh snapshot otomatis sesudah budget change sukses
- [x] Audit trail + reason wajib pada setiap mutation

### Belum / pending
- [ ] Ad-set level budget mutation (saat ini endpoint budget hanya untuk campaign level)
- [ ] `REBALANCE_BUDGET` action (tersedia di rules management, belum ada jalur langsung di modul ini)
