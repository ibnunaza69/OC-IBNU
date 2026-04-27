# Blueprint — 02 Ads Analysis

## Objective
Membangun engine analisa iklan berbasis Meta Insights API dengan biaya resource rendah.

## Responsibilities
- fetch insights by object
- normalize metrics
- compare time windows
- produce summaries and recommendations
- persist snapshots for later review

## Meta official anchors
Insights API mendukung:
- `fields`
- `level`
- `date_preset`
- `time_range`

Field dasar yang wajib didukung dulu:
- impressions
- clicks
- spend
- date_start
- date_stop

## Service design
- `InsightsFetchService`
- `MetricsNormalizerService`
- `PerformanceAnalysisService`
- `RecommendationService`

## Performance approach
- ingest by selected fields only
- snapshot results into DB
- avoid repeated live queries for same view
- use worker jobs for scheduled refresh

## Outputs
- account/campaign/adset/ad summaries
- winner/loser lists
- simple recommendations: hold / pause / inspect / scale

## Whitelabeling
- Semua query Meta harus mengambil `META_ACCESS_TOKEN` dan `META_AD_ACCOUNT_ID` dari database `system_settings` via `configService`, bukan hardcode.

## Implementation status — 2026-04-17
### Selesai
- [x] `InsightsFetchService` — nested Meta insights 30 hari di-attach ke snapshot campaign/ad set/ad saat hierarchy sync
- [x] `MetricsNormalizerService` — normalisasi impressions/clicks/spend/CTR/CPC/CPR/reach + zero-decimal currency (IDR dsb) + primary result action types; helper `buildPerformanceMetrics` di-export sebagai shared utility
- [x] Endpoint `/internal/analysis/overview` dan `/internal/analysis/hierarchy` terverifikasi
- [x] Snapshot-first approach: analysis membaca DB lokal, bukan live query berulang
- [x] `PerformanceAnalysisService` — top/bottom performers (campaign/adset/ad × spend/impressions/reach/clicks/ctr/cpc/resultCount/costPerResult) + `comparePeriods` via `MetaClient.fetchObjectInsights` (datePreset atau `since/until`, diff absolut + percent)
- [x] `RecommendationService` — rule engine hold / pause / inspect / scale dengan threshold eksplisit + alasan tekstual per item + breakdown count
- [x] Endpoint baru: `GET /internal/analysis/performers`, `GET /internal/analysis/recommendations`, `POST /internal/analysis/compare-periods`
- [x] Unit tests: `performance-analysis.service.spec.ts` (3 tests), `recommendation.service.spec.ts` (4 tests)

### Belum / pending
- [ ] Scheduled refresh via worker job khusus analisis (saat ini cukup menumpang hierarchy sync; belum mendesak)
