# Blueprint — Meta Ads Development Workspace

## Objective
Membangun sistem internal operasi Meta Ads yang cepat, ringan, dan aman untuk dijalankan di server saat ini:
- 2 vCPU
- 7.5 GB RAM
- 100 GB disk
- Node.js 22

## Architectural direction
Pilih **modular monolith** berbasis TypeScript + Fastify + PostgreSQL.

Kenapa:
- lebih ringan daripada microservices
- cocok untuk workload dominan external API
- cepat diimplementasikan
- mudah diaudit dan dipelihara

## Core principles
1. **Sistem Full Whitelabel**: Konfigurasi brand (Nama Brand, Meta Account ID, Meta Pixel ID, Access Token, dll) disimpan di database `system_settings` dan dikelola via endpoint internal, tidak boleh hardcode.
2. **Meta Ads adalah source of truth** untuk object ads, status, budget, insights, dan rules.
3. **KIE.ai hanya untuk image generation/editing**.
4. **Video generation disiapkan via provider abstraction terpisah**, agar tidak mengikat desain ke satu vendor terlalu dini.
5. **Semua write ke provider wajib punya audit trail**.
6. **Auth failure wajib stop-and-ask-owner**, bukan auto-refresh ngawur.
7. **Snapshot over repeated live reads** untuk efisiensi.
8. **Worker-driven async flow** untuk sync, polling, dan callback handling.

## System shape

### Runtime layout
- API service
- Worker service
- PostgreSQL
- Caddy (opsional tapi direkomendasikan untuk callback/HTTPS)
- dashboard web internal berjalan di API service yang sama

### Shared components
- auth manager
- config loader
- provider clients
- audit logger
- job dispatcher
- snapshot repository
- error mapper

## Folder map
- `00-foundation/` → auth, config, database, queue, logging, contracts
- `01-manage-campaigns/` → campaign tree orchestration + duplicate flows, termasuk preflight/promotability checks dan duplicate-tree rollback (dengan catatan duplicate ad tetap tunduk pada promotability creative sumber dan status Live/Public app Meta)
- `02-ads-analysis/` → insights ingestion and decision support
- `03-start-stop-ads/` → delivery state actions
- `04-budget-control/` → budget mutation engine
- `05-kie-image-generator/` → image task orchestration
- `06-copywriting-lab/` → creative text generation and review
- `07-rules-management/` → automated rule lifecycle
- `08-video-generator/` → provider-agnostic video generation planning and asset lifecycle
- `09-dashboard-monitoring/` → secure web dashboard + monitoring summary

## Dashboard expansion notes
Phase dashboard tidak berhenti di summary monitoring. Dashboard harus berkembang menjadi operator workspace yang tetap read-heavy, dengan area utama berikut:
- **campaign explorer**: list campaign → ad set → ad dengan drilldown hierarchy yang nyaman dibaca di web/mobile, termasuk detail ad yang bisa menampilkan preview creative dari Meta dan linked asset internal bila tersedia
- **creative library**: list creative/asset hasil generate yang tersimpan di registry internal
- **audience manager**: list/edit/delete custom audience dan lookalike audience dengan guardrail reason + dry-run
- **workflow explorer**: visualisasi workflow operasional dalam bentuk graph agar sistem bisa menjelaskan flow ketika diminta owner/operator
- **settings & credentials**: halaman pengaturan untuk credential state, token/account binding, ad account Meta, KIE config state, dan metadata operasional terkait

Prinsip tambahan untuk dashboard expansion:
- navigasi harus mengikuti pola admin dashboard yang rapi dan konsisten
- UI harus mobile-friendly sejak awal
- konten user-facing tidak boleh berisi catatan internal implementation/thinking
- detail object tetap mengandalkan snapshot internal sebagai sumber baca utama
- detail ad boleh memperkaya panel dengan live creative preview dari Meta selama tetap read-only dan tidak membocorkan secret/context sensitif

Status 2026-04-06:
- scope expansion dashboard sudah dipaku ke 4 area utama di atas
- baseline sebelum fase implementasi lanjutan sudah di-commit dan di-push (`2a6030a`)
- implementasi halaman lanjutan berjalan bertahap setelah checkpoint tersebut, bukan ditumpuk sekaligus tanpa checkpoint
- campaign detail sekarang sudah melampaui hierarchy dasar: panel ad bisa meminta preview creative per-ad dari Meta serta menampilkan linked internal asset jika ad tersebut berasal dari flow asset internal

Status 2026-04-09:
- callback OAuth Meta di dashboard sekarang harus menampilkan detail error provider yang benar-benar datang dari Meta saat code→token exchange gagal, termasuk HTTP status, type, code, subcode, dan `fbtrace_id` bila tersedia, agar diagnosis mismatch `app_id`/`app_secret`, redirect URI, atau authorization code jauh lebih cepat
- dashboard API sekarang sudah punya audience feature awal untuk custom/lookalike: list, edit metadata (name/description/retention untuk custom), dan delete dengan audit trail

## Server-fit decisions
- **no Kubernetes**
- **no microservices default**
- **no Redis in first version**; gunakan PostgreSQL + pg-boss untuk queue
- **no heavy ORM**; pilih Drizzle
- **no repeated deep polling**; gunakan callback jika memungkinkan

## Data strategy
- state operational disimpan sebagai snapshot internal
- request/response penting disimpan ringkas untuk audit
- asset output KIE dicatat dengan expiry awareness
- asset image/video masuk ke registry internal agar reusable lintas phase
- copy variants harus versioned

## Security / auth rules
Jika salah satu ini terjadi:
- Meta token invalid / expired
- permission tidak cukup
- KIE API key invalid
- KIE credits tidak cukup

maka sistem harus:
1. menghentikan write flow
2. menyimpan error detail
3. menandai credential state sebagai invalid
4. meminta owner mengganti token/API key

## Delivery phases
> Catatan: urutan phase adalah urutan logis delivery; nama folder historis tetap dipertahankan bila sudah terlanjur ada di repo.

1. Foundation
2. Ads Analysis
3. Start / Stop Ads
4. Budget Control
5. Rules Management
6. Manage Campaigns
7. KIE Image Generator
8. Video Generator
9. Copywriting Lab
10. Dashboard Monitoring

## Mandatory docs in each module
Setiap modul harus memiliki:
- `blueprint.md`
- `PRD.md`
- shortcut ke `TOOLS.md`
- shortcut ke `MEMORY.md`

## Official references
### Meta
- https://developers.facebook.com/docs/marketing-api/
- https://developers.facebook.com/docs/marketing-api/overview/
- https://developers.facebook.com/docs/marketing-api/get-started/basic-ad-creation/create-an-ad-campaign/
- https://developers.facebook.com/docs/marketing-api/get-started/basic-ad-creation/create-an-ad-set/
- https://developers.facebook.com/docs/marketing-api/insights/
- https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/
- https://developers.facebook.com/docs/marketing-api/reference/adgroup/
- https://developers.facebook.com/docs/marketing-api/reference/adrule/

### KIE.ai
- https://docs.kie.ai/
- https://docs.kie.ai/4o-image-api/quickstart
- https://docs.kie.ai/4o-image-api/generate-4-o-image
- https://docs.kie.ai/4o-image-api/get-4-o-image-details
- https://docs.kie.ai/4o-image-api/generate-4-o-image-callbacks
