# Blueprint — 00 Foundation

## Objective
Membangun pondasi teknis bersama untuk seluruh modul Meta Ads Dev.

## Responsibilities
- config & secrets loading
- auth state management
- database & migrations
- queue/jobs
- provider clients (Meta, KIE)
- error normalization
- audit logging
- shared DTO/schema

## Chosen implementation
- Fastify plugin layer untuk shared infra
- PostgreSQL untuk state + audit + jobs
- Drizzle ORM untuk schema dan migrations
- pg-boss untuk background jobs
- Zod untuk validation
- Pino untuk logs

## Why this fits the server
Karena server hanya 2 vCPU / 7.5 GB RAM, foundation harus:
- minim service tambahan
- hemat memory
- mudah dipantau
- cukup kuat untuk I/O heavy load

## Core modules
- `ConfigModule`
- `SettingsModule` (Whitelabel config: brand, ad account, pixel, access token, dll)
- `DatabaseModule`
- `QueueModule`
- `MetaClientModule`
- `KieClientModule`
- `AuditModule`
- `ErrorMapperModule`

## Auth behavior
### Meta
- simpan token aktif
- validasi saat first-use dan saat error auth muncul
- jika invalid/expired/permission issue: tandai state invalid dan request token baru ke owner

### KIE
- semua request wajib Bearer token
- jika `401`: mark invalid credential
- jika `402`: mark insufficient credits

## Shared tables
- `system_settings`
- `credentials_state`
- `operation_audits`
- `provider_request_logs`
- `jobs_state`
- `sync_locks`

## Guardrails
- no silent retries untuk 401/402/403/422
- no direct provider write tanpa audit
- no unbounded concurrency
- semua request provider harus ada request-id internal

## Implementation status — 2026-04-17
### Selesai
- [x] Fastify app + worker skeleton, env/config schema typed (ConfigModule)
- [x] SettingsModule whitelabel berbasis `system_settings` + endpoint update
- [x] DatabaseModule (Postgres 15 + Drizzle) + migrations snapshot
- [x] QueueModule via pg-boss + job `foundation.healthcheck`
- [x] MetaClientModule (credential state, request log, audit, error normalizer, payload sanitize)
- [x] KieClientModule (credential state, request log, audit, error normalizer)
- [x] AuditModule + ErrorMapperModule terpasang lintas write path
- [x] Tables: `system_settings`, `credentials_state`, `operation_audits`, `provider_request_logs`, `jobs_state`, `sync_locks`, `asset_generation_tasks`, `asset_library`, `copy_variants`, `copy_reviews`
- [x] Endpoints foundation (`status`, `audits`, `credentials`, `provider-request-logs`, `jobs`, `write-approvals`) terverifikasi

### Belum / pending
- tidak ada — modul foundation dianggap siap untuk modul di atasnya.
