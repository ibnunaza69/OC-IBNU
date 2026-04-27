# PRD — 06 Copywriting Lab

## Problem
Copy iklan sering tersebar, sulit dibandingkan, dan tidak punya jejak performa yang jelas.

## Goal
Membuat sistem internal untuk menghasilkan dan mereview copy yang terhubung ke context campaign.

## User stories
- Sebagai operator, saya ingin generate beberapa style copy dari satu brief.
- Sebagai owner, saya ingin menyimpan dan membandingkan variant copy dengan rapi.

## Requirements
- generate variant copy
- review copy existing
- versioning
- scoring rubric internal

## Acceptance criteria
- satu brief dapat menghasilkan beberapa variant
- setiap variant punya metadata style dan context
- review output menyebut alasan/rubric, bukan hanya nilai mentah

## Whitelabeling
- Nama brand yang tampil pada output/metadata (jika diperlukan) harus berasal dari `system_settings`, bukan hardcode.

## Implementation status — 2026-04-17
### Acceptance criteria terpenuhi
- [x] satu brief menghasilkan beberapa variant (`/variants/generate`)
- [x] tiap variant punya metadata style + context (campaign/adset/ad)
- [x] review output menyebut alasan/rubric (6 dimensi + strengths/risks/suggestions)

Modul ini **SELESAI**.
