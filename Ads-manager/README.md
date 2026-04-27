# Meta Ads Dev

Platform internal untuk operasi Meta Ads + integrasi KIE.ai dengan kapabilitas **Full Whitelabel** (konfigurasi brand & kredensial runtime disimpan di database, bukan hardcode).

Project ini dibangun sebagai **modular monolith** dengan dua process utama:
- **API server** untuk endpoint internal
- **Worker** untuk background jobs / queue processing

## Status saat ini

Project ini sudah melewati tahap scaffold awal dan sekarang sudah punya fondasi development yang cukup matang.

Yang sudah tersedia:
- Fastify API skeleton + worker skeleton
- konfigurasi env tervalidasi
- PostgreSQL + Drizzle schema dasar
- repository layer untuk audit, credentials state, jobs, dan provider logs
- Meta provider client dengan sanitization + normalized error handling
- KIE provider client boundary
- read-only sync hierarchy Meta ke database lokal
- analysis endpoint berbasis snapshot lokal
- queue + worker untuk hierarchy sync
- safe write gate + approval flow dasar
- dry-run start/stop ad & campaign
- dry-run budget control campaign
- approval token flow untuk live write guardrail
- controlled live test untuk campaign start/stop + restore
- controlled live test untuk budget change + restore
- auto-refresh snapshot setelah live write
- read-only rules sync + rules history sync
- rule draft normalization + validation preview internal
- dry-run + live-safe guardrail untuk rule create/update/enable/disable/delete
- controlled live rule test untuk create disabled rule + delete restore
- controlled live rule test untuk create disabled + enable + disable + delete restore
- controlled live rule test untuk update + restore + delete pada rule test disabled
- create campaign flow dasar dengan dry-run/live-safe gate, approval, audit, dan snapshot refresh
- create ad set flow dasar dengan validasi parent campaign, dry-run/live-safe gate, approval, audit, dan snapshot refresh
- create ad flow dengan validasi parent ad set, support creative reference existing **atau** inline `objectStorySpec` + `pageId`, dry-run/live-safe gate, approval, audit, dan snapshot refresh
- jalur create ad sekarang bisa membuat ad creative dulu via `/adcreatives` sebelum create ad untuk kasus permission blocker pada creative reference existing
- duplicate flow sekarang tersedia untuk campaign, ad set, dan ad lewat Meta copy edge, lengkap dengan dry-run/live-safe gate, approval, audit, dan refresh snapshot target setelah live copy
- preflight checker sekarang tersedia untuk create ad dan duplicate ad: bisa membaca blocker eksternal terbaru (mis. `1885183` app belum Live/Public), mengecek context page/creative dasar, dan memberi status `likely-ready` / `conditional` / `blocked` sebelum live write
- duplicate tree full flow sekarang tersedia untuk `campaign -> ad set -> ad` dalam satu endpoint, dengan default `PAUSED`, approval tunggal, rename otomatis, dan rollback cleanup bila step tengah gagal
- promotability / policy inspection untuk source ad sekarang tersedia agar duplicate ad bisa diperiksa dulu sebelum live hit Meta
- controlled live tree test sudah membuktikan create campaign + ad set `PAUSED`; live validation penuh untuk jalur ad create terbaru masih perlu dijalankan
- fondasi image generator sekarang sudah ada: task registry, asset registry, internal route submit/poll/callback, dan worker poll queue untuk KIE
- image asset registry sekarang juga bisa simpan metadata yang lebih kaya (mime type, dimensi, byte size, thumbnail/source URL) dan refresh metadata ulang per asset
- image asset registry sekarang bisa dipakai langsung untuk membangun draft creative ads dan create ad dry-run via `imageAssetId`
- fondasi video generator sekarang sudah ada di level planning: video generation plan internal + provider abstraction placeholder + registry task video
- provider live pertama untuk video generation sekarang sudah dipasang via KIE Runway API (submit/poll/callback + persist video asset), dan live fire pertamanya sudah sukses
- helper creative draft sekarang tersedia untuk asset image **dan** video; untuk video, helper bisa resolve `metaVideoId` + thumbnail dari binding publish Meta yang tersimpan di asset metadata, lalu membentuk `objectStorySpec.video_data` yang valid untuk create ad
- dashboard monitoring web sekarang tersedia langsung di API server yang sama, dengan auth session-based, login rate limit dasar, dan summary operasional untuk foundation/provider/jobs/audit/assets/copy
- dashboard API sekarang punya audience manager awal untuk custom/lookalike (list, edit metadata, delete) dengan reason + dry-run + audit trail
- campaign explorer dashboard sekarang tidak cuma menampilkan hierarchy, tapi juga preview creative per-ad dari Meta, linked internal asset, metrik inti (budget, spend, CPC, CPR, clicks, impressions, CTR, reach/result bila tersedia), plus tombol `Sync Meta` terpisah dari refresh snapshot lokal
- typecheck, build, dan health endpoint sudah terverifikasi

