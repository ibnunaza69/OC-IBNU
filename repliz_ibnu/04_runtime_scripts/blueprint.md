# 04_runtime_scripts / Blueprint

## Shared context links
- [`../blueprint.md`](../blueprint.md)
- [`../00_shared/blueprint.md`](../00_shared/blueprint.md)
- [`../../TOOLS.md`](../../TOOLS.md)
- [`../../MEMORY.md`](../../MEMORY.md)

## Scope
Script yang benar-benar menjalankan operasi Repliz dari workspace ini.

## Runtime files
- `../scripts/repliz-slot-scheduler.mjs` — scheduler utama
- `../scripts/repliz-daily-cron.sh` — wrapper cron harian

## Supported commands
- `next`
- `slots`
- `topics`
- `schedule`
- `preview-daily-nested`
- `schedule-daily-nested`
- `ensure-horizon`

## Current path policy
- Semua script runtime Repliz sekarang harus hidup di dalam `repliz_ibnu/scripts/`
- Jangan taruh script Repliz baru di root `scripts/` workspace kecuali memang reusable lintas project

## Analysis
- Sebelumnya script Repliz berada di root `scripts/`, yang bikin konteks project agak tercecer.
- Memindahkannya ke dalam folder project membuat ownership lebih jelas dan blueprint lebih masuk akal.
- Wrapper cron tetap sederhana: panggil scheduler `ensure-horizon --days 30` dan log ke `cron.log` di folder project.

## Follow-up checks after any edit
- Pastikan `slot-config.json` masih menunjuk ke `repliz_ibnu/daily-topics.json`
- Pastikan cron wrapper masih menunjuk ke path script baru
- Jalankan minimal satu command read-only seperti `next` atau `slots --days 1`
