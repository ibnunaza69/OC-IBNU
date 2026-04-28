#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = '/root/.openclaw/workspace';
const projectRoot = path.join(workspaceRoot, 'repliz_ibnu');
const args = process.argv.slice(2);

const slotTimes = ['05:00', '08:00', '11:00', '14:00', '17:00', '20:00', '23:00'];
const themes = ['animasi', 'carousel', 'infografis', 'creator', 'workflow'];
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
  creator: [
    'Konten creator yang konsisten biasanya lahir dari sistem yang ringan dijalani, bukan dari semangat sesaat.',
    'Banyak creator berhenti di tengah jalan bukan karena tidak bisa desain, tapi karena workflow-nya terlalu bikin capek.',
    'Kalau mau akun tumbuh, yang dibenahi bukan cuma hasil akhir, tapi juga proses bikin kontennya.'
  ],
  workflow: [
    'Workflow konten yang rapi biasanya bikin ide lebih gampang dieksekusi tanpa keburu capek duluan.',
    'Banyak hasil konten terasa mentok bukan karena kurang niat, tapi karena alurnya belum enak dipakai berulang.',
    'Kalau prosesnya ringan, konsistensi biasanya jauh lebih mungkin dijaga.'
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
  const outDir = path.resolve(getOption('--out-dir') ?? path.join(projectRoot, '02_content_strategy/accounts/animasiku2026/generated_hookflex_clean'));
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
    ctaMode: 'reply-keyword',
    ctaKeyword: 'Mau',
    sourceThemes: themes,
    localDate,
    slots
  };
}

function buildReplies(theme, mode) {
  const map = {
    start: [
      'Kalau baru mulai, tidak perlu langsung mengejar hasil yang ramai. Yang penting alurnya terasa ringan dan mudah diulang.',
      'Biasanya progres yang paling enak justru datang dari workflow sederhana yang konsisten dipakai.',
      'Kalau mau, balas Mau ya. Nanti saya arahkan ke materi belajarnya pelan-pelan.'
    ],
    pain: [
      'Sering kali bukan idenya yang kurang, tapi struktur kontennya belum cukup nyaman diikuti audiens.',
      'Begitu urutan, visual, dan fokus pesannya lebih rapi, hasilnya biasanya ikut terasa lebih enak.',
      'Kalau mau, balas Mau ya. Nanti saya kirim arah belajar yang relevan.'
    ],
    simple: [
      'Banyak hasil yang terlihat rapi justru dibangun dari elemen sederhana yang dipakai dengan tepat.',
      'Jadi tidak harus rumit, yang penting jelas arah dan fungsi tiap bagiannya.',
      'Kalau mau belajar step yang ringan, balas Mau ya.'
    ],
    mistake: [
      'Kesalahan kecil yang terus diulang memang sering bikin hasil terasa lebih berat dari yang seharusnya.',
      'Begitu titik kelirunya ketemu, proses desain biasanya jauh lebih lega dijalani.',
      'Kalau mau, balas Mau ya. Nanti saya arahkan ke pembahasan yang pas.'
    ],
    workflow: [
      'Kalau proses bikin konten terlalu melelahkan, konsistensi biasanya jadi lebih susah dijaga.',
      'Makanya workflow yang ringan itu penting, bukan cuma supaya hasilnya bagus, tapi juga supaya prosesnya nyaman.',
      'Kalau mau ikut alur belajar yang lebih rapi, balas Mau ya.'
    ],
    toolkit: [
      'Tool yang tepat biasanya bukan yang paling banyak, tapi yang paling membantu kerja terasa lebih ringan.',
      'Sedikit tapi benar-benar kepakai sering lebih berguna daripada banyak tapi bikin bingung.',
      'Kalau mau, balas Mau ya. Nanti saya arahkan ke resource yang relevan.'
    ],
    cta: [
      'Kalau belajar sendiri terasa loncat-loncat, biasanya lebih enak kalau masuk ke alur yang sudah disusun rapi.',
      'Dengan begitu, prosesnya lebih tenang dan tidak bingung mulai dari mana dulu.',
      'Kalau tertarik, balas Mau ya. Nanti saya arahkan langkah berikutnya.'
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
