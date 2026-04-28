#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = '/root/.openclaw/workspace';
const projectRoot = path.join(workspaceRoot, 'repliz_ibnu');
const args = process.argv.slice(2);

const slotTimes = ['05:00', '08:00', '11:00', '14:00', '17:00', '20:00', '23:00'];
const themes = ['animasi', 'carousel', 'infografis', 'affiliate', 'creator'];
const slotModes = {
  '05:00': 'start',
  '08:00': 'pain',
  '11:00': 'simple',
  '14:00': 'mistake',
  '17:00': 'workflow',
  '20:00': 'toolkit',
  '23:00': 'cta'
};

const hooks = {
  animasi: [
    'Animasi Canva yang enak dilihat biasanya justru datang dari gerakan kecil yang rapi, bukan efek yang terlalu ramai.',
    'Banyak pemula ingin hasil animasi yang keren, tapi sering lupa kalau ritme gerak yang sederhana justru lebih nyaman ditonton.',
    'Kalau motion di Canva terasa kasar, sering kali masalahnya bukan di template, tapi di urutan geraknya.'
  ],
  carousel: [
    'Carousel yang enak dibaca itu bukan yang paling ramai, tapi yang bikin orang mau swipe sampai slide terakhir.',
    'Banyak carousel sepi bukan karena topiknya jelek, tapi karena urutan slide pertama sampai ketiganya kurang nahan perhatian.',
    'Kalau konten swipe terasa berat, biasanya masalahnya ada di struktur, bukan di desain semata.'
  ],
  infografis: [
    'Infografis yang bagus itu bikin informasi cepat masuk tanpa bikin mata capek.',
    'Banyak orang fokus ke ornamen, padahal kekuatan infografis justru ada di hirarki informasi yang bersih.',
    'Kalau infografis terasa penuh, sering kali yang perlu dikurangi bukan datanya, tapi gangguan visualnya.'
  ],
  affiliate: [
    'Konten affiliate yang enak itu terasa seperti membantu orang pilih, bukan sekadar menyuruh beli.',
    'Banyak konten affiliate sepi bukan karena produknya salah, tapi karena kontennya belum terasa relevan buat audiens.',
    'Affiliate lebih enak jalan kalau kontennya tetap kasih nilai, bukan cuma tempel link.'
  ],
  creator: [
    'Konten creator yang konsisten biasanya lahir dari sistem yang ringan dijalani, bukan dari semangat sesaat.',
    'Banyak creator berhenti di tengah jalan bukan karena tidak bisa desain, tapi karena workflow-nya terlalu bikin capek.',
    'Kalau mau akun tumbuh, yang dibenahi bukan cuma hasil akhir, tapi juga proses bikin kontennya.'
  ]
};

const titleOverrides = {
  '05:00': ['Canva enak dimulai simpel', 'Motion rapi dari langkah kecil', 'Konten bagus dimulai pelan'],
  '08:00': ['Desain ramai bikin orang skip', 'Carousel bagus butuh alur', 'Konten sepi sering salah urut'],
  '11:00': ['Yang sederhana sering menang', 'Desain bersih lebih enak dibaca', 'Template bagus tetap butuh arah'],
  '14:00': ['Kesalahan kecil bikin hasil berat', 'Infografis sering gagal di hirarki', 'Animasi ramai belum tentu enak'],
  '17:00': ['Workflow sore terasa paling jujur', 'Capek ngonten biasanya dari proses', 'Sistem kerja bikin hasil beda'],
  '20:00': ['Toolkit yang tepat bikin ringan', 'Malam enak buat rapikan workflow', 'Canva lebih enak kalau setup rapi'],
  '23:00': ['Belajar bareng lebih enak jalan', 'Masuk grup biar nggak jalan sendiri', 'Template dan alur lebih gampang kalau dibimbing']
};

main();

