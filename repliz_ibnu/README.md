# repliz_ibnu

Folder kerja utama untuk operasi Repliz milik Abi.

## Entry points
- Project blueprint: [`./blueprint.md`](./blueprint.md)
- Shared blueprint: [`./00_shared/blueprint.md`](./00_shared/blueprint.md)
- Scheduler ops: [`./03_scheduler_ops/blueprint.md`](./03_scheduler_ops/blueprint.md)
- Runtime scripts: [`./04_runtime_scripts/blueprint.md`](./04_runtime_scripts/blueprint.md)
- Workspace tools: [`../TOOLS.md`](../TOOLS.md)
- Workspace memory: [`../MEMORY.md`](../MEMORY.md)

## Struktur ringkas
- `slot-config.json` — konfigurasi slot aktif
- `daily-topics.json` — bank topik nested thread
- `scripts/repliz-slot-scheduler.mjs` — scheduler utama
- `scripts/repliz-daily-cron.sh` — wrapper cron
- `00_shared/` s.d. `05_monitoring_reporting/` — area analisa + blueprint

## Command cepat
```bash
node repliz_ibnu/scripts/repliz-slot-scheduler.mjs next
node repliz_ibnu/scripts/repliz-slot-scheduler.mjs slots --days 3
node repliz_ibnu/scripts/repliz-slot-scheduler.mjs preview-daily-nested
node repliz_ibnu/scripts/repliz-slot-scheduler.mjs ensure-horizon --days 30 --dry-run
node repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-day-text --date 2026-04-17
node repliz_ibnu/scripts/repliz-slot-scheduler.mjs report-successes --dry-run
node repliz_ibnu/scripts/repliz-slot-scheduler.mjs run-comment-worker-once --dry-run --limit 20
```

## Runtime workers
- `scripts/repliz-daily-cron.sh` — isi horizon + kirim auto-report Telegram + jalankan worker komentar sekali per trigger
- `scripts/repliz-auto-report.sh` — kirim laporan Telegram untuk item yang baru berubah menjadi `success`
- `scripts/repliz-comment-worker.sh` — cek komentar pending dan kirim autoreply sekali jalan
- runtime state disimpan di `runtime/state/`
- runtime log disimpan di `runtime/`

## Catatan penting
- Secrets tetap di `~/.openclaw/.env`
- Timezone kerja aktif: `WIB / Asia/Jakarta`
- Alias internal account utama saat ini: `azzamsalmamulia_threads`
- Scope project harus siap berkembang ke platform lain seperti Instagram
- Preferensi operasional terbaru: 7 slot aktif per hari dengan materi yang berbeda-beda
- Semua status/comment tetap harus bebas karakter China
- Report harian sekarang membedakan bagian `Slot reguler` dan `Catch-up / non-slot`
- Auto-report Telegram dikirim lewat `openclaw agent --deliver` agar tetap lewat jalur OpenClaw, bukan akses Telegram langsung
- Target Telegram auto-report bisa dioverride dengan env `REPLIZ_TELEGRAM_REPORT_TO` (default saat ini: `telegram:6186239554`)
- Worker komentar menyimpan state reply di `runtime/state/comment-worker-state.json` agar item yang sama tidak dibalas berulang
