# 01_accounts_access / Blueprint

## Shared context links
- [`../blueprint.md`](../blueprint.md)
- [`../00_shared/blueprint.md`](../00_shared/blueprint.md)
- [`../../TOOLS.md`](../../TOOLS.md)
- [`../../MEMORY.md`](../../MEMORY.md)

## Scope
Dokumentasi tentang account Repliz yang dipakai, cara aksesnya, dan batasan penyimpanan rahasia.

## Durable facts
- Secret store yang dipilih: `~/.openclaw/.env`
- Env yang dipakai: `REPLIZ_ACCESS_KEY`, `REPLIZ_SECRET_KEY`
- Skill lokal tersedia di `/root/.openclaw/workspace/skills/repliz/`
- Connected Threads account yang pernah diverifikasi: `Agent022` / `azzamsalmamulia`
- Scheduler dapat auto-resolve account jika hanya ada satu account connected

## Operational guidance
- Jangan commit kredensial ke git.
- Kalau account connected bertambah lebih dari satu, operasi scheduler harus mulai pakai `--account-id` secara eksplisit.
- Kalau auth gagal, cek env global dulu sebelum curiga ke script.
- `/public/account` adalah endpoint pertama untuk verifikasi akses hidup.

## Open questions
- Belum ada alias internal resmi dari Abi untuk akun Threads ini selain nama account live dari Repliz.
- Belum ada policy final apakah nanti akan ada account Threads kedua atau platform lain dalam folder yang sama.
