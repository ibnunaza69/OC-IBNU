# GrowthCircle Image Helper

Helper siap pakai untuk generate gambar via GrowthCircle `gpt-image-2`.

## File
- `.env` → isi API key aktif
- `.env.example` → template env
- `generate-image.mjs` → helper utama
- `generate-image.sh` → wrapper shell
- `outputs/` → hasil gambar

## Default env
```env
GC_BASE_URL=https://ai.growthcircle.id
GC_ASSET_BASE_URL=https://growthcircle.id
GC_DEFAULT_MODEL=gpt-image-2
GC_DEFAULT_SIZE=1:1
GC_DEFAULT_N=1
GC_POLL_INTERVAL_MS=3000
GC_POLL_TIMEOUT_MS=180000
```

## Cek model
```bash
cd /root/.openclaw/workspace/growthcircle_image
node generate-image.mjs models
```

## Generate pakai preset
### Faceless
```bash
cd /root/.openclaw/workspace/growthcircle_image
node generate-image.mjs generate --preset faceless --size 4:5
```

### Product
```bash
node generate-image.mjs generate --preset product --size 1:1
```

### Poster
```bash
node generate-image.mjs generate --preset poster --size 4:5
```

### Thumbnail
```bash
node generate-image.mjs generate --preset thumbnail --size 16:9
```

## Generate pakai prompt custom
```bash
node generate-image.mjs generate \
  --prompt "A faceless Muslim man working on a laptop in a minimalist home office, warm lighting, realistic, no text" \
  --size 4:5
```

## Image-to-image
Bisa tambahkan satu atau lebih referensi:
```bash
node generate-image.mjs generate \
  --prompt "Turn this reference into a premium product ad, no text" \
  --size 1:1 \
  --image-url "https://example.com/ref1.png"
```

## Poll task manual
```bash
node generate-image.mjs poll --task-id imgtask_xxx
```

## Download manual
```bash
node generate-image.mjs download \
  --url "https://growthcircle.id/api/assets/ai-images/..." \
  --output outputs/manual.png
```

## Catatan
- Flow generation async: submit → dapat `task_id` → poll sampai `completed`.
- Asset hasil diverifikasi/didownload dengan **GET**, bukan HEAD.
- `size` pakai rasio seperti `1:1`, `4:5`, `16:9`, `9:16`.
- Helper ini dibuat untuk `n=1`.
