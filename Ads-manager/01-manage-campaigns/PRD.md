# PRD — 01 Manage Campaigns

## Problem
Pembuatan structure campaign sering tercecer antara Ads Manager manual dan catatan terpisah.

## Goal
Menyediakan alur create, duplicate, preflight, dan sync campaign tree yang repeatable dan audited.

## User stories
- Sebagai operator, saya ingin membuat campaign/ad set/ad dari workflow yang konsisten.
- Sebagai owner, saya ingin object baru aman dan tidak langsung live tanpa sengaja.
- Sebagai operator, saya ingin create ad bisa memakai asset internal (image/video) tanpa harus merakit payload Meta secara manual.
- Sebagai operator, saya ingin duplicate campaign/ad set/ad dari object yang sudah ada tanpa rebuild manual dari nol.
- Sebagai operator, saya ingin tahu lebih dulu apakah create/duplicate ad kemungkinan akan diblok Meta sebelum saya menekan live write.

## Requirements
- create campaign
- create ad set
- create ad
- duplicate campaign
- duplicate ad set
- duplicate ad
- duplicate tree (`campaign -> ad set -> ad`)
- preflight checker untuk create ad dan duplicate ad
- promotability / policy inspection untuk source creative
- verification runner / regression job non-destruktif untuk cek readiness operasional
- support create ad berbasis asset internal (`imageAssetId` / `videoAssetId`) dengan creative draft helper
- refresh snapshots
- tampilkan relasi hierarchy

## Acceptance criteria
- campaign tree baru bisa dibuat step-by-step
- semua provider IDs tersimpan
- create flow gagal secara aman jika parent gagal
- object baru default aman/non-live
- duplicate flow tersedia untuk campaign/ad set/ad dengan dry-run, approval, audit, dan snapshot refresh yang konsisten
- duplicate tree tersedia dengan rename otomatis, approval tunggal, dan rollback cleanup kalau step tengah gagal
- preflight checker bisa memberi status `likely-ready` / `conditional` / `blocked` sebelum live write
- duplicate high-impact (mis. deep copy atau ACTIVE) harus diblok tanpa konfirmasi eksplisit
- duplicate ad harus memberi blocker yang jelas jika creative sumber tidak promotable atau jika app Meta belum memenuhi syarat Live/Public untuk context post-backed creative
- verification runner bisa menjalankan sync hierarchy + preflight/promotability/dry-run checks secara repeatable tanpa membuat object live baru
- create ad berbasis asset internal bisa membentuk payload Meta yang valid; jika Meta menolak, response/audit harus cukup tegas untuk membedakan blocker internal vs blocker eksternal platform

## Whitelabeling
- Semua konfigurasi (nama brand, ad account, pixel, access token) diambil dari database `system_settings` dan wajib tersedia sebelum modul ini dipakai live.

## Implementation status — 2026-04-17
### Acceptance criteria terpenuhi
- [x] campaign tree bisa dibuat step-by-step (campaign + ad set live; ad dry-run ready)
- [x] provider IDs tersimpan (snapshot campaign/adset/ad + parent-child relation)
- [x] create flow gagal aman jika parent gagal
- [x] object baru default `PAUSED`
- [x] duplicate flow (campaign/adset/ad) dry-run + live + approval + audit + snapshot refresh
- [x] duplicate tree + rename otomatis + rollback cleanup terverifikasi live
- [x] preflight checker memberi status `likely-ready` / `conditional` / `blocked`
- [x] guardrail high-impact (ACTIVE / deep copy) memblok tanpa `confirmHighImpact`
- [x] duplicate ad memberi blocker jelas saat creative tidak promotable atau app Meta belum Live/Public
- [x] verification runner non-destruktif + endpoint run/enqueue/status
- [x] create ad berbasis asset internal (`imageAssetId` / `videoAssetId`) membentuk payload valid

### Belum / pending
- [ ] live create ad end-to-end — tertahan Meta `error_subcode=1885183` (app dev mode)
- [ ] live duplicate ad sukses pada source promotable setelah app Meta Live/Public

### Batch 2026-04-17 (selesai di commit ini)
- [x] bulk actions — `BulkActionsService` + endpoint `POST /internal/providers/meta/bulk/status`, `POST /internal/providers/meta/bulk/delete`, `POST /internal/providers/meta/bulk/duplicate-campaigns` (dry-run default, reason wajib, per-target result/error)

Modul ini **SELESAI** untuk scope internal (bulk actions tuntas). Sisa pending bergantung blocker eksternal Meta app Live/Public.
