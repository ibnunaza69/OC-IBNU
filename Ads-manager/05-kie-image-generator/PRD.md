# PRD — 05 KIE Image Generator

## Problem
Tim butuh generator visual untuk konten ads yang bisa masuk ke workflow internal, bukan tool terpisah tanpa jejak.

## Goal
Mengintegrasikan KIE.ai image generation ke pipeline internal secara async dan terukur.

## User stories
- Sebagai operator konten, saya ingin generate image dari brief.
- Sebagai owner, saya ingin hasil asset tercatat dan bisa ditelusuri.

## Requirements
- submit text-to-image / edit / variant task
- track task status
- store result URLs dan metadata
- support callback untuk production
- hasil asset masuk ke registry internal yang bisa dikonsumsi phase lain

## Acceptance criteria
- task submit menghasilkan taskId tersimpan
- task success menyimpan result URLs
- task failure menyimpan error code/message
- sistem mematuhi limit polling resmi
- asset yang sukses bisa dilist ulang dari registry internal

## Whitelabeling
- KIE API key dan callback URL harus diambil dari `system_settings` (per-brand), bukan hardcode.

## Implementation status — 2026-04-17
### Acceptance criteria terpenuhi
- [x] task submit menghasilkan taskId tersimpan
- [x] task success menyimpan result URLs
- [x] task failure menyimpan error code/message
- [x] sistem mematuhi limit polling resmi (worker backoff)
- [x] asset yang sukses bisa dilist ulang dari `asset_library`

Modul ini **SELESAI**.