Yang belum dilakukan:
- controlled live test create tree kecil campaign -> ad set -> ad sampai lolos penuh di Meta tanpa blocker eksternal
- bukti live duplicate ad yang lolos penuh pada source creative yang promotable **dan** app Meta yang sudah Live/Public
- dashboard action UI untuk duplicate / cleanup / promotability / preflight sudah ada; create ad live sengaja belum dibuka di UI karena masih kena blocker Meta `1885183`
- campaign explorer sekarang juga sudah punya pemisahan jelas antara `Refresh snapshot` vs `Sync Meta` agar operator tahu kapan data hanya reload lokal dan kapan benar-benar tarik ulang dari Meta
- live verification runner / regression job operasional sekarang sudah ada untuk sync hierarchy + preflight create + promotability + preflight duplicate + duplicate-tree dry-run, baik via run langsung maupun queue worker
- bulk actions (bulk duplicate / pause-start / cleanup)
- rollout dashboard ke domain publik + hardening final cookie/TLS di deployment production
- auth/provider hardening lanjutan

Verifikasi terbaru (2026-04-06):
- route `POST /internal/assets/videos/:assetId/publish/meta` sudah live-safe: butuh reason, tunduk ke write gate/approval, upload video internal ke Meta, menunggu status `ready`, lalu menyimpan binding `metaVideoId` ke metadata asset
- create ad sekarang bisa menerima `videoAssetId + creativeDraft`; draft video otomatis memakai binding `metaVideoId` yang tersimpan dan thumbnail Meta hasil publish
- controlled live verification terbaru membuktikan jalur internal video→Meta sudah sukses sampai menghasilkan `metaVideoId=1462775635428416`
- internal blocker yang tersisa sudah dibereskan: `description` tidak lagi dikirim ke `object_story_spec.video_data` karena Meta menolaknya (`error_subcode=1443050`)
- external blocker final yang masih tersisa untuk live create ad adalah Meta app mode / advertiser context: create ad live masih ditolak dengan `error_subcode=1885183` karena app pembuat postingan materi iklan masih mode development dan harus public/live
- browser/headless smoke test dashboard sekarang tersedia via Playwright (`npm run test:smoke:dashboard`) dan sudah memverifikasi login, protected route `overview/campaigns/creatives/workflows/settings`, plus interaksi dasar SPA setelah auth
- endpoint duplicate baru sudah terpasang dan tervalidasi di dry-run lokal: campaign, ad set, dan ad bisa dipreview tanpa membuat object baru di Meta, termasuk resolusi source snapshot + approval payload
- controlled live duplicate terbaru menunjukkan duplicate campaign + ad set sudah lolos penuh (dan cleanup sukses), sementara duplicate ad tetap bergantung pada promotability creative sumber
- live duplicate ad pada source pertama ditolak Meta karena creative sumber tidak promotable (`error_subcode=2875030`, reel dengan musik berhak cipta)
- live duplicate ad pada source kedua menegaskan blocker eksternal lain: saat creative sumber lolos dari isu copyright, Meta tetap bisa menolak dengan `error_subcode=1885183` bila app pembuat post/ad creative masih development mode dan belum Live/Public
- batch lanjutan sekarang sudah menutup 3 gap besar yang tadinya masih kosong: preflight checker, promotability inspection, dan duplicate tree full flow
- live test duplicate-tree terbaru membuktikan mode aman (`includeAds=false`) bisa sukses dan cleanup, sedangkan mode penuh dengan ads gagal karena blocker `1885183` namun rollback campaign hasil copy juga sukses

