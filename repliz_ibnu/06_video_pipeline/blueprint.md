# Blueprint: 06_video_pipeline

## Shared context links
- Root project: [`../blueprint.md`](../blueprint.md)
- Tools: [`../../TOOLS.md`](../../TOOLS.md)
- Memory: [`../../MEMORY.md`](../../MEMORY.md)

## Objective
Menjadi entry point pipeline video semi-serius untuk konten pendek: generator konten berbasis data, template scene reusable, render MP4 via Remotion + FFmpeg, dan output yang nanti bisa dihubungkan ke scheduler/poster seperti Repliz.

## Scope
- Node.js project untuk authoring + render orchestration
- Remotion compositions untuk animasi template
- FFmpeg sebagai dependency render final
- Asset library lokal untuk icon, background, music placeholder, dan scene assets
- Input JSON/brief yang bisa digenerate dari workflow konten

## Folder map
- `README.md` — quickstart, install, run, render
- `package.json` — scripts dan dependencies pipeline
- `tsconfig.json` — TypeScript config
- `remotion.config.ts` — konfigurasi render dasar
- `src/` — source compositions, scene templates, shared utils
- `scripts/` — generator props / helper CLI
- `examples/` — contoh brief dan props siap render
- `assets/` — icon, background, audio placeholder, dll
- `out/` — output render lokal (gitignored)

## Design principles
- Semua template harus reusable dan data-driven.
- Brief konten harus bisa diubah jadi props render tanpa edit manual scene.
- Copy, palette, CTA, dan scene order idealnya bisa diganti via JSON.
- Jangan hardcode akun, token, atau secret di folder ini.

## Initial composition target
- Short vertical 9:16 video (1080x1920)
- Durasi 10-20 detik
- Fokus awal: text motion, promo edukasi pendek, teaser carousel/infografis

## Future integration target
- Hook dari generator ide/konten project ini
- Export hasil ke folder output yang nanti bisa diambil scheduler/poster
- Optional: narasi TTS, music beds, batch render, multi-template themes
