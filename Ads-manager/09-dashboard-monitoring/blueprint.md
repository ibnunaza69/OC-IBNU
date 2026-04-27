# Blueprint — 09 Dashboard Monitoring

## Objective
Menyediakan dashboard monitoring web internal yang aman, ringan, dan langsung berjalan di web server project ini supaya operator bisa memantau kesehatan sistem tanpa harus membuka endpoint JSON satu per satu.

## Responsibilities
- render dashboard web untuk status foundation, provider, sync, jobs, audit, asset pipeline, dan copy pipeline
- sediakan auth web yang aman untuk akses publik via domain/server sendiri
- sediakan summary endpoint JSON yang dilindungi auth untuk integrasi internal ringan
- jaga agar dashboard berawal read-only, lalu naik bertahap ke operator console untuk aksi aman yang sudah punya guardrail backend
- sediakan campaign explorer dengan drilldown hierarchy campaign → ad set → ad
- sediakan detail ad yang bisa menampilkan preview creative dari Meta dan linked internal asset jika tersedia
- sediakan creative library untuk asset/creative hasil generate
- sediakan audience manager untuk list/edit/delete custom audience dan lookalike audience
- sediakan workflow explorer berbasis visual graph agar workflow bisa dijelaskan di dashboard
- sediakan settings area untuk credential/account/config metadata yang relevan bagi operator
- naikkan dashboard dari read-only summary menjadi operator console bertahap untuk aksi aman yang memang diminta owner
- sediakan theme/color switcher ringan di UI agar operator bisa ganti nuansa tampilan tanpa mengorbankan keterbacaan

## Design principles
- dashboard harus menumpang API server yang sama; tidak membuat frontend stack terpisah dulu
- auth default harus aman untuk deployment internet-facing
- session harus bertanda tangan, httpOnly, TTL jelas, dan bisa diputus dengan logout
- read-only lebih dulu; saat aksi write dibuka di dashboard, ia wajib tetap lewat dashboard-auth route yang membungkus endpoint internal guarded yang sudah ada
- observability cukup kaya untuk operator, tapi tidak membocorkan secret/token mentah
- navigasi dan sidebar harus mengikuti pola admin dashboard yang konsisten, minim teks yang tidak perlu, dan ramah mobile
- copy user-facing harus fokus ke operasi, bukan menjelaskan implementasi internal
- hierarchy, creative, workflow, dan settings harus modular agar mudah dipecah ke page/section terpisah
- panel detail ad harus memprioritaskan snapshot untuk identitas object, lalu boleh memperkaya preview lewat read-only fetch ke creative Meta agar operator bisa melihat visual creative tanpa keluar dari dashboard
- overview harus terasa seperti control room: metrik status campaign terkini, performa, kesehatan sistem, dan indikator bisnis utama seperti ROAS jika data tersedia
- campaigns page harus dipoles sebagai explorer operasional yang rapi, bukan dump hierarchy mentah
- settings/edit action dan creative action harus mengikuti guardrail write yang jelas, dengan aksi destruktif diberi konfirmasi yang pantas
- audience action (edit/delete) wajib reason-based, support dry-run, dan tetap tercatat di audit trail
- workflow explorer sebaiknya mengikuti UX dasar ala n8n: canvas lebih bersih, alur mudah dibaca, node tidak saling nyangkut, dan interaksi terasa seperti workflow builder sungguhan

## Service design
- `DashboardMonitoringService`
- `DashboardAuth`
- `DashboardRoutes`
- `DashboardCampaignExplorer`
- `DashboardCreativeLibrary`
- `DashboardAudienceManager`
- `DashboardWorkflowExplorer`
- `DashboardSettingsView`

## Guardrails
- jangan tampilkan access token atau secret di HTML/JSON dashboard
- login harus dibatasi rate limit dasar agar tidak gampang dibruteforce
- halaman dashboard harus kirim security headers dasar
- dashboard publik wajib dipasang di belakang HTTPS / proxy yang benar
- credential/token di halaman settings harus selalu disajikan sebagai metadata/state teredaksi, bukan secret mentah
- workflow visual harus berbasis definisi internal yang bisa diaudit/diperbarui, bukan diagram lepas tanpa sumber data
- kegagalan OAuth Meta, terutama saat authorization code ditukar menjadi access token, harus memperlihatkan detail error provider yang relevan ke operator secara aman, bukan hanya 502 generik

## Whitelabeling
- Dashboard wajib mendukung konfigurasi per-brand: membaca/mengubah `system_settings` untuk nama brand, ad account, pixel id, dan token melalui endpoint internal.

