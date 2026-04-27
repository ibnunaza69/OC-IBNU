# STRUCTURE.md — Peta Repository Meta Ads Dev

Dokumen ini menjelaskan isi repository secara padat: apa isi tiap folder, siapa yang memakainya, dan mana yang sumber vs generated.

## Gambaran besar

Project ini adalah **modular monolith** berbasis Node.js + TypeScript + Fastify + PostgreSQL, dengan tiga bagian executable:

1. **API server** — [src/server.ts](src/server.ts)
2. **Worker (queue processor)** — [src/worker.ts](src/worker.ts)
3. **Dashboard web (SPA Nuxt 4, di-generate sebagai static)** — [dashboard-nuxt/](dashboard-nuxt/), disajikan API server dari `dashboard-dist/` (build artifact, gitignored)

Semua tulisan operasional (PRD, blueprint, status) ada di root dan di folder `NN-<modul>/` per domain.

## Layout root

```text
ads-manager/
├── 00-foundation/              PRD + blueprint foundation (config, auth, db, queue)
├── 01-manage-campaigns/        PRD + blueprint flow create/update/duplicate campaign
├── 02-ads-analysis/            PRD + blueprint analysis endpoint + snapshot
├── 03-start-stop-ads/          PRD + blueprint start/stop ad + campaign
├── 04-budget-control/          PRD + blueprint budget change + guardrail
├── 05-kie-image-generator/     PRD + blueprint image generation via KIE.ai
├── 06-copywriting-lab/         PRD + blueprint copy generator/reviewer
├── 07-rules-management/        PRD + blueprint Meta rules CRUD + safety
├── 08-video-generator/         PRD + blueprint video generation (KIE Runway)
├── 09-dashboard-monitoring/    PRD + blueprint dashboard web + auth
├── src/                        Source code backend (API + worker + modul)
├── dashboard-nuxt/             Source code dashboard (Nuxt 4 SPA, static generate)
├── dashboard-frontend/         Alternatif Vite+Vue standalone (legacy/parallel)
├── drizzle/                    Migration SQL + snapshot Drizzle
├── scripts/                    Build + utilitas ops
├── deploy/                     Artefak deployment production (Caddy + systemd)
├── tests/                      Smoke test Playwright dashboard
├── .trae/                      Dokumen/plan audit Trae (work notes)
├── .env.example                Template environment variable
├── .gitignore
├── README.md                   Onboarding + status + endpoint inventory
├── MEMORY.md                   Memory proyek (keputusan arsitektur, progres)
├── PRD.md                      PRD umum proyek
├── blueprint.md                Blueprint arsitektur umum proyek
├── TECHSTACK.md                Rangkuman tech stack
├── STRUCTURE.md                Dokumen ini
├── IMPLEMENTATION-STATUS.md    Status implementasi rinci per modul
├── package.json                npm manifest (scripts + dependency)
├── package-lock.json
├── tsconfig.json               TS config root
├── tsconfig.build.json         TS config untuk output `dist/`
├── drizzle.config.ts           Config Drizzle Kit (schema + migrations dir)
├── playwright.config.ts        Config Playwright smoke test
└── vitest.config.ts            Config Vitest unit test
```

## `src/` — Backend Node.js