Detail progres ada di file: `IMPLEMENTATION-STATUS.md`

## Arsitektur

- **Modular monolith**
- **API process**: `src/server.ts`
- **Worker process**: `src/worker.ts`
- **Shared PostgreSQL**
- **Queue**: `pg-boss`
- **ORM / migrations**: Drizzle

## Tech stack

- Node.js 22+
- TypeScript
- Fastify
- PostgreSQL
- Drizzle ORM / Drizzle Kit
- pg-boss
- Zod
- Pino

## Struktur project

```text
src/
  config/                  Runtime config + env schema
  lib/                     Logger, HTTP wrapper, shared errors
  modules/
    analysis/              Snapshot-based analysis endpoints
    asset-generation/      Image task orchestration + video planning + asset registry
    copywriting-lab/       Generate/revise/review copy variants
    dashboard-monitoring/  Secure web dashboard + monitoring summary
    foundation/            DB, queue, audit, approvals, jobs, internal infra
    health/                Health routes
    meta-sync/             Sync orchestration + repositories
    meta-write/            Write gate, approval, guarded Meta write flow
    providers/
      internal/            Internal provider status/log endpoints
      kie/                 KIE client
      meta/                Meta client
server.ts                  API entrypoint
worker.ts                  Worker entrypoint
```

## Environment

Contoh environment tersedia di `.env.example`.

Variable utama:

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
DATABASE_URL=postgres://metaads:metaads@127.0.0.1:5432/meta_ads_dev
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=
META_SYNC_HIERARCHY_CRON=
META_WRITE_ENABLED=false
META_WRITE_SECRET=
META_WRITE_APPROVAL_REQUIRED=true
META_WRITE_APPROVAL_TTL_SECONDS=900
META_BUDGET_MAX_ABSOLUTE_DELTA=500000
META_BUDGET_MAX_PERCENT_DELTA=50
KIE_API_KEY=
KIE_CALLBACK_URL=
DASHBOARD_AUTH_ENABLED=true
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=
DASHBOARD_PASSWORD_HASH=
DASHBOARD_SESSION_SECRET=
DASHBOARD_SESSION_TTL_SECONDS=43200
DASHBOARD_COOKIE_SECURE=true
DASHBOARD_LOGIN_MAX_ATTEMPTS=5
DASHBOARD_LOGIN_BLOCK_MINUTES=15
```

## Menjalankan project

### 1. Install dependency

```bash
npm install
```

### 2. Siapkan environment

```bash
cp .env.example .env
```

Lalu isi nilai yang diperlukan, terutama:
- `DATABASE_URL`
- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `META_WRITE_SECRET`
- `KIE_API_KEY` bila integrasi KIE dipakai
- `DASHBOARD_USERNAME`
- `DASHBOARD_PASSWORD_HASH` **atau** `DASHBOARD_PASSWORD`
- `DASHBOARD_SESSION_SECRET`

### Catatan dashboard auth

Untuk deployment publik, disarankan:
- pakai `DASHBOARD_PASSWORD_HASH` (bukan plaintext password)
- set `DASHBOARD_COOKIE_SECURE=true`
- taruh API di belakang HTTPS / Caddy / Cloudflare

Contoh generate hash password scrypt:

```bash
node --input-type=module - <<'EOF'
import { randomBytes, scryptSync } from 'node:crypto';
const password = 'ganti-password-anda';
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
console.log(`scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`);
EOF
```

### 3. Jalankan database migration / schema push

```bash
npm run db:push
```

### 4. Jalankan API server

```bash
npm run dev
```

### 5. Jalankan worker

```bash
npm run dev:worker
```

## Scripts

```bash
npm run dev            # start API in watch mode
npm run dev:worker     # start worker in watch mode
npm run build          # build TypeScript ke dist/
npm run start          # run built API
npm run start:worker   # run built worker
npm run typecheck      # TypeScript noEmit check
npm run test           # run test suite
npm run dashboard:hash-password -- "password-kuat"   # generate scrypt hash untuk dashboard
npm run db:generate    # generate Drizzle migration
npm run db:push        # push schema ke database
npm run db:studio      # buka Drizzle Studio
```

## Deployment dashboard production

Artefak deploy yang sudah disiapkan:

- `deploy/DEPLOYMENT-DASHBOARD.md`
- `deploy/caddy/meta-ads-dashboard.Caddyfile`
- `deploy/systemd/meta-ads-api.service`
- `deploy/systemd/meta-ads-worker.service`

Alur singkat rollout:

1. arahkan A record Cloudflare ke server
2. build app di server
3. isi env production dashboard
4. generate `DASHBOARD_PASSWORD_HASH`
5. pasang systemd service
6. pasang Caddy reverse proxy
7. buka `https://domain-anda/dashboard`

