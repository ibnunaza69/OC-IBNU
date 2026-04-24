# Blueprint: video pipeline handoff

## Purpose
Menghubungkan output video Remotion dari `06_video_pipeline/` ke runtime project Repliz dengan jalur output yang stabil.

## Output convention
- Brief input bisa disimpan di `repliz_ibnu/06_video_pipeline/examples/briefs/` atau folder brief lain.
- Render final otomatis ditulis ke:
  - `repliz_ibnu/runtime/generated_videos/`

## Current workflow
1. Siapkan brief singkat template `quote-promo` atau `carousel-teaser`.
2. Jalankan:
   - `cd repliz_ibnu/06_video_pipeline`
   - `node scripts/render-from-brief.mjs examples/briefs/<file>.json`
3. Hasil MP4 akan muncul di `repliz_ibnu/runtime/generated_videos/`.
4. File itu nanti bisa dipakai sebagai media untuk alur schedule/posting Repliz.

## Integration note
Tahap ini baru menyiapkan handoff file yang konsisten. Penyambungan otomatis ke endpoint schedule Repliz untuk media video sebaiknya menjadi langkah berikutnya agar tetap aman dan mudah diuji.
