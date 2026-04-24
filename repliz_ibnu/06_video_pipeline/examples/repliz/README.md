# Repliz video payload handoff

Folder ini berisi contoh payload untuk menyambungkan hasil render video ke alur schedule Repliz.

## Langkah saat ini
1. Render video ke `repliz_ibnu/runtime/generated_videos/`
2. Siapkan metadata schedule di JSON
3. Bangun payload video Repliz:

```bash
node scripts/build-repliz-video-payload.mjs \
  /root/.openclaw/workspace/repliz_ibnu/runtime/generated_videos/quick-quote-brief.mp4 \
  examples/repliz/video-schedule-meta.example.json \
  examples/repliz/video-schedule-payload.json
```

## Catatan penting
API Repliz untuk media video mengharapkan `medias[].url` yang bisa diakses Repliz. Jadi path lokal ini baru berfungsi sebagai handoff internal. Untuk auto-post penuh, video final perlu berada di URL publik/object storage/CDN yang bisa diambil oleh Repliz.