## Endpoint internal yang sudah ada

### Foundation
- `GET /internal/foundation/status`
- `GET /internal/foundation/audits`
- `GET /internal/foundation/credentials`
- `GET /internal/foundation/provider-request-logs`
- `GET /internal/foundation/jobs`
- `POST /internal/foundation/write-approvals`

### Provider / Meta
- `GET /internal/providers/status`
- `GET /internal/providers/logs`
- `GET /internal/providers/meta/probe`
- `GET /internal/providers/meta/ad-account`
- `GET /internal/providers/meta/campaigns`
- `POST /internal/providers/meta/campaigns/sync`
- `GET /internal/providers/meta/adsets`
- `POST /internal/providers/meta/adsets/sync`
- `GET /internal/providers/meta/ads`
- `POST /internal/providers/meta/ads/sync`
- `GET /internal/providers/meta/rules`
- `POST /internal/providers/meta/rules/sync`
- `GET /internal/providers/meta/rules/history`
- `POST /internal/providers/meta/rules/history/sync`
- `POST /internal/providers/meta/rules/drafts/validate`
- `POST /internal/providers/meta/campaigns`
- `POST /internal/providers/meta/adsets`
- `POST /internal/providers/meta/ads`
- `POST /internal/providers/meta/campaigns/:campaignId/duplicate`
- `POST /internal/providers/meta/adsets/:adSetId/duplicate`
- `POST /internal/providers/meta/ads/:adId/duplicate`
- `POST /internal/providers/meta/rules`
- `POST /internal/providers/meta/rules/:ruleId/status`
- `POST /internal/providers/meta/rules/:ruleId`
- `POST /internal/providers/meta/rules/:ruleId/enable`
- `POST /internal/providers/meta/rules/:ruleId/disable`
- `DELETE /internal/providers/meta/rules/:ruleId`

Catatan guardrail rule write:
- live create/update dengan status `ENABLED` dan impact non-trivial akan ditolak kecuali `confirmHighImpact=true`
- live enable rule high-impact akan ditolak kecuali `confirmHighImpact=true`
- live delete rule `ENABLED`, budget-impact, atau mass-operation akan ditolak kecuali `confirmHighImpact=true`
- rollout aman yang direkomendasikan: create/update sebagai `DISABLED` dulu, baru enable setelah review eksplisit
- `POST /internal/providers/meta/hierarchy/sync`
- `POST /internal/providers/meta/hierarchy/sync/enqueue`
- `GET /internal/providers/meta/snapshots/ad-account`
- `GET /internal/providers/meta/snapshots/campaigns`
- `GET /internal/providers/meta/snapshots/adsets`
- `GET /internal/providers/meta/snapshots/ads`
- `GET /internal/providers/meta/snapshots/rules`
- `GET /internal/providers/meta/snapshots/rules/history`
- `GET /internal/providers/meta/write-gate`
- `POST /internal/providers/meta/write-approvals/issue`

### Analysis
- `GET /internal/analysis/overview`
- `GET /internal/analysis/hierarchy`

### Asset generation
- `GET /internal/assets/generation-tasks`
- `GET /internal/assets/generation-tasks/:taskId`
- `GET /internal/assets/library`
- `GET /internal/assets/library/:assetId`
- `POST /internal/assets/images/:assetId/creative-draft`
- `POST /internal/assets/videos/:assetId/creative-draft`
- `POST /internal/assets/videos/:assetId/publish/meta`
- `POST /internal/assets/images/generations`
- `POST /internal/assets/generation-tasks/:taskId/poll`
- `POST /internal/assets/library/:assetId/refresh-metadata`
- `POST /internal/assets/kie/callback`
- `POST /internal/assets/kie/runway/callback`
- `POST /internal/assets/videos/generations`
- `POST /internal/assets/videos/generations/plan`

