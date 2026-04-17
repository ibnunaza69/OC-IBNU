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
- Rule horizon aktif: `1 nested thread per local day`
- Rule pemilihan slot: ambil slot kosong pertama pada hari tersebut

## Durable queue history
- Queue lama pernah masih mengikuti hitungan UTC+8 dan jatuh sekitar `04:00 WIB`
- Queue pending kemudian dinormalisasi ke `05:00 WIB`
- Verifikasi live sesudah normalisasi membuktikan item `2026-04-17 05:00 WIB` sukses publish penuh
- Monitoring terbaru menunjukkan pola nyata horizon saat ini efektifnya satu item per hari di `05:00 WIB`

## Analysis
- Meskipun config punya 7 slot, behavior operasional yang dipilih Abi sekarang bukan 7 post per hari, tapi 1 post per hari.
- Artinya slot lain lebih berfungsi sebagai kapasitas cadangan daripada jadwal aktif rutin.
- Kalau suatu saat mau pakai beberapa slot per hari, rule `ensure-horizon` harus direvisi supaya tidak bentrok dengan asumsi satu post per hari.

## Operational cautions
- Jangan asumsikan perubahan timezone otomatis menggeser queue live; audit dulu.
- Kalau perlu reschedule massal lagi, pakai pola aman: create replacement dulu, delete old pending setelah sukses.
- Saat audit, selalu bedakan `success`, `pending`, dan catch-up/manual post.