## Progress checklist — 2026-04-06
### Sudah selesai
- [x] scope dashboard expansion disepakati: campaign explorer, creative library, workflow explorer, settings & credentials
- [x] blueprint + PRD root project dan modul dashboard diperbarui untuk mengakomodasi scope baru
- [x] baseline code sebelum fase ini sudah di-commit dan di-push ke `main` (`2a6030a` — `feat: ship dashboard frontend foundation`)
- [x] timeout agent OpenClaw lokal diarahkan ke `1800s` agar pengerjaan dashboard tidak cepat terpotong

### Sudah selesai
- [x] navigasi sidebar final dengan icon dan pola multi-page yang konsisten
- [x] halaman campaign explorer dengan hierarchy campaign → ad set → ad, drilldown detail, metrik inti (budget/spend/CPC/CPR/clicks/CTR/impressions/reach/result bila tersedia), dan pemisahan `Refresh snapshot` vs `Sync Meta`
- [x] halaman creative library untuk asset hasil generate
- [x] halaman workflow explorer berbasis Vue Flow
- [x] halaman settings untuk credential/account/config metadata yang teredaksi
- [x] build final, smoke test lokal, dan redeploy production setelah seluruh page baru selesai
- [x] verifikasi protected route/API publik di `mragung.ramadigital.id` sesudah redeploy

### Batch revisi berikutnya
- [x] settings page mendukung edit metadata/config yang aman dari dashboard
- [x] creatives page mendukung generate langsung dari dashboard dan hapus asset yang dipilih
- [x] campaigns page dirombak lagi supaya UI/UX lebih rapi, lebih nyaman dibaca, dan lebih terasa sebagai operator explorer
- [x] detail ad di campaigns page menampilkan preview creative dari Meta dan linked internal asset bila tersedia
- [x] workflow explorer dirombak ulang mengikuti UX/flow ala n8n sebagai referensi utama
- [x] overview page ditingkatkan agar fokus ke status campaign terkini, kesehatan sistem, performa iklan, dan ROAS/KPI bisnis bila sumber data tersedia
- [x] theme/color switcher ditambahkan di kanan atas dashboard
- [x] callback OAuth Meta sekarang menampilkan error asli dari Meta untuk token exchange yang gagal, termasuk HTTP status, `type`, `code`, `subcode`, dan `fbtrace_id` bila ada

### Catatan lanjutan non-blocking
- [ ] optimasi code-splitting frontend dashboard agar ukuran bundle utama mengecil
- [x] tambah smoke test browser/headless untuk interaksi SPA setelah auth (Playwright: login + protected routes + basic SPA interactions)
- [x] campaigns page sekarang punya safe write ops panel untuk duplicate / duplicate-tree / delete / promotability inspect / preflight duplicate / duplicate ad live via dashboard-auth routes
- [x] audience feature awal tersedia via dashboard API: list, edit, delete custom/lookalike audience (retention edit khusus custom)

## Implementation status — 2026-04-17
### Selesai (core dashboard)
- [x] `DashboardMonitoringService` + `DashboardAuth` + `DashboardRoutes`
- [x] `DashboardCampaignExplorer` — hierarchy drill, metrik inti, refresh vs sync Meta terpisah
- [x] `DashboardCreativeLibrary` — list/filter/preview + generate image/video + delete
- [x] `DashboardAudienceManager` — list/edit/delete custom & lookalike audience (API awal)
- [x] `DashboardWorkflowExplorer` — Vue Flow canvas gaya n8n + inspector
- [x] `DashboardSettingsView` — edit runtime config tanpa ekspos secret mentah
- [x] Login + session cookie (httpOnly, signed, TTL) + rate limit login
- [x] Endpoints `/dashboard/api/*` lengkap (summary / hierarchy / ads/:id/detail / creatives / workflows / settings)
- [x] Theme/color switcher di kanan atas
- [x] OAuth Meta error detail (HTTP status, type, code, subcode, fbtrace_id)
- [x] Safe write ops panel untuk campaigns
- [x] Artefak deployment + rollout ke `mragung.ramadigital.id` (systemd + Caddy + Cloudflare)
- [x] Smoke test Playwright untuk login + semua protected route

### Belum / pending
- [ ] optimasi code-splitting bundle frontend (non-blocking, Vite warning)
- [ ] `DASHBOARD_COOKIE_SECURE=true` + rotate credential final di production
- [ ] auth hardening flow provider (item roadmap lanjutan)
- [ ] create-ad live UI di dashboard — ditahan sampai Meta app Live/Public
