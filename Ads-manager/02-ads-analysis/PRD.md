# PRD — 02 Ads Analysis

## Problem
Operator perlu membaca performa iklan dengan cepat tanpa bolak-balik manual ke Ads Manager.

## Goal
Memberikan analisa performa yang ringkas, konsisten, dan bisa dipakai untuk keputusan operasional.

## User stories
- Sebagai operator, saya ingin melihat iklan mana yang perform dan tidak perform.
- Sebagai owner, saya ingin rekomendasi tindakan berbasis metrik, bukan intuisi semata.

## Requirements
- fetch insights by date range
- normalize metrics utama
- compare periods sederhana
- output ringkasan + rekomendasi

## Acceptance criteria
- sistem dapat menghasilkan summary campaign/adset/ad
- sistem dapat menampilkan top dan bottom performers
- rekomendasi selalu menyebut metrik pendukung

## Whitelabeling
- Konfigurasi akun/tokens bersifat per-brand dan dikelola via database `system_settings`.

## Implementation status — 2026-04-17
### Acceptance criteria terpenuhi
- [x] summary campaign / ad set / ad via `/internal/analysis/overview` + `/internal/analysis/hierarchy`
- [x] top & bottom performers via `/internal/analysis/performers` (level campaign/adset/ad, metric spend/impressions/reach/clicks/ctr/cpc/resultCount/costPerResult, direction top/bottom)
- [x] rekomendasi berbasis metrik (hold / pause / inspect / scale) via `/internal/analysis/recommendations` — setiap item menyertakan `reasons` + metrik pendukung
- [x] period-over-period comparison via `POST /internal/analysis/compare-periods` (dua window, date preset atau `since/until`, diff absolut + percent)

Modul ini **SELESAI** di internal scope: fetch + normalize + snapshot + performers + recommendations + period comparison.
