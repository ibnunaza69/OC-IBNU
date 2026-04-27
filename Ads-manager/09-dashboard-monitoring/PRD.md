# PRD — 09 Dashboard Monitoring

## Problem
Operator saat ini harus mengecek banyak endpoint internal secara manual untuk tahu apakah DB sehat, provider valid, sync segar, job berjalan, asset pipeline hidup, dan audit terbaru aman.

## Goal
Membuat dashboard monitoring web yang aman dan cukup ringan untuk dipasang di server ini, sehingga owner tinggal mengarahkan domain lewat Cloudflare dan login untuk memantau sistem.

## User stories
- Sebagai owner, saya ingin membuka satu halaman web untuk melihat status sistem tanpa perlu curl endpoint satu per satu.
- Sebagai operator, saya ingin dashboard menampilkan status provider, freshness sync, job terakhir, audit terakhir, dan pipeline asset/copy terbaru.
- Sebagai admin, saya ingin dashboard tetap aman meski dibuka lewat internet, dengan auth yang tidak asal terbuka.
- Sebagai operator, saya ingin melihat hierarchy campaign sampai level ad dan membuka detailnya dengan drilldown yang nyaman.
- Sebagai operator, saya ingin saat memilih ad saya bisa langsung melihat preview creative dari Meta dan asset internal yang terkait tanpa pindah halaman.
- Sebagai operator kreatif, saya ingin melihat daftar creative/asset hasil generate dari satu halaman library.
- Sebagai owner, saya ingin melihat workflow operasional dalam bentuk graph supaya alurnya mudah dijelaskan saat dibutuhkan.
- Sebagai admin, saya ingin melihat settings/credential state/account binding tanpa membocorkan secret mentah.

## Requirements
- halaman login web
- session auth aman dengan TTL
- rate limit dasar pada login gagal
- halaman dashboard read-only pada baseline, lalu bertahap membuka aksi operator yang aman lewat dashboard-auth route
- summary status foundation/provider/analysis/jobs/audits/assets/copy
- endpoint JSON dashboard summary yang juga dilindungi auth
- navigasi/sidebar dashboard yang konsisten dan minim teks yang tidak perlu
- campaign explorer dengan list hierarchy, drilldown detail, metrik inti operasional (budget/spend/CPC/CPR/clicks/CTR/impressions/reach/result bila tersedia), serta pemisahan jelas antara refresh snapshot lokal dan sync ulang ke Meta
- detail ad dengan preview creative read-only dari Meta dan blok linked internal asset bila relasinya tersedia
- creative library page untuk asset/creative hasil generate
- workflow explorer page dengan visualisasi Vue Flow
- settings page untuk credential state, account binding, dan metadata konfigurasi terkait
- campaigns page menyediakan operator console aman untuk duplicate / duplicate-tree / delete / promotability inspect / preflight duplicate / duplicate ad live

## Acceptance criteria
- dashboard bisa diakses lewat browser pada server yang sama
- akses tanpa login ditolak/redirect ke halaman login
- login valid membuat session cookie yang aman
- dashboard menampilkan ringkasan status sistem yang relevan untuk operasi harian
- tidak ada token/secret mentah yang tampil di dashboard
- sidebar/navigasi terasa rapi, konsisten, dan tidak dipenuhi copy internal yang tidak perlu
- operator bisa membuka hierarchy campaign hingga level ad dengan drilldown yang jelas
- saat memilih ad, operator bisa melihat preview creative (image/video/thumbnail sesuai data Meta) dan tahu apakah ad itu terhubung ke asset library internal
- operator bisa melihat creative library yang berasal dari asset registry internal
- owner/operator bisa membuka workflow explorer dan melihat graph workflow yang terbaca
- admin bisa membuka settings page untuk credential/account metadata tanpa melihat secret mentah
- operator bisa menjalankan aksi duplicate / cleanup / preflight dasar langsung dari campaigns page tanpa harus memanggil endpoint internal manual

## Whitelabeling
- Settings page wajib menjadi tempat utama untuk mengisi identitas brand, ad account, pixel id, dan token yang disimpan di `system_settings`.

## Implementation status — 2026-04-17
### Acceptance criteria terpenuhi
- [x] dashboard bisa diakses lewat browser (server lokal + production `mragung.ramadigital.id`)
- [x] akses tanpa login ditolak/redirect ke halaman login
- [x] login valid membuat session cookie signed + httpOnly + TTL
- [x] ringkasan status sistem tampil (`/dashboard/api/summary`)
- [x] tidak ada token/secret mentah di dashboard
- [x] sidebar/navigasi rapi & konsisten
- [x] hierarchy campaign → ad set → ad dengan drilldown detail
- [x] detail ad menampilkan preview creative Meta + linked internal asset
- [x] creative library dari `asset_library`
- [x] workflow explorer Vue Flow
- [x] settings page untuk credential/account metadata teredaksi
- [x] operator console campaigns (duplicate / duplicate-tree / delete / promotability / preflight duplicate / duplicate ad live)

### Belum / pending
- [ ] code-splitting optimization (non-blocking)
- [ ] final hardening production: `DASHBOARD_COOKIE_SECURE=true` + rotate credential final
- [ ] create-ad live UI (tertahan Meta app Live/Public)

Modul ini **SELESAI** untuk scope core dashboard; sisa item bersifat hardening atau depend ke blocker modul 01.
