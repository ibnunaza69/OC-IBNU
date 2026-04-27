# Dashboard Monitoring — Deployment Checklist

Checklist ini disiapkan supaya rollout dashboard production cepat dan aman.

## 1. DNS / Cloudflare

- buat subdomain, mis. `dashboard.example.com`
- arahkan **A record** ke IP server
- mode Cloudflare bisa mulai dari:
  - **DNS only** saat validasi awal origin
  - lalu **Proxied** kalau sudah stabil
- SSL/TLS mode Cloudflare yang direkomendasikan: **Full (strict)**

## 2. App build di server

Di folder app production:

```bash
cd /opt/meta-ads-dev/app
npm install
npm run build
```

## 3. Siapkan env production

Minimal isi variabel berikut:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://...
META_ACCESS_TOKEN=...
META_AD_ACCOUNT_ID=...
META_WRITE_SECRET=...
KIE_API_KEY=...
KIE_CALLBACK_URL=https://dashboard.example.com/internal/assets/kie/callback

DASHBOARD_AUTH_ENABLED=true
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD_HASH=scrypt$...
DASHBOARD_SESSION_SECRET=replace-with-long-random-secret
DASHBOARD_SESSION_TTL_SECONDS=43200
DASHBOARD_COOKIE_SECURE=true
DASHBOARD_LOGIN_MAX_ATTEMPTS=5
DASHBOARD_LOGIN_BLOCK_MINUTES=15
```

## 4. Generate hash password dashboard

Jangan simpan password plaintext di production. Generate hash:

```bash
npm run dashboard:hash-password -- "ganti-dengan-password-kuat"
```

Lalu copy output `scrypt$...` ke `DASHBOARD_PASSWORD_HASH`.

## 5. Rotate / finalisasi credential dashboard

Sebelum domain dibuka publik:

- pastikan `DASHBOARD_PASSWORD` kosong / tidak dipakai
- pakai `DASHBOARD_PASSWORD_HASH`
- ganti `DASHBOARD_SESSION_SECRET` dengan random string panjang baru
- pastikan `DASHBOARD_COOKIE_SECURE=true`

## 6. Systemd services

Copy template service:

- `deploy/systemd/meta-ads-api.service`
- `deploy/systemd/meta-ads-worker.service`

Lalu install:

```bash
sudo cp deploy/systemd/meta-ads-api.service /etc/systemd/system/
sudo cp deploy/systemd/meta-ads-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now meta-ads-api meta-ads-worker
sudo systemctl status meta-ads-api --no-pager
sudo systemctl status meta-ads-worker --no-pager
```

## 7. Caddy reverse proxy

Copy template:

- `deploy/caddy/meta-ads-dashboard.Caddyfile`

Sesuaikan domain, lalu pasang ke Caddy.

Contoh cepat:

```bash
sudo cp deploy/caddy/meta-ads-dashboard.Caddyfile /etc/caddy/Caddyfile
sudoedit /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

## 8. Verifikasi origin

Dari server:

```bash
curl -I http://127.0.0.1:3000/dashboard/login
curl -I https://dashboard.example.com/dashboard/login
```

Yang dicek:
- halaman login kebuka
- redirect ke login saat belum auth
- cookie dashboard punya `HttpOnly`
- di production, cookie punya `Secure`

## 9. Verifikasi app behavior

- login dashboard sukses
- `/dashboard` tampil
- `/dashboard/api/summary` hanya bisa diakses setelah login
- status foundation DB = `up`
- provider state tidak membocorkan token mentah

## 10. Setelah stabil

- aktifkan proxy Cloudflare bila sebelumnya masih DNS only
- pertimbangkan tambah Cloudflare Access / IP allowlist kalau mau ekstra ketat
- monitor log Caddy + systemd untuk percobaan login gagal berulang

## 11. Catatan keamanan

- dashboard saat ini **read-only**, sengaja dibuat aman untuk internet-facing monitoring
- write action tetap lewat internal guarded endpoints yang sudah ada
- jangan share credential dashboard di grup chat
- kalau credential pernah bocor, rotate:
  - `DASHBOARD_PASSWORD_HASH`
  - `DASHBOARD_SESSION_SECRET`
