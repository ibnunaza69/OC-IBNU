# 00_shared / Blueprint

## Shared context links
- [`../blueprint.md`](../blueprint.md)
- [`../../TOOLS.md`](../../TOOLS.md)
- [`../../MEMORY.md`](../../MEMORY.md)

## Purpose
Area ini jadi titik masuk cepat untuk memahami identitas proyek `repliz_ibnu`, path penting, dan batasan operasional dasar.

## Project identity
- Project: `repliz_ibnu`
- Owner context: Abi
- Domain: automasi Threads via Repliz
- Fokus aktif: scheduling, nested threads, monitoring queue

## Important paths
- Root project: `/root/.openclaw/workspace/repliz_ibnu`
- Scheduler config: `/root/.openclaw/workspace/repliz_ibnu/slot-config.json`
- Topic bank: `/root/.openclaw/workspace/repliz_ibnu/daily-topics.json`
- Main scheduler script: `/root/.openclaw/workspace/repliz_ibnu/scripts/repliz-slot-scheduler.mjs`
- Cron wrapper: `/root/.openclaw/workspace/repliz_ibnu/scripts/repliz-daily-cron.sh`
- Repliz skill reference: `/root/.openclaw/workspace/skills/repliz/SKILL.md`

## Rules that should stay true
- Jangan simpan access key / secret key di folder ini.
- Semua update/status/comment tetap harus disanitasi agar tidak mengandung karakter China.
- Gunakan folder ini sebagai home base Repliz, bukan menyebar file baru ke root workspace tanpa alasan.
- Kalau ada perubahan besar di struktur atau flow, update blueprint area yang relevan lebih dulu.
