# PRD — 04 Budget Control

## Problem
Budget Meta Ads tidak selalu berada di level yang sama, sehingga perubahan manual mudah salah target.

## Goal
Menyediakan budget control yang tahu budget ada di campaign atau ad set sebelum melakukan perubahan.

## User stories
- Sebagai operator, saya ingin menaikkan budget dengan aman.
- Sebagai owner, saya ingin semua perubahan budget punya alasan dan audit trail.

## Requirements
- detect budget owner
- increase/decrease by amount or percent
- set budget directly
- store reason of change

## Acceptance criteria
- sistem menolak mutation jika budget owner ambigu
- setiap mutation menyimpan old/new budget
- perubahan budget direfresh ke snapshot setelah sukses

## Whitelabeling
- Konfigurasi Meta (token, ad account) harus diambil dari `system_settings` sehingga modul ini reusable lintas brand.

## Implementation status — 2026-04-17
### Acceptance criteria terpenuhi
- [x] sistem menolak mutation jika budget owner ambigu (guardrail resolver)
- [x] setiap mutation menyimpan old/new budget + reason di audit
- [x] snapshot direfresh setelah sukses

### Belum / pending
- [ ] budget mutation di level ad set (kalau dibutuhkan parity)

Modul ini **SELESAI** untuk scope campaign-level.
