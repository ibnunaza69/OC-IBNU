# PRD — Meta Ads Dev

## 1. Ringkasan produk
Sistem internal untuk membantu operasi Meta Ads dari satu workspace terstruktur, mencakup:
- manajemen campaign/ad set/ad
- analisa performa iklan
- start/stop iklan
- naik/turun budget
- image generation via KIE.ai
- pembuatan dan review copy iklan
- rule management

Fase saat ini adalah **development-first internal tool**, bukan SaaS publik.

## 2. Masalah yang ingin diselesaikan
Operasi Meta Ads biasanya tersebar di beberapa tempat:
- Ads Manager manual
- spreadsheet analisa
- catatan copy terpisah
- asset visual di tool lain
- rules sering tidak terdokumentasi dengan baik

Akibatnya:
- keputusan lambat
- perubahan sulit diaudit
- eksperimen sulit direproduksi
- token/error auth membingungkan

## 3. Goals
1. Menyatukan alur kerja Meta Ads dalam satu sistem internal.
2. Membuat operasi read/write lebih aman, terukur, dan bisa diaudit.
3. Menyediakan fondasi untuk automation bertahap tanpa membuat stack terlalu berat.
4. Menjaga sistem tetap ringan dan cepat untuk server 2 vCPU / 7.5 GB RAM.

## 4. Non-goals fase awal
- multi-tenant SaaS publik
- BI/data warehouse kompleks
- full autonomous optimization tanpa approval
- creative studio lengkap
- social posting / CRM / omnichannel orchestration

## 5. Primary users
- owner/operator Meta Ads
- internal marketing ops
- content/copy operator internal

## 6. Functional requirements

### A. Foundation
- simpan config & secret reference
- audit seluruh write operation
- normalisasi error Meta/KIE
- jika token/API key gagal, minta kredensial baru ke owner

### B. Manage campaigns
- create campaign
- create ad set
- create ad
- sync snapshot hierarchy
- default aman: object baru tidak langsung live jika tidak diminta

### C. Ads analysis
- tarik insights berdasarkan object & range waktu
- hasilkan summary, top/bottom performers, dan rekomendasi tindakan
- support compare window sederhana

### D. Start / stop ads
- pause/unpause campaign, ad set, atau ad
- tampilkan blocker parent-child bila delivery belum benar-benar siap

### E. Budget control
- deteksi apakah budget berada di campaign atau ad set
- increase/decrease budget secara aman
- simpan alasan perubahan

### F. KIE image generator
- submit task image generation/editing
- track status via polling/callback
- simpan hasil dan metadata asset

### G. Copywriting lab
- generate copy variants berdasarkan brief
- review copy existing
- simpan versi dan rubric internal

### H. Rules management
- add/edit/delete rule
- enable/disable rule
- simpan draft dan snapshot rule
- tampilkan logic rule secara terbaca

### I. Dashboard monitoring
- sediakan dashboard web internal yang aman
- tampilkan status foundation/provider/sync/jobs/audit/assets/copy
- akses dashboard harus dilindungi auth web yang layak untuk deployment internet-facing
- sediakan campaign explorer dengan hierarchy campaign → ad set → ad dan kemampuan drilldown detail
- sediakan halaman creative library untuk melihat asset/creative hasil generate
- sediakan halaman workflow explorer dengan visualisasi graph (Vue Flow) agar alur kerja bisa dijelaskan secara visual
- sediakan halaman settings untuk credential state, token/account binding, akun ads Meta, akun KIE, dan metadata operasional relevan

## 7. Non-functional requirements
- response API internal cepat untuk operasi CRUD biasa
- retry aman untuk transient failure
- idempotent sebanyak mungkin pada write action
- structured logs
- typed contracts
- deployment simpel di single server
- konsumsi RAM efisien

## 8. Server-driven constraints
Karena server saat ini hanya 2 vCPU dan 7.5 GB RAM:
- arsitektur default adalah modular monolith
- queue dibangun di atas PostgreSQL dulu
- hindari service tambahan yang belum perlu
- analytics berat harus berbasis snapshot, bukan live pull berulang

## 9. UX / operational principles
- operator harus tahu **aksi apa** yang terjadi, **objek mana** yang berubah, dan **kenapa**
- error auth harus eksplisit, bukan silent fail
- semua perubahan penting harus punya audit trail
- sistem harus aman dipakai bertahap, bukan langsung full automation

## 10. Success metrics fase 1
- blueprint lengkap per modul tersedia
- PRD per modul tersedia
- stack keputusan final terdokumentasi
- implementasi awal foundation + analysis bisa berjalan stabil di server ini

## 11. Milestone yang direkomendasikan
1. foundation
2. analysis read-only
3. start/stop
4. budget control
5. rules management
6. campaign management
7. KIE image generator
8. copywriting lab
9. dashboard monitoring

## 12. Dependencies external
- Meta Marketing API (Graph API v25.0 - Feb 2026)
- Google Ads API (v24 - April 2026) - *Pending Integration*
- KIE.ai API
- PostgreSQL
- Caddy (untuk callback ingress bila dibutuhkan)
