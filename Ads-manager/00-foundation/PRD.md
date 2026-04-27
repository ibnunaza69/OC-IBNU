# PRD — 00 Foundation

## Problem
Tanpa foundation yang kuat, modul Meta Ads dan KIE akan cepat berantakan: auth tidak konsisten, error sulit dibaca, dan write actions sulit diaudit.

## Goal
Menyediakan pondasi tunggal untuk config, auth, DB, queue, logging, provider client, dan sistem **Full Whitelabel**.

## User stories
- Sebagai pengguna, saya akan diminta mengisi nama brand, account ID, pixel ID, dan access token saat pertama kali menjalankan sistem jika belum ada.
- Sebagai operator, saya ingin error token terlihat jelas agar bisa cepat mengganti token.
- Sebagai developer, saya ingin semua modul memakai contract dan error model yang sama.
- Sebagai owner, saya ingin seluruh perubahan ke provider bisa diaudit.

## Requirements
- Sistem Full Whitelabel berbasis database (`system_settings`) + endpoint update konfigurasi, tanpa hardcode.
- config loader typed
- database schema & migration flow
- queue job runner
- provider client untuk Meta & KIE
- audit logging untuk semua write action
- normalized error classes

## Acceptance criteria
- semua modul lain bisa import foundation tanpa duplicate logic
- auth failure menghasilkan state yang jelas
- write actions punya jejak audit
- worker jobs bisa retry hanya untuk transient errors

## Implementation status — 2026-04-17
- [x] semua acceptance criteria di atas terpenuhi dan sudah dipakai modul 01–09
- [x] whitelabel berbasis `system_settings` aktif, endpoint internal foundation & providers/meta/kie terverifikasi
- Tidak ada item yang masih pending untuk modul ini.
