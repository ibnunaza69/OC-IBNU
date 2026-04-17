# Blueprint: repliz_ibnu

## Shared context links
- Tools: [`../TOOLS.md`](../TOOLS.md)
- Memory: [`../MEMORY.md`](../MEMORY.md)

## Objective
Menjadikan integrasi Repliz milik Abi sebagai workspace yang rapi, bisa diaudit, dan mudah dilanjutkan untuk operasi Threads harian.

## Current durable status
- Integrasi Repliz sudah aktif dan kredensial disimpan di global env `~/.openclaw/.env`, bukan di repo.
- Account Threads yang pernah terverifikasi aktif: `Agent022` / `azzamsalmamulia`.
- Scheduler sekarang bekerja dengan timezone `WIB / Asia/Jakarta`.
- Queue sudah pernah dinormalisasi agar pending item jatuh di `05:00 WIB`.
- Pola aktif saat ini efektifnya `1 nested thread per hari` pada slot `05:00 WIB`.

## Project principles
- Rahasia tetap di luar git dan luar blueprint.
- Semua path penting harus jelas dan lokal ke folder ini.
- Analisa dipisah per area supaya future session cepat masuk konteks.
- Link ke `TOOLS.md` dan `MEMORY.md` selalu tersedia dari tiap blueprint.
- Hindari struktur datar yang bikin script, config, dan analisa campur aduk.

## Folder map
- `00_shared/blueprint.md` — identitas proyek, path penting, aturan umum
- `01_accounts_access/blueprint.md` — akun Repliz, auth, env, akses
- `02_content_strategy/blueprint.md` — niche, topic bank, nested thread rules
- `03_scheduler_ops/blueprint.md` — slot logic, horizon, timezone, queue policy
- `04_runtime_scripts/blueprint.md` — script kerja dan cron wrapper
- `05_monitoring_reporting/blueprint.md` — audit queue, laporan, checklist operasional
- `README.md` — quick usage human-readable
- `slot-config.json` — config scheduler aktif
- `daily-topics.json` — bank topik harian
- `scripts/` — script runtime project

## Notes for future work
- Kalau nanti Abi mau multi-account Repliz, revisi area `01_accounts_access` dan `03_scheduler_ops` dulu.
- Kalau nanti mau variasi jam selain `05:00 WIB`, cek apakah rule `1 post per day` tetap dipertahankan atau tidak.
- Untuk monitoring manual, folder ini harus jadi entry point utama, bukan lagi folder `repliz` lama.