function main() {
  const days = Number(getOption('--days') ?? '30');
  const startDate = getOption('--start-date') ?? currentLocalDateString(new Date());
  const outDir = path.resolve(getOption('--out-dir') ?? path.join(projectRoot, '02_content_strategy/generated_animasiku_hookflex_clean'));
  const dryRun = hasFlag('--dry-run');

  ensureDir(outDir);

  const written = [];
  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const localDate = addDaysToDateString(startDate, dayIndex);
    const doc = buildDayDocument(localDate, dayIndex);
    const filePath = path.join(outDir, `${localDate}.json`);
    if (!dryRun) fs.writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`);
    written.push({ localDate, filePath, style: doc.style, slotCount: doc.slots.length, dryRun });
  }

  console.log(JSON.stringify({ dryRun, startDate, days, outDir, writtenCount: written.length, written }, null, 2));
}

function buildDayDocument(localDate, dayIndex) {
  const slots = slotTimes.map((time, slotIndex) => {
    const theme = themes[(dayIndex + slotIndex) % themes.length];
    const hook = hooks[theme][(dayIndex * 2 + slotIndex) % hooks[theme].length];
    const titles = titleOverrides[time];
    return {
      time,
      title: titles[(dayIndex + slotIndex) % titles.length],
      description: hook,
      replies: buildReplies(theme, slotModes[time])
    };
  });

  return {
    productName: 'ANIMASIKU CONTENT MIX',
    style: 'hook-bank-flex-canva-group-clean',
    affiliateLink: 'cta-group-ikut',
    sourceThemes: themes,
    localDate,
    slots
  };
}

function buildReplies(theme, mode) {
  const map = {
    start: [
      'Kalau baru mulai, jangan kejar hasil yang terlalu ramai dulu. Fokus dulu ke alur yang gampang diulang.',
      'Biasanya yang bikin cepat berkembang itu bukan trik rumit, tapi workflow yang sederhana dan konsisten.',
      'Kalau mau, balas IKUT. Nanti saya arahkan masuk ke alur belajarnya pelan-pelan.'
    ],
    pain: [
      'Seringnya bukan idenya yang kurang, tapi struktur kontennya belum bikin orang mau lanjut lihat.',
      'Begitu urutan, visual, dan fokus pesan lebih rapi, performanya biasanya ikut lebih enak.',
      'Kalau mau, balas IKUT. Nanti saya arahkan masuk ke alurnya.'
    ],
    simple: [
      'Banyak hasil yang kelihatan profesional justru dibangun dari elemen yang simpel tapi rapi.',
      'Jadi bukan harus ribet, tapi harus jelas arahnya dari awal.',
      'Kalau mau belajar bareng step yang ringan, balas IKUT ya.'
    ],
    mistake: [
      'Kesalahan kecil yang diulang terus biasanya bikin hasil konten terasa berat walau templatenya bagus.',
      'Begitu titik salahnya ketemu, proses desain biasanya jauh lebih ringan.',
      'Kalau mau, saya bisa arahkan step gabungnya. Balas IKUT ya.'
    ],
    workflow: [
      'Kalau proses bikin konten terlalu melelahkan, konsistensi biasanya yang pertama jatuh.',
      'Makanya sistem kerja yang ringan itu sama pentingnya dengan hasil desainnya sendiri.',
      'Kalau mau ikut alur belajar yang lebih rapi, balas IKUT.'
    ],
    toolkit: [
      'Tool yang tepat itu bukan yang paling banyak, tapi yang paling kepakai buat bikin kerja lebih ringan.',
      'Sedikit tapi kepakai rutin biasanya lebih kuat daripada banyak tapi bikin bingung.',
      'Kalau mau, nanti saya arahkan resource dan step masuknya. Balas IKUT ya.'
    ],
    cta: [
      'Kalau jalan sendiri sering mentok, belajar bareng biasanya bikin prosesnya lebih enak dijaga.',
      'Biar nggak bingung mulai dari mana, lebih enak masuk ke alur yang sudah disusun.',
      'Kalau mau ikut, balas IKUT. Nanti saya arahkan step gabungnya.'
    ]
  };
  return map[mode] ?? map.simple;
}

function currentLocalDateString(date) {
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function addDaysToDateString(value, dayOffset) {
  const [year, month, day] = String(value).split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return base.toISOString().slice(0, 10);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getOption(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

function hasFlag(name) {
  return args.includes(name);
}
