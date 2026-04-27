# TECHSTACK — Meta Ads Dev

## Dasar pemilihan stack
Target server saat ini:
- CPU: 2 vCPU
- RAM: 7.5 GiB
- Disk: 100 GB
- Node.js: v22.22.2
- Swap: tidak ada
- OS: Linux x86_64

Implikasi:
- jangan pakai arsitektur terlalu pecah/microservices
- jangan pakai Kubernetes
- prioritaskan **single modular monolith**
- kurangi jumlah moving parts
- pilih stack yang ringan, typed, cepat di-develop, dan stabil di server kecil-menengah

## Stack yang dipilih

### Runtime & language
- **Node.js 22 LTS-ish runtime yang sudah ada di server**
- **TypeScript 5**

Alasan:
- sudah cocok dengan environment server
- cepat untuk integrasi HTTP-heavy seperti Meta & KIE
- satu bahasa untuk API, worker, validation, dan tooling

### Backend framework
- **Fastify**

Alasan:
- lebih ringan dan cepat daripada framework Node yang lebih berat
- cocok untuk 2 vCPU
- plugin ecosystem cukup matang
- bagus untuk JSON API, webhook, healthcheck, dan callback receiver

### Validation & DTO
- **Zod**

Alasan:
- schema validation sederhana dan kuat
- mudah dipakai di boundary request/response
- bagus untuk normalisasi payload Meta/KIE

### Database
- **PostgreSQL 16**

Alasan:
- durable dan battle-tested
- cocok untuk audit trail, snapshots, tasks, rules drafts, copy variants
- query analytics internal masih memadai untuk skala awal

### Query layer / ORM
- **Drizzle ORM**

Alasan:
- lebih ringan daripada ORM yang lebih berat
- typed SQL bagus untuk server kecil
- migration story cukup rapi

### Background jobs / queue
- **pg-boss** (queue berbasis PostgreSQL)

Alasan:
- menghindari tambahan Redis di fase awal
- lebih hemat resource dan operasional pada server 2 vCPU / 7.5 GB RAM
- cukup untuk retry job, polling KIE, sync Meta, dan refresh snapshots

### HTTP client
- **native fetch / undici**

Alasan:
- Node 22 sudah bagus
- dependency lebih sedikit
- performa baik untuk external API calls
- Target API: Meta Graph API v25.0 (Feb 2026) & Google Ads API v24 (April 2026)

### Logging
- **Pino**

Alasan:
- structured logging cepat
- overhead rendah
- cocok untuk audit dan debugging API external

### Config & secrets
- **dotenv untuk local/dev**
- **systemd EnvironmentFile** atau file secret terproteksi untuk server

Alasan:
- sederhana
- sesuai deployment ringan
- tidak perlu secret manager eksternal dulu

### Testing
- **Vitest** untuk unit/integration test
- **Supertest** atau Fastify inject untuk HTTP tests

### Process management
- **systemd**

Alasan:
- paling ringan dan native untuk server Linux ini
- restart policy, logs, boot startup, dan isolation cukup
- lebih cocok daripada PM2 untuk deployment server tunggal yang rapi

### Reverse proxy / TLS / callback ingress
- **Caddy**

Alasan:
- konfigurasi lebih simpel
- HTTPS otomatis
- cocok untuk endpoint webhook/callback KIE
- cocok untuk mengekspos dashboard monitoring di belakang domain publik / Cloudflare

## Arsitektur aplikasi

### Bentuk arsitektur
**Modular monolith** dengan 1 codebase dan 2 proses utama:
1. **API process**
2. **Worker process**

Keduanya share database yang sama.

### Modul internal
- foundation
- manage-campaigns
- ads-analysis
- start-stop-ads
- budget-control
- kie-image-generator
- copywriting-lab
- rules-management
- video-generator
- dashboard-monitoring

### Kenapa bukan microservices?
Karena untuk server ini microservices akan:
- menambah overhead RAM/CPU
- menambah kompleksitas deploy dan observability
- belum perlu untuk throughput awal

## Deployment layout yang direkomendasikan

### Services
- `meta-ads-api.service`
- `meta-ads-worker.service`
- `postgresql.service`
- `caddy.service`

### Direktori
- app code: `/opt/meta-ads-dev/app`
- uploads/assets cache: `/opt/meta-ads-dev/data/assets`
- logs: via journald + optional file export
- backups: `/opt/meta-ads-dev/backups`

## Database domain tables awal
- `meta_connections`
- `meta_request_logs`
- `meta_campaign_snapshots`
- `meta_adset_snapshots`
- `meta_ad_snapshots`
- `meta_insight_snapshots`
- `meta_rule_snapshots`
- `kie_tasks`
- `content_assets`
- `copy_variants`
- `operation_audits`
- `sync_cursors`

## Performance strategy
- read-heavy analytics pakai snapshot table, bukan nembak live API terus
- queue polling KIE via background jobs
- operasi Meta write serialized per object saat perlu
- gunakan pagination dan field selection sempit
- cache ringan di Postgres-backed snapshot layer

## Best practice khusus untuk server ini
1. **Hindari Redis dulu** kecuali memang throughput job sudah tinggi.
2. **Hindari Docker/K8s sebagai default** bila tim ingin overhead serendah mungkin.
3. **Pisahkan API dan Worker** supaya request web tidak kehambat job sinkronisasi.
4. **Batasi concurrency** pada sync Meta dan polling KIE.
5. **Gunakan callback KIE** di production untuk mengurangi polling.
6. **Semua write ke Meta wajib audited**.

## Kapasitas target awal
Stack ini ditujukan untuk:
- 1 ad account atau beberapa ad account skala kecil-menengah
- operasi internal tim kecil
- beban dominan I/O external API, bukan CPU-bound local processing

## Evolusi nanti jika skala naik
Urutan scale-up yang masuk akal:
1. tambah Redis jika queue makin padat
2. pindahkan asset storage ke S3-compatible bucket
3. pecah worker khusus analytics jika beban naik
4. tambah read replica / warehouse bila analytics makin berat
