# Blueprint — 06 Copywriting Lab

## Objective
Menyediakan layer internal untuk membuat, mereview, dan mem-versioning copy iklan.

## Responsibilities
- generate copy variants
- review existing copy
- score by internal rubric
- map copy to campaign/ad context

## Design rule
Style copywriting bukan aturan resmi Meta docs; itu adalah logic internal product. Karena itu modul ini harus diperlakukan sebagai internal decision layer yang terhubung ke object model ads.

## Service design
- `CopyGenerationService`
- `CopyReviewService`
- `CopyVariantRepository`
- `CreativeContextResolver`

## Outputs
- primary text variants
- headline variants
- review notes
- rubric scores
- link ke campaign/ad context

## Guardrails
- jangan klaim aturan copy internal sebagai aturan resmi Meta
- semua variant harus versioned
- review output harus explainable

## Whitelabeling
- Identitas brand untuk context output (jika ditampilkan) wajib berasal dari konfigurasi dinamis `system_settings`.

## Implementation status — 2026-04-17
### Selesai
- [x] `CopyGenerationService` — generate variant copy terikat context `campaignId` / `adSetId` / `adId` dari snapshot lokal
- [x] `CopyReviewService` — rubric internal (`clarity`, `specificity`, `ctaStrength`, `audienceFit`, `complianceSafety`, `lengthFit`) + strengths/risks/suggestions
- [x] `CopyVariantRepository` + `CreativeContextResolver` — versioning/lineage variant
- [x] Schema `copy_variants` + `copy_reviews` (migration `0006_spooky_gambit.sql`)
- [x] Endpoints `GET/POST /internal/copy/variants`, `POST /variants/:id/revise`, `GET/POST /internal/copy/reviews`
- [x] Smoke test lokal sukses untuk generate + review
- [x] Guardrail: review output explainable, variant selalu versioned, brand identity dari `system_settings`

### Belum / pending
- Tidak ada. Modul ini **SELESAI** di scope internal lab. Integrasi langsung ke flow create-ad (auto-pull variant ke `objectStorySpec`) bersifat opsional dan belum direquest.
