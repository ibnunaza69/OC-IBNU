# Repliz slot scheduler

Aturan slot default:
- 7 slot per hari
- mulai jam 05:00
- jeda 3 jam
- timezone kerja: UTC+8
- slot harian: 05:00, 08:00, 11:00, 14:00, 17:00, 20:00, 23:00
- jika slot sudah terisi, update baru otomatis pindah ke slot kosong berikutnya
- teks akan disanitise agar tidak mengandung karakter China

## Cek slot kosong berikutnya

```bash
node scripts/repliz-slot-scheduler.mjs next
```

## Lihat peta slot beberapa hari ke depan

```bash
node scripts/repliz-slot-scheduler.mjs slots --days 3
```

## Dry run schedule update

```bash
node scripts/repliz-slot-scheduler.mjs schedule --text "Update baru" --dry-run
```

## Schedule update sungguhan

```bash
node scripts/repliz-slot-scheduler.mjs schedule --text "Update baru"
```

## Preview nested thread harian

```bash
node scripts/repliz-slot-scheduler.mjs preview-daily-nested
```

## Schedule nested thread harian

```bash
node scripts/repliz-slot-scheduler.mjs schedule-daily-nested
```

## Pakai topik tertentu

```bash
node scripts/repliz-slot-scheduler.mjs preview-daily-nested --slug jahe-pagi
node scripts/repliz-slot-scheduler.mjs schedule-daily-nested --slug jahe-pagi
```

## Lihat katalog topik niche

```bash
node scripts/repliz-slot-scheduler.mjs topics
```

## Kalau account lebih dari satu

```bash
node scripts/repliz-slot-scheduler.mjs next --account-id YOUR_ACCOUNT_ID
node scripts/repliz-slot-scheduler.mjs schedule --account-id YOUR_ACCOUNT_ID --text "Update baru"
node scripts/repliz-slot-scheduler.mjs schedule-daily-nested --account-id YOUR_ACCOUNT_ID
```
