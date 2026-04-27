# Blueprint — 05 KIE Image Generator

## Objective
Menyediakan pipeline image generation/editing yang ringan dan reliable untuk kebutuhan konten ads.

## Responsibilities
- submit KIE task
- poll task status atau terima callback
- normalize result asset
- store asset metadata and expiry
- daftarkan output ke asset registry internal agar reusable untuk phase ads / video

## KIE official anchors
- base URL `https://api.kie.ai`
- submit `POST /api/v1/gpt4o-image/generate`
- query `GET /api/v1/gpt4o-image/record-info`
- callback via `callBackUrl`
- polling max 3x/detik/task
- output disimpan 14 hari

## Service design
- `KieTaskService`
- `KiePollingWorker`
- `KieCallbackHandler`
- `AssetStoreService`
- `AssetRegistryRepository`

## Strategy
- development: polling diperbolehkan dengan backoff aman
- production: prioritaskan callback
- simpan result URL + mirrored asset metadata

## Guardrails
- API key tidak boleh bocor ke frontend
- stop workflow pada 401/402
- respect KIE query limits
- default integration tetap internal-only dan sebaiknya preview/dry-run dulu sebelum dipakai operator non-teknis

## Whitelabeling
- Kredensial KIE (API key) dan callback runtime wajib disimpan sebagai settings dinamis di `system_settings`.

## Implementation status — 2026-04-17
### Selesai
- [x] `KieTaskService` — submit KIE task via `POST /api/v1/gpt4o-image/generate` (dry-run + live)
- [x] `KiePollingWorker` — worker queue `asset.generation.image.kie.poll` aktif
- [x] Manual poll endpoint `POST /internal/assets/generation-tasks/:taskId/poll`
- [x] `KieCallbackHandler` — endpoint `POST /internal/assets/kie/callback`
- [x] `AssetStoreService` + `AssetRegistryRepository` — persist output ke `asset_library`
- [x] Metadata enrichment otomatis (`mimeType`, `width`, `height`, `byteSize`, `filename`, `thumbnailUrl`) + refresh manual `/library/:id/refresh-metadata`
- [x] Controlled live test pertama sukses: submit → poll → `SUCCESS` → asset tersimpan
- [x] Helper creative-draft image asset → `objectStorySpec.link_data` untuk integrasi dengan create ad
- [x] Guardrail credential invalid (stop-and-ask) + error 401/402 handler

### Belum / pending
- Tidak ada. Modul ini **SELESAI**.
