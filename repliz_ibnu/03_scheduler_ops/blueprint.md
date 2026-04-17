# 03_scheduler_ops / Blueprint

## Shared context links
- [`../blueprint.md`](../blueprint.md)
- [`../00_shared/blueprint.md`](../00_shared/blueprint.md)
- [`../../TOOLS.md`](../../TOOLS.md)
- [`../../MEMORY.md`](../../MEMORY.md)

## Scope
Logika slot, timezone, horizon scheduling, dan kebijakan queue hidup.

## Current scheduler config
- Timezone kerja: `WIB / Asia/Jakarta`
- Offset: `420` menit
- Slot harian teoritis: `05:00`, `08:00`, `11:00`, `14:00`, `17:00`, `20:00`, `23:00`
- Preferensi terbaru Abi: perlakukan 7 slot harian sebagai slot aktif
- Materi per hari harus berbeda-beda, bukan sekadar copy topik yang sama
- Rule horizon lama `1 nested thread per local day` masih tertanam di script dan harus direvisi

## Durable queue history
- Queue lama pernah masih mengikuti hitungan UTC+8 dan jatuh sekitar `04:00 WIB`
- Queue pending kemudian dinormalisasi ke `05:00 WIB`
- Verifikasi live sesudah normalisasi membuktikan item `2026-04-17 05:00 WIB` sukses publish penuh
- Monitoring terbaru menunjukkan pola nyata horizon saat ini efektifnya satu item per hari di `05:00 WIB`

## Analysis
- Ada gap jelas antara config slot dan script horizon saat ini: config sudah 7 slot, tapi implementasi `ensure-horizon` masih satu post per hari.
- Dengan preferensi baru Abi, slot lain bukan lagi cadangan; semuanya harus dianggap aktif.
- Karena Abi minta materi harian berbeda-beda, generator topik juga perlu guard agar distribusi tema tidak monoton.
- `ensure-horizon` dan reporting harus direvisi bersama supaya queue dan laporan tidak saling bertentangan.

## Operational cautions
- Jangan asumsikan perubahan timezone otomatis menggeser queue live; audit dulu.
- Kalau perlu reschedule massal lagi, pakai pola aman: create replacement dulu, delete old pending setelah sukses.
- Saat audit, selalu bedakan `success`, `pending`, dan catch-up/manual post.
- Saat migrasi dari mode 1-slot ke 7-slot, hindari membuat duplikasi liar di hari yang sudah punya item manual atau catch-up.
