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
```

## Catatan penting
- Secrets tetap di `~/.openclaw/.env`
- Timezone kerja aktif: `WIB / Asia/Jakarta`
- Pola queue aktif saat ini: `1 nested thread per hari` di `05:00 WIB`
- Semua status/comment tetap harus bebas karakter China
