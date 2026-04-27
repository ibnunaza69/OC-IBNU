# Blueprint — 08 Video Generator

## Objective
Menyiapkan pipeline video generation yang provider-agnostic, aman, dan bisa disambungkan ke workflow ads tanpa mengunci desain terlalu dini.

## Responsibilities
- simpan brief / storyboard / generation plan video
- definisikan abstraction provider submit/status/callback
- catat thumbnail, preview, dan output asset ke registry internal
- siapkan lifecycle async untuk queued / processing / done / failed
- sediakan jalur publish video asset internal ke Meta sampai menghasilkan `metaVideoId` yang bisa direuse oleh create ad

## Design principles
- phase awal fokus pada **planning + asset lifecycle**, lalu dilanjutkan dengan binding/publish ke Meta tanpa memecah registry asset internal
- image/video asset harus masuk ke registry internal yang sama agar mudah direuse
- thumbnail dan preview dianggap first-class metadata karena sangat penting untuk ads review dan `video_data.image_url`
- callback lebih diutamakan daripada polling kalau provider mendukung
- binding publish ke Meta harus disimpan di metadata asset agar `metaVideoId` tidak perlu dicari/manual tempel ulang tiap create ad

## Service design
- `VideoGenerationPlanService`
- `VideoProviderAdapter`
- `VideoCallbackHandler`
- `AssetRegistryRepository`

## Guardrails
- provider credential invalid harus stop-and-ask-owner
- jangan hardcode ke satu vendor sebelum kontrak internal stabil
- output video dan thumbnail harus punya metadata expiry / retention yang jelas bila provider membatasi akses
- publish ke Meta adalah write path: wajib lewat reason + gate/approval seperti write flow Meta lain

## Whitelabeling
- Semua konfigurasi Meta dan provider video harus dibaca dari `system_settings` agar pipeline reusable lintas brand.

## Implementation status — 2026-04-17
### Selesai
- [x] `VideoGenerationPlanService` — planning service provider-agnostic + endpoint `POST /internal/assets/videos/generations/plan`
- [x] `VideoProviderAdapter` — provider live pertama KIE Runway (submit/poll/callback/persist)
- [x] Endpoint `POST /internal/assets/videos/generations` dry-run + live (`kie-runway`)
- [x] `VideoCallbackHandler` — `POST /internal/assets/kie/runway/callback`
- [x] `AssetRegistryRepository` — video asset + thumbnail masuk ke `asset_library` yang sama dengan image
- [x] Controlled live test pertama via KIE Runway sukses: submit → poll → `success` → asset tersimpan
- [x] Helper creative-draft video asset → `objectStorySpec.video_data` (constraint `requires-meta-video-id` jika binding belum ada)
- [x] Publish flow `POST /internal/assets/videos/:id/publish/meta` (upload video → wait `ready` → simpan `metaVideoId` binding)
- [x] Controlled live publish sukses: `metaVideoId=1462775635428416`, thumbnail/source Meta tersimpan
- [x] Guardrail write path (reason + gate + approval) pada publish ke Meta

### Belum / pending (tertahan blocker eksternal Meta)
- [ ] Controlled live create ad via `videoAssetId + creativeDraft` — sudah terbukti binding asset OK, tapi mentok `error_subcode=1885183` (app Meta dev mode)
