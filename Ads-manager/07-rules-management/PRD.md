# PRD — 07 Rules Management

## Problem
Automated rules di Meta Ads mudah jadi black box bila tidak didokumentasikan dan disinkronkan dengan baik.

## Goal
Menyediakan workflow rule management yang aman, bisa dibaca, dan mudah ditelusuri.

## User stories
- Sebagai operator, saya ingin menambah atau mengubah rule tanpa kehilangan kejelasan logic.
- Sebagai owner, saya ingin rule yang aktif punya jejak dan history yang jelas.

## Requirements
- add/edit/delete rule
- enable/disable rule
- validate evaluation/execution/schedule
- sync history dasar

## Acceptance criteria
- rule spec tervalidasi sebelum submit
- snapshot rule tersimpan
- enable/disable dan update rule tercatat di audit

## Whitelabeling
- Akses token dan ad account yang dipakai modul rules harus berasal dari `system_settings` agar modular lintas brand.

## Implementation status — 2026-04-17
### Acceptance criteria terpenuhi
- [x] rule spec tervalidasi sebelum submit (draft/validate endpoint)
- [x] snapshot rule tersimpan + `/rules/history` tersedia
- [x] enable/disable/update rule tercatat di audit

Modul ini **SELESAI**.