### Dashboard monitoring
- `GET /dashboard/login`
- `POST /dashboard/login`
- `POST /dashboard/logout`
- `GET /dashboard`
- `GET /dashboard/api/summary`
- `GET /dashboard/api/campaigns/hierarchy`
- `GET /dashboard/api/ads/:adId/detail`
- `GET /dashboard/api/creatives`
- `GET /dashboard/api/audiences?type=all|custom|lookalike&limit=50`
- `PATCH /dashboard/api/audiences/:audienceId` (name/description/retentionDays + reason + dryRun)
- `DELETE /dashboard/api/audiences/:audienceId` (reason + dryRun)
- `GET /dashboard/api/workflows`
- `GET /dashboard/api/settings`

### Write flow yang sudah terverifikasi (dry-run / guarded)
- `POST /internal/providers/meta/campaigns`
- `POST /internal/providers/meta/adsets`
- `POST /internal/providers/meta/ads`
- `POST /internal/providers/meta/ads/preflight/create`
- `POST /internal/providers/meta/ads/:adId/promotability`
- `POST /internal/providers/meta/ads/:adId/preflight/duplicate`
- `POST /internal/providers/meta/verification/run`
- `POST /internal/providers/meta/verification/enqueue`
- `GET /internal/providers/meta/verification/last`
- `POST /internal/providers/meta/campaigns/:campaignId/duplicate`
- `POST /internal/providers/meta/campaigns/:campaignId/duplicate-tree`
- `POST /internal/providers/meta/adsets/:adSetId/duplicate`
- `POST /internal/providers/meta/ads/:adId/duplicate`
- `POST /internal/providers/meta/campaigns/:campaignId/status`
- `POST /internal/providers/meta/campaigns/:campaignId/start`
- `POST /internal/providers/meta/campaigns/:campaignId/stop`
- `POST /internal/providers/meta/campaigns/:campaignId/budget`
- `POST /internal/providers/meta/campaigns/:campaignId/budget/increase`
- `POST /internal/providers/meta/campaigns/:campaignId/budget/decrease`
- `POST /internal/providers/meta/ads/:adId/status`
- `POST /internal/providers/meta/ads/:adId/start`
- `POST /internal/providers/meta/ads/:adId/stop`

## Guardrails yang sekarang sudah ada

- write flow bisa di-off lewat `META_WRITE_ENABLED=false`
- approval dapat diwajibkan sebelum live write
- approval token punya TTL
- budget delta dibatasi absolute + percentage threshold
- create campaign/ad set/ad default aman ke `PAUSED`
- create langsung `ACTIVE` diblok kecuali `confirmHighImpact=true`
- rule write high-impact diblok kecuali `confirmHighImpact=true`
- dry-run path tersedia untuk pengujian aman sebelum live write
- provider request log + audit trail sudah disiapkan

## Langkah berikutnya yang paling aman

1. bereskan blocker Meta app mode untuk jalur ad creative inline / asset-bound agar live create ad benar-benar bisa accepted di Meta
2. setelah app Meta live/public, rerun controlled live test untuk create ad asset-bound dan duplicate ad yang memakai creative existing agar path write utama benar-benar terverifikasi
3. setelah Meta app Live/Public, tambahkan create-ad live UI di dashboard agar seluruh write flow bisa dioperasikan dari web tanpa fallback manual API call
4. pertimbangkan bulk actions setelah UI/action dasar stabil
5. aktifkan dashboard di domain publik melalui reverse proxy/Cloudflare setelah cred dashboard dipastikan final
6. tambahkan enrich metadata video asset (durasi/dimensi/file size lokal bila perlu)
7. lanjutkan auth/provider hardening dan aktifkan cron sync produksi setelah flow operasional stabil
8. kalau mau dijadwalkan otomatis, isi `META_VERIFICATION_RUNNER_CRON` + `META_VERIFICATION_RUNNER_CONFIG_JSON` untuk regression runner terjadwal

## Catatan

Project ini jelas diarahkan untuk penggunaan internal/operasional, jadi endpoint yang ada saat ini masih berbasis **internal API** dan belum diformat sebagai public-facing product API.
