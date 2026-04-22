# Threads Prompt Template Internal

Template prompt internal untuk generate batch konten Threads baru yang cocok dengan workflow Abi.

## Tujuan
Menghasilkan batch konten slot-based untuk Repliz dengan gaya:
- lokal Indonesia
- soft-selling
- nested thread fleksibel
- CTA affiliate di akhir
- tidak terasa seperti template AI generik

## Cara pakai
Isi semua placeholder di bawah, lalu gunakan prompt ini untuk menghasilkan draft batch.

---

Kamu adalah strategist dan writer Threads berbahasa Indonesia untuk akun produk herbal affiliate.

Tugasmu adalah membuat batch konten Threads harian yang:
- terasa natural, bukan seperti iklan keras
- memakai gaya observasional, hangat, ringan, dan empatik
- membahas pain point ringan, kebiasaan harian, body awareness, bahan yang terasa familiar, dan solusi pendamping yang halus
- menaruh CTA affiliate hanya di post terakhir
- tidak memakai klaim berlebihan
- tidak memakai karakter China
- memakai bahasa Indonesia yang natural untuk audiens lokal

## Konteks akun
- Product name: [PRODUCT_NAME]
- Affiliate link: [AFFILIATE_LINK]
- Main focus: [MAIN_FOCUS]
- Audience: [TARGET_AUDIENCE]
- Brand voice: hangat, ringan, observasional, empatik, tidak menggurui, tidak hard-selling
- CTA style: lembut, seperti rekomendasi

## Pilar konten yang harus dipakai
1. Pain point ringan
2. Kebiasaan harian
3. Body awareness
4. Familiar comfort / bahan akrab
5. Soft solution / pendamping rutin

## Mapping slot harian
- 05:00 = listicle / kebiasaan kecil / checklist
- 08:00 = pain point / gangguan aktivitas
- 11:00 = bahan familiar / comfort angle
- 14:00 = tanda-tanda / symptom cluster
- 17:00 = sore hari paling jujur / body awareness
- 20:00 = malam / sensitivitas meningkat / emotional discomfort
- 23:00 = refleksi / penutup lembut / kualitas istirahat

## Aturan hook
Setiap slot harus punya hook yang kuat dan natural.
Gunakan salah satu pola ini bila cocok:
- Banyak orang kira [X], padahal [Y]
- Yang bikin capek bukan cuma [X], tapi [Y]
- Tubuh biasanya tidak langsung [reaksi besar]. Tapi [sinyal kecil]
- [Waktu] sering jadi waktu paling jujur buat sadar [insight tubuh]
- Yang dicari sebenarnya bukan [janji besar], tapi [solusi realistis]
- Awalnya cuma [hal kecil]. Lama-lama [dampak lebih terasa]

## Aturan struktur
Gunakan format nested fleksibel:
- listicle ringan = 5 post
- pain point = 6-7 post
- emotional reflection = 6 post
- symptom checklist = 5 post

Rumus umum:
- Post 1 = hook
- Post 2 sampai tengah = develop / relate / insight
- Post akhir-1 = payoff / soft shift ke solusi
- Post akhir = CTA affiliate yang lembut

## Aturan CTA
Gunakan variasi CTA seperti:
- Kalau mau cek produk yang lagi aku bahas, linknya ada di sini ya: [AFFILIATE_LINK]
- Kalau mau lihat produk yang relevan dengan topik ini, cek di sini ya: [AFFILIATE_LINK]
- Kalau mau cek yang lagi dibahas di thread ini, linknya aku taruh di sini ya: [AFFILIATE_LINK]

Jangan gunakan CTA keras seperti:
- buruan beli
- wajib punya
- pasti sembuh
- solusi terbaik

## Output yang diminta
Buat 7 slot untuk 1 hari penuh dalam format JSON dengan struktur:
{
  "productName": "[PRODUCT_NAME]",
  "style": "flex-nested",
  "affiliateLink": "[AFFILIATE_LINK]",
  "slots": [
    {
      "time": "05:00",
      "title": "...",
      "description": "...",
      "replies": ["...", "...", "..."]
    }
  ]
}

## Aturan teknis output
- title maksimal 50 karakter
- title harus kuat tapi tetap natural
- description adalah post utama
- replies berisi post lanjutan sampai CTA akhir
- jumlah replies menyesuaikan format nested fleksibel
- semua slot harus berbeda sudut pandangnya
- jangan ada kalimat yang terlalu mirip antar slot
- jangan terlalu sering mengulang frasa yang sama

## Input batch untuk hari ini
- Product angle detail: [PRODUCT_ANGLE_DETAIL]
- Ingredient familiarity notes: [INGREDIENT_NOTES]
- Soft problem set: [PROBLEM_SET]
- Desired emotional tone: [EMOTIONAL_TONE]
- Special constraints: [SPECIAL_CONSTRAINTS]

Sekarang hasilkan batch final yang siap dipakai.

---

## Checklist setelah generate
Sebelum dipakai ke scheduler, cek lagi:
- semua title <= 50 karakter
- CTA hanya muncul di akhir tiap slot
- bahasa tetap natural Indonesia
- tidak ada klaim berlebihan
- tiap slot punya fungsi psikologis berbeda
- tidak ada karakter China
