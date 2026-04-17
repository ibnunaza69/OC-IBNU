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
- Struktur thread: 1 main post + 3 balasan berantai
- Sanitasi wajib: hilangkan karakter China dari teks final

## Source files
- Topic bank utama: `/root/.openclaw/workspace/repliz_ibnu/daily-topics.json`
- Topic selection saat ini berbasis tanggal lokal, kecuali dipaksa dengan `--slug`

## Current topic model
- Topik disimpan sebagai `slug`, `title`, dan array `posts`
- Thread length target saat ini: `4`
- Tujuan konten masih orientasi edukasi ringan, aman, dan mudah dikonsumsi

## Analysis
- Bank topik sudah cukup untuk operasi awal, tapi masih relatif kecil dan akan cepat berulang.
- Karena slot aktif nyata sekarang cuma 1 post per hari, variasi tema jadi lebih penting daripada variasi jam.
- Ke depan perlu anti-near-duplicate guard agar rotasi topik terasa lebih natural saat horizon makin panjang.

## Good next upgrades
- Tambah katalog topik 30–90 hari
- Kelompokkan topik per subtema: tidur, herbal hangat, pencernaan, gerak ringan, hidrasi
- Tambah field metadata seperti `tone`, `riskLevel`, atau `ctaStyle` kalau Abi nanti butuh variasi lebih presisi
