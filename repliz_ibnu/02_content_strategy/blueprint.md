# 02_content_strategy / Blueprint

## Shared context links
- [`../blueprint.md`](../blueprint.md)
- [`../00_shared/blueprint.md`](../00_shared/blueprint.md)
- [`../../TOOLS.md`](../../TOOLS.md)
- [`../../MEMORY.md`](../../MEMORY.md)

## Scope
Strategi konten harian untuk Threads via Repliz.

## Durable content rules
- Niche aktif: `kesehatan` dan `herbal`
- Format utama: nested thread
- Sanitasi wajib: hilangkan karakter China dari teks final
- Format default yang harus diingat untuk Threads affiliate account ini adalah `hook-bank-flex-mixed-clean`
- Untuk konten affiliate campuran, gunakan rotasi 4 produk: `MADU ZESTMAG`, `MADU GURAHFIT`, `MADU JAMKORAT`, `MADU NURUTENZ`
- Struktur per slot jangan kaku; gunakan pola fleksibel: `hook` → relate/pain/insight → soft solution → CTA affiliate
- `title` harus pendek, natural, dan rapi; jangan memotong kalimat hook mentah
- `description` berfungsi sebagai hook utama dari hook bank, sedangkan `replies` disusun ulang sesuai mode slot
- CTA harus soft-selling, hangat, tidak hard-claim, dan link harus mengikuti produk pada slot tersebut

## Source files
- Topic bank utama: `/root/.openclaw/workspace/repliz_ibnu/daily-topics.json`
- Topic selection saat ini berbasis tanggal lokal, kecuali dipaksa dengan `--slug`

## Current topic model
- Topik disimpan sebagai `slug`, `title`, dan array `posts`
- Untuk mode affiliate terbaru, sumber utama bukan hanya topic bank lama tetapi juga hook bank + template fleksibel per slot
- Thread length target sekarang bersifat fleksibel ringan, umumnya `1 main post + 3-4 replies`, tidak harus selalu persis sama
- Tujuan konten adalah edukasi ringan dengan transisi halus ke rekomendasi affiliate, aman, hangat, dan mudah dikonsumsi

## Analysis
- Bank topik sudah cukup untuk operasi awal, tapi masih relatif kecil dan akan cepat berulang.
- Karena slot aktif nyata sekarang cuma 1 post per hari, variasi tema jadi lebih penting daripada variasi jam.
- Ke depan perlu anti-near-duplicate guard agar rotasi topik terasa lebih natural saat horizon makin panjang.

## Slot-mode guidance for `hook-bank-flex-mixed-clean`
- `05:00` → checklist / kebiasaan kecil / start ringan
- `08:00` → pain point / gangguan aktivitas
- `11:00` → comfort / familiar angle
- `14:00` → tanda-tanda / sinyal tubuh
- `17:00` → awareness / sore paling jujur
- `20:00` → night discomfort / ritual malam
- `23:00` → reflection / close lembut untuk istirahat besok

## Operational content defaults
- Bila user meminta “format ini”, artinya gunakan format `hook-bank-flex-mixed-clean` kecuali diminta lain
- Bila perlu generate untuk hari tertentu, prioritaskan file harian yang siap langsung dipasang ke scheduler
- Hindari mengubah post yang sudah `success` kecuali user minta eksplisit, untuk mencegah duplikasi atau gangguan live queue

## Good next upgrades
- Tambah katalog topik 30–90 hari
- Kelompokkan topik per subtema: tidur, herbal hangat, pencernaan, gerak ringan, hidrasi
- Tambah field metadata seperti `tone`, `riskLevel`, atau `ctaStyle` kalau Abi nanti butuh variasi lebih presisi
