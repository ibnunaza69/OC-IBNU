# PRD — 08 Video Generator

## Problem
Pipeline ads butuh jalur yang rapi untuk merencanakan dan nanti menghasilkan video asset, tapi provider video final belum tentu dipilih sekarang.

## Goal
Membangun fondasi internal agar brief video, storyboard, status job, thumbnail, output asset, dan binding publish ke Meta bisa dicatat rapi tanpa membuat pipeline video tergantung ke satu provider.

## User stories
- Sebagai operator konten, saya ingin menyimpan brief video dan storyboard supaya produksi tidak tercecer.
- Sebagai owner, saya ingin setiap task video punya jejak status dan metadata yang bisa diaudit.
- Sebagai engineer, saya ingin mengganti provider video tanpa membongkar kontrak internal task/asset.
- Sebagai operator ads, saya ingin video asset internal bisa dipublish ke Meta sampai menghasilkan `metaVideoId` yang siap dipakai create ad.

## Requirements
- create video generation plan internal
- simpan brief, durasi, aspect ratio, output style, storyboard, dan reference assets
- support status lifecycle untuk planned / queued / processing / done / failed
- support thumbnail / preview metadata di asset registry
- support publish flow dari video asset internal ke Meta sampai menghasilkan `metaVideoId`
- simpan binding publish Meta di metadata asset agar reusable untuk create ad berikutnya
- siapkan kontrak provider abstraction untuk implementasi live berikutnya

## Acceptance criteria
- operator bisa membuat plan video generation internal
- plan tersimpan sebagai task terstruktur di database
- task video bisa dilist bersama task image pada registry internal
- video asset yang sudah siap bisa dipublish ke Meta dan menghasilkan `metaVideoId`
- binding `metaVideoId` tersimpan di asset metadata dan bisa dipakai ulang oleh flow create ad
- desain siap menerima provider live berikutnya tanpa ubah kontrak data utama

## Whitelabeling
- Publish/binding ke Meta wajib memakai konfigurasi dinamis (token, ad account) dari `system_settings`.

## Implementation status — 2026-04-17
### Acceptance criteria terpenuhi
- [x] operator bisa membuat plan video generation internal
- [x] plan tersimpan sebagai task terstruktur
- [x] task video bisa dilist bersama task image di `asset_library`
- [x] video asset bisa dipublish ke Meta dan menghasilkan `metaVideoId` (terverifikasi live)
- [x] binding `metaVideoId` tersimpan di metadata asset, reusable untuk create ad
- [x] provider adapter siap — KIE Runway terpasang tanpa merusak kontrak internal

### Belum / pending
- [ ] create ad live berbasis `videoAssetId` end-to-end — tertahan Meta `error_subcode=1885183` (app dev mode)

Modul ini **SELESAI** di internal scope; blocker akhir ada di requirement eksternal Meta (lihat modul 01).
