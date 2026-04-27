# PRD — 03 Start / Stop Ads

## Problem
Pause/unpause di Meta Ads bisa menipu bila hanya melihat satu level object dan lupa parent hierarchy.

## Goal
Menyediakan kontrol status yang menjelaskan hasil teknis dan hasil bisnis secara jelas.

## User stories
- Sebagai operator, saya ingin pause satu ad atau satu ad set dengan aman.
- Sebagai owner, saya ingin tahu apakah object benar-benar siap deliver setelah di-start.

## Requirements
- pause/unpause campaign, ad set, ad
- tampilkan blocker parent
- refresh snapshot sesudah aksi

## Acceptance criteria
- hasil aksi menyebut previous state dan current state
- sistem mendeteksi blocker dari parent chain
- semua action tercatat di audit log

## Whitelabeling
- Konfigurasi (ad account, token) tidak boleh hardcode dan harus berasal dari `system_settings`.

## Implementation status — 2026-04-17
### Acceptance criteria terpenuhi
- [x] hasil aksi menyebut previous & current state (snapshot refresh)
- [x] blocker dari parent chain dideteksi via `HierarchyStateService`
- [x] semua action tercatat di audit log via `operation_audits`

Modul ini **SELESAI**. Tidak ada item blocker.
