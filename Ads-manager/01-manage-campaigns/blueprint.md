# Blueprint — 01 Manage Campaigns

## Objective
Mengelola lifecycle campaign, ad set, dan ad secara terstruktur dan aman.

## Responsibilities
- create campaign
- create ad set
- create ad
- duplicate campaign
- duplicate ad set
- duplicate ad
- duplicate tree (`campaign -> ad set -> ad`)
- preflight create/duplicate ad readiness check
- inspect promotability / policy risk untuk source creative
- jalankan verification/regression runner non-destruktif untuk readiness operasional
- sync hierarchy snapshot
- update metadata terbatas
- link creative reference ke ad
- resolve asset-bound creative draft (image/video) ke payload Meta yang valid sebelum create ad

## Meta official anchors
- create campaign: `POST /act_<AD_ACCOUNT_ID>/campaigns`
- create ad set: `POST /act_<AD_ACCOUNT_ID>/adsets`
- create ad: `POST /act_<AD_ACCOUNT_ID>/ads`
- duplicate campaign: `POST /<CAMPAIGN_ID>/copies`
- duplicate ad set: `POST /<ADSET_ID>/copies`
- duplicate ad: `POST /<AD_ID>/copies`

## Service design
- `CampaignService`
- `AdSetService`
- `AdService`
- `DuplicateWriteService`
- `DuplicateTreeService`
- `PreflightCheckService`
- `MetaVerificationRunnerService`
- `CampaignSyncService`

## Write strategy
1. validate credential state
2. validate source/parent object
3. compose payload
4. submit to Meta
5. persist audit
6. refresh snapshot

Duplicate path mengikuti pola yang sama, tetapi source object harus readable dari snapshot/live read lebih dulu dan write live wajib lewat approval token.

Preflight path harus berjalan **tanpa** membuat object baru di Meta, tetapi tetap cukup informatif untuk mengungkap blocker eksternal terbaru dari audit/history lokal.

Verification runner/regression job juga harus non-destruktif secara default: ia boleh melakukan live read/sync, preflight, promotability inspect, dan duplicate-tree dry-run, tetapi tidak boleh membuat object iklan live tanpa approval terpisah.

Khusus duplicate ad, keberhasilan live tidak hanya bergantung pada endpoint copy, tetapi juga pada **promotability creative sumber** dan apakah Meta menganggap copy tersebut perlu konteks post/ad creative dari app yang sudah **Live/Public**.

## Safe defaults
- object baru default `PAUSED` kecuali operator explicit meminta live
- create flow berhenti jika parent prerequisite gagal
- no bulk destructive action di fase awal
- duplicate flow default ke `status_option=PAUSED`
- duplicate tree live selalu dianggap high-impact dan harus minta konfirmasi eksplisit
- duplicate campaign/ad set dengan `deepCopy=true` dianggap high-impact dan harus minta konfirmasi eksplisit untuk live path
- duplicate ad harus mengembalikan blocker yang jujur bila creative sumber tidak promotable atau bila app Meta masih development mode
- untuk video asset, create ad hanya lanjut bila `metaVideoId` + thumbnail sudah tersedia; kalau belum, flow harus menyuruh publish video asset ke Meta lebih dulu

## Data captured
- campaign snapshot
- adset snapshot
- ad snapshot
- provider ids
- parent-child relation
- last sync time
- asset binding metadata (mis. asset library source, `metaVideoId`, thumbnail/source Meta untuk creative video)

## Whitelabeling
- Semua operasi Meta harus mengambil `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, dan `META_PIXEL_ID` dari database `system_settings` via `configService`, bukan hardcode atau asumsi env statis.

## Implementation status — 2026-04-17
### Selesai
- [x] `CampaignService` / `AdSetService` / `AdService` — create dry-run + guardrail `confirmHighImpact` + validasi parent
- [x] Create campaign live path (termasuk `is_adset_budget_sharing_enabled=false`) + controlled live test campaign + ad set `PAUSED`
- [x] `DuplicateWriteService` — duplicate campaign / ad set / ad (Meta copy edge resmi, approval, audit, refresh snapshot); live sukses untuk campaign & ad set
- [x] `DuplicateTreeService` — campaign → ad set → ad, rename otomatis, approval tunggal, rollback cleanup; mode aman live sukses, mode penuh terbukti rollback bekerja
- [x] `PreflightCheckService` — preflight create-ad & duplicate-ad (likely-ready / conditional / blocked)
- [x] Promotability inspect endpoint untuk source ad (creative/page/video + failure evidence)
- [x] `MetaVerificationRunnerService` + worker queue `meta.verification.runner` + endpoint run/enqueue/status + env hook cron
- [x] `CampaignSyncService` + hierarchy sync + nested Meta insights 30 hari pada snapshot
- [x] Resolve asset-bound creative: `imageAssetId` → `link_data`, `videoAssetId` → `video_data` (resolve `metaVideoId` + thumbnail), publish video→Meta (live sukses, `metaVideoId=1462775635428416`)
- [x] Create ad via inline creative + fix `video_data.description` (`error_subcode=1443050`)
- [x] Cleanup/delete flow campaign & ad set (approval + audit + Meta delete + cleanup snapshot)
- [x] Dashboard operator console untuk duplicate / duplicate-tree / delete / promotability / preflight duplicate / duplicate ad live

### Batch 2026-04-17 (selesai di commit ini)
- [x] `BulkActionsService` — `bulkChangeStatus` (campaign/ad), `bulkDelete` (campaign/adset), `bulkDuplicateCampaigns`; per-target success/error aggregation
- [x] Bulk routes: `POST /internal/providers/meta/bulk/status`, `POST /internal/providers/meta/bulk/delete`, `POST /internal/providers/meta/bulk/duplicate-campaigns` (dry-run default, reason wajib, approval + secret headers)

### Belum / pending (tertahan blocker eksternal Meta)
- [ ] Controlled live test create tree penuh sampai level ad — tertahan `error_subcode=1885183` (app Meta masih development mode)
- [ ] Duplicate ad live sukses end-to-end — butuh source ad promotable setelah app Meta Live/Public (dua test terakhir kena `2875030` + `1885183`)
- [ ] Create-ad live UI di dashboard — sengaja ditahan sampai Meta app Live/Public
