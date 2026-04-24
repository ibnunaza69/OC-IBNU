# Repliz Video Pipeline

Pipeline menengah-serius untuk video konten pendek berbasis:
- Node.js
- Remotion
- FFmpeg
- asset library lokal
- reusable scene templates

## Tujuan awal
Scaffold ini dibuat supaya workflow video bisa data-driven, bukan edit manual terus-menerus. Tahap awal fokus ke video vertikal 9:16 durasi pendek dengan text motion modern untuk edukasi, promo affiliate, dan teaser konten.

## Struktur
- `src/` — source Remotion compositions
- `scripts/` — helper CLI
- `examples/briefs/` — contoh brief konten
- `examples/props/` — props siap render
- `assets/` — icon, music, background, logo, dsb
- `out/` — output render lokal

## Install dependency
```bash
cd /root/.openclaw/workspace/repliz_ibnu/06_video_pipeline
npm install
```

## Validasi environment
```bash
npm run lint:config
```
Catatan: saat scaffold ini dibuat, Node.js dan npm tersedia, tetapi FFmpeg belum terpasang di host. Render MP4 final belum bisa berjalan sampai FFmpeg tersedia.

## Jalankan studio preview
```bash
npm run dev
```
Lalu buka Remotion Studio untuk preview composition:
- `ShortVideoVertical`
- `QuotePromoVertical`
- `CarouselTeaserVertical`

## Render sample MP4
```bash
npm run render:sample
npm run render:quote
npm run render:carousel
```
Output default:
```bash
out/canva-animasi-sample.mp4
out/quote-promo-sample.mp4
out/carousel-teaser-sample.mp4
```

## Generator input singkat → render siap pakai
Template yang didukung saat ini:
- `quote-promo`
- `carousel-teaser`

### Generate props dari brief singkat
```bash
npm run quick:quote
npm run quick:carousel
```

### Render langsung dari brief
```bash
node scripts/render-from-brief.mjs examples/briefs/quick-quote-brief.json
node scripts/render-from-brief.mjs examples/briefs/quick-carousel-brief.json
```

Output render final otomatis ditulis ke:
```bash
/root/.openclaw/workspace/repliz_ibnu/runtime/generated_videos/
```

## Alur kerja singkat
1. Buat brief JSON di `examples/briefs/` atau folder lain.
2. Jalankan `node scripts/render-from-brief.mjs <brief.json>`.
3. Preview atau render otomatis via Remotion.
4. Hasil MP4 masuk ke `runtime/generated_videos/`.
5. File output itu siap dijadikan handoff ke workflow posting/scheduler Repliz.

## Bentuk data utama
Props saat ini berisi:
- `meta` — judul, fps, ratio
- `brand` — nama akun/handle
- `palette` — warna tema
- `cta` — label dan keyword CTA
- `scenes` — blok scene reusable dengan jenis:
  - `hook`
  - `feature-list`
  - `audience`
  - `cta`

## Kenapa Remotion + FFmpeg
- layout dan animasi bisa dibuat reusable
- input bisa datang dari JSON/generator konten
- mudah dibatch untuk banyak video
- lebih stabil daripada GUI automation

## Next step yang saya sarankan
1. Pasang FFmpeg di host.
2. Jalankan `npm install`.
3. Preview sample di Remotion.
4. Tambahkan template kedua: `quote-promo` dan `carousel-teaser`.
5. Hubungkan generator konten project Repliz ke format props JSON.
6. Tambahkan asset library nyata: logo, background, music bed, icon pack.

## Brief siap pakai untuk niche Canva / creator / affiliate
Sudah disiapkan contoh brief berikut:
- `examples/briefs/canva-affiliate-quote.json`
- `examples/briefs/canva-creator-carousel.json`
- `examples/briefs/canva-animator-carousel.json`

Untuk render semuanya sekaligus:
```bash
npm run batch:canva
```

## Handoff ke workflow Repliz
Render final otomatis masuk ke:
```bash
/root/.openclaw/workspace/repliz_ibnu/runtime/generated_videos/
```

Untuk menyiapkan payload schedule video Repliz:
```bash
node scripts/build-repliz-video-payload.mjs \
  /root/.openclaw/workspace/repliz_ibnu/runtime/generated_videos/<nama-file>.mp4 \
  examples/repliz/video-schedule-meta.example.json \
  examples/repliz/video-schedule-payload.json
```

Catatan: Repliz perlu `medias[].url` yang bisa diakses publik. Jadi tahap ini baru menyiapkan payload/handoff internal. Untuk auto-post penuh, file video perlu dipindah dulu ke storage/CDN/URL publik.

## Future integration
Scaffold ini sengaja dipisah agar nanti bisa dihubungkan ke:
- generator ide/caption
- batch render harian
- scheduler/poster seperti Repliz
- opsional TTS/narasi
