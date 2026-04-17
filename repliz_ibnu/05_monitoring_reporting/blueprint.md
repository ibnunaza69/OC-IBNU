# 05_monitoring_reporting / Blueprint

## Shared context links
- [`../blueprint.md`](../blueprint.md)
- [`../00_shared/blueprint.md`](../00_shared/blueprint.md)
- [`../../TOOLS.md`](../../TOOLS.md)
- [`../../MEMORY.md`](../../MEMORY.md)

## Scope
Monitoring queue, audit status publish, dan format laporan yang berguna buat Abi.

## Durable monitoring facts
- Verifikasi live untuk `2026-04-17` memastikan item `05:00 WIB` sukses
- Main post dan semua 3 replies juga sukses
- Monitoring 7 hari sesudahnya menunjukkan antrean rapi tanpa failure
- Snapshot queue saat itu: `31` total, `3` success, `28` pending, `0` failed

## Reporting style
- Jawaban harus langsung dan ringkas
- Checklist jam harus dipakai untuk laporan otomatis setelah posting publish
- Untuk status hari ini, tampilkan isi konten + status jam yang sudah terbit
- Gunakan tanda centang untuk slot yang sudah ter-post
- Hindari wording berisik; fokus ke apa yang sudah publish, apa yang pending, dan apakah ada error

## Suggested recurring report blocks
- Hari ini
- Checklist 7 slot harian
- Isi materi yang baru ter-post
- Besok
- 7 hari ke depan
- Rekap total queue
- Error/failure summary

## Analysis
- Abi ternyata suka format monitoring yang konkret, bukan sekadar bilang 'aman'.
- Menampilkan isi konten + checklist jam membantu membedakan antara slot config teoritis dan slot yang benar-benar dipakai queue.
- Abi sekarang juga minta laporan otomatis ke Telegram setiap selesai posting.
- Blueprint area ini penting karena operasi Repliz ke depan kemungkinan lebih sering audit/monitor dan comment handling daripada coding besar.