```text
src/
├── server.ts                   Entrypoint API process (Fastify)
├── worker.ts                   Entrypoint worker process (pg-boss)
├── app.ts                      Fastify app factory + route registration
├── module-inventory.ts         Registri metadata modul untuk dashboard
├── config/
│   ├── env.ts                  Schema + parser .env (Zod)
│   └── settings.ts             configService dinamis (baca system_settings DB)
├── lib/
│   ├── logger.ts               Pino logger shared
│   ├── http.ts                 HTTP wrapper (timeout, retry, sanitize)
│   └── errors.ts               Shared error class + normalizer
└── modules/                    Domain modules (boleh saling pakai lintas modul via service)
    ├── foundation/             Infra dasar dipakai semua modul
    │   ├── db/                 Drizzle client + schema semua tabel
    │   ├── queue/              pg-boss setup
    │   ├── audit/              Audit trail repository
    │   ├── credentials/        State kredensial provider
    │   ├── provider-logs/      Log request/response provider
    │   ├── jobs/               Job registry
    │   ├── approvals/          Approval token write flow
    │   ├── settings/           CRUD system_settings (whitelabel)
    │   └── internal/           Endpoint `/internal/foundation/*`
    ├── health/                 Endpoint health check
    ├── providers/              Boundary ke external API
    │   ├── meta/               Meta Graph client + types
    │   ├── kie/                KIE.ai client + types
    │   ├── google/             Google Ads client (skeleton)
    │   ├── shared/             Sanitize + provider error normalization
    │   └── internal/           Endpoint `/internal/providers/*`
    ├── meta-sync/              Read-only sync hierarchy Meta → DB lokal
    ├── meta-write/             Write gate, approval flow, guarded write
    ├── manage-campaigns/       Create/update/duplicate campaign/ad set/ad,
    │                           preflight, promotability, duplicate-tree,
    │                           verification runner
    ├── start-stop-ads/         Start/stop ad & campaign (dry-run + live-safe)
    ├── budget-control/         Budget change dengan guardrail delta
    ├── rules-management/       Rule draft/validate/CRUD + safety gate
    ├── analysis/               Analysis endpoint berbasis snapshot lokal
    ├── asset-generation/       Image & video generation (KIE image + Runway video),
    │                           asset registry, creative draft builder,
    │                           publish video ke Meta
    ├── copywriting-lab/        Generate/revise/review copy variants
    ├── dashboard-monitoring/   Backend untuk SPA dashboard: auth, session,
    │                           summary, hierarchy, creatives, workflows, settings
    └── agent-api/              Route untuk integrasi eksternal (agent-facing)
```

Konvensi file dalam tiap modul:
- `routes.ts` — route Fastify untuk modul tersebut
- `*.service.ts` — logic domain (boleh panggil provider client / repository)
- `*.repository.ts` — query DB via Drizzle (boundary DB)
- `*.types.ts` — tipe lokal modul
- `*.queue.ts` — job handler pg-boss
- `*.spec.ts` — unit test Vitest

## `dashboard-nuxt/` — Dashboard SPA (Nuxt 4)

Frontend aktif yang di-build menjadi `dashboard-dist/` dan disajikan oleh API server di path `/dashboard`.

```text
dashboard-nuxt/
├── app.vue                     Root Vue component
├── app.config.ts               Nuxt app config
├── nuxt.config.ts              ssr=false, baseURL=/dashboard/, preset static
├── assets/css/                 Tailwind + css tokens
├── components/                 Komponen reusable (AppMetricCard, WorkflowCanvasNode, …)
├── composables/                useDashboardApi, useDashboardSession, useDashboardTheme
├── layouts/dashboard.vue       Layout utama dashboard
├── middleware/auth.global.ts   Guard auth global
├── pages/                      Route SPA (overview, campaigns, creatives, audiences,
│                               workflows, settings, login, index)
├── types/dashboard.ts          Tipe shared dengan API
├── utils/                      Helper format + route builder
├── .nuxt/       (generated)    Artefak dev Nuxt — gitignored
└── .output/     (generated)    Output `nuxt generate` — gitignored
```

Build flow: `npm run build:dashboard` → [scripts/build-dashboard.mjs](scripts/build-dashboard.mjs) → `nuxt generate` di `dashboard-nuxt/` → copy `.output/public` ke `dashboard-dist/` di root.

## `dashboard-frontend/` — Alternatif Vite (parallel)

Setup Vite+Vue standalone dengan alias `@nuxt/ui/vite`. Dipakai sebagai workspace eksperimen; build output-nya juga ke `../dashboard-dist/`. **Tidak dipakai oleh flow build aktif** (`npm run build:dashboard` memakai `dashboard-nuxt/`). Pertahankan selama tim masih pakai dua jalur; kalau sudah putus pakai, folder ini kandidat dihapus.

File yang auto-generated (oleh unplugin-auto-import / unplugin-vue-components) dan harusnya gitignored kalau masih aktif:
- [dashboard-frontend/auto-imports.d.ts](dashboard-frontend/auto-imports.d.ts)
- [dashboard-frontend/components.d.ts](dashboard-frontend/components.d.ts)

## `drizzle/` — Migration DB

```text
drizzle/
├── 0000_fancy_skullbuster.sql … 0008_kind_nocturne.sql   Migration sequential
└── meta/                                                  Snapshot + journal Drizzle
```

Dikelola via `npm run db:generate` (bikin migration dari [src/modules/foundation/db/schema.ts](src/modules/foundation/db/schema.ts)) dan `npm run db:push`.

## `scripts/` — Utility Node scripts

```text
scripts/
├── build-dashboard.mjs                   Wrapper nuxt generate + copy ke dashboard-dist
└── generate-dashboard-password-hash.mjs  Generator scrypt hash untuk DASHBOARD_PASSWORD_HASH
```

## `deploy/` — Artefak deployment production

```text
deploy/
├── DEPLOYMENT-DASHBOARD.md                 Panduan rollout
├── caddy/meta-ads-dashboard.Caddyfile      Config Caddy reverse proxy
└── systemd/
    ├── meta-ads-api.service                Unit systemd API
    └── meta-ads-worker.service             Unit systemd worker
```

## `tests/` — Smoke test end-to-end

```text
tests/
└── dashboard.smoke.spec.ts   Playwright: login + protected routes dashboard
```

Unit test per-modul letaknya **berdampingan** dengan kode (`*.spec.ts` di dalam `src/modules/...`), bukan di `tests/`.

## `NN-<modul>/` — Dokumentasi per modul

Tiap folder `00-foundation`, `01-manage-campaigns`, … , `09-dashboard-monitoring` berisi:

```text
NN-<modul>/
├── PRD.md          Product requirements
├── blueprint.md    Blueprint teknis + design decisions
└── MEMORY.md       Pointer text berisi `../MEMORY.md` → memori proyek (root)
```

`MEMORY.md` di subfolder bukan file independen — isinya satu baris path relatif yang menunjuk ke [MEMORY.md](MEMORY.md) root (karena Windows tanpa admin tidak dukung symlink nyata).

## `.trae/` — Work notes Trae

```text
.trae/
├── documents/audit-improvement-plan.md   Rencana perbaikan hasil audit
└── specs/                                Spec draft per workstream
    ├── audit-modules-dashboard-nuxt4/
    ├── implement-missing-modules/
    └── write-comprehensive-tests/
```

Bukan bagian runtime — murni catatan perencanaan.

## Folder generated / gitignored (jangan di-commit)

| Path | Asal | Cara regenerate |
|------|------|-----------------|
| `node_modules/` | `npm install` | `npm install` |
| `dist/` | `tsc -p tsconfig.build.json` | `npm run build` |
| `dashboard-dist/` | Copy dari `dashboard-nuxt/.output/public` | `npm run build:dashboard` |
| `dashboard-nuxt/.nuxt/` | Nuxt dev / generate | `nuxt dev` / `nuxt generate` |
| `dashboard-nuxt/.output/` | `nuxt generate` | `nuxt generate` |
| `coverage/` | Vitest | `vitest --coverage` |
| `playwright-report/` | Playwright | `npm run test:smoke:dashboard` |
| `test-results/` | Playwright | `npm run test:smoke:dashboard` |
| `.env`, `.env.local` | Manual (rahasia) | Copy dari `.env.example` |

## Alur build & run singkat

```text
npm install
cp .env.example .env          # isi kredensial
npm run db:push               # migrate schema
npm run build                 # build API + dashboard
npm run start                 # API server (serve /dashboard dari dashboard-dist)
npm run start:worker          # worker queue
```

Development mode:

```text
npm run dev                   # tsx watch src/server.ts
npm run dev:worker            # tsx watch src/worker.ts
# untuk dashboard dev:
cd dashboard-nuxt && npx nuxt dev
```

## Prinsip penamaan & organisasi

- **Nomor prefix** (`00-`, `01-`, …) di folder doc menandai urutan baca, bukan dependency runtime.
- **`foundation/`** di `src/modules/` adalah satu-satunya modul yang boleh dipakai semua modul lain.
- **`providers/`** adalah satu-satunya yang boleh melakukan HTTP call ke external API. Modul lain panggil provider via service layer, tidak langsung HTTP.
- **`meta-write/`** gate wajib dilewati untuk semua write ke Meta (approval + dry-run + audit).
- Test file pakai suffix `.spec.ts` dan letaknya berdampingan dengan file yang diuji.
