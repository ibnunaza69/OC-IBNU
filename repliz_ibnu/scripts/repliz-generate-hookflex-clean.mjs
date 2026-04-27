#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = '/root/.openclaw/workspace';
const projectRoot = path.join(workspaceRoot, 'repliz_ibnu');
const configPath = path.join(projectRoot, 'slot-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const args = process.argv.slice(2);

const slotTimes = ['05:00', '08:00', '11:00', '14:00', '17:00', '20:00', '23:00'];
const rotation = ['zestmag', 'gurahfit', 'jamkorat', 'nurutenz'];
const slotModes = {
  '05:00': 'checklist',
  '08:00': 'pain',
  '11:00': 'comfort',
  '14:00': 'signals',
  '17:00': 'awareness',
  '20:00': 'night',
  '23:00': 'reflection'
};

const products = {
  zestmag: {
    productName: 'MADU ZESTMAG',
    affiliateLink: 'https://s.shopee.co.id/9Ke3EZBaF0',
    hooks: [
      'Banyak orang kira lambung cuma rewel kalau makan pedas, padahal telat makan lebih sering bikin badan kasih sinyal pelan-pelan.',
      'Yang bikin capek bukan cuma perut yang terasa tidak nyaman, tapi fokus harian yang ikut turun tanpa sadar.',
      'Tubuh biasanya tidak langsung marah soal lambung. Tapi kasih tanda kecil yang sering dianggap sepele.',
      'Kalau lambung mulai gampang sensitif, biasanya orang baru sadar betapa berantakannya ritme makan selama ini.',
      'Sore hari sering jadi waktu paling jujur buat ngerasa apakah badan dari pagi benar-benar baik-baik saja atau cuma tertahan karena sibuk.',
      'Banyak orang baru serius jaga lambung setelah sadar efeknya nyambung ke makan, fokus, dan kualitas istirahat.',
      'Awalnya cuma telat makan sesekali. Lama-lama badan mulai kasih sinyal yang makin susah diabaikan.',
      'Yang dicari sebenarnya bukan sesuatu yang terdengar heboh, tapi yang terasa ramah dan nyaman dipakai rutin.',
      'Kalau perut kosong mulai terasa tidak enak, biasanya itu bukan kejadian satu hari saja.',
      'Menjelang malam, tubuh biasanya lebih jujur menunjukkan apakah lambung sedang tenang atau sebenarnya sudah capek dari siang tadi.',
      'Banyak orang fokus ke makanan, padahal lambung sering capek justru karena ritme harian yang berantakan.',
      'Masalah lambung sering terasa kecil di awal, sampai akhirnya mulai ganggu mood dan kenyamanan makan.',
      'Kalau ingin lambung terasa lebih tenang, sering kali mulainya justru dari ritme makan yang lebih rapi.'
    ],
    cta: [
      'Kalau sedang cari pendamping yang lebih nyambung untuk topik lambung seperti ini, aku lebih merekomendasikan yang ini: https://s.shopee.co.id/9Ke3EZBaF0',
      'Kalau mau pakai yang menurutku lebih cocok untuk lambung sensitif dan ritme makan yang berantakan, yang ini layak dipertimbangkan: https://s.shopee.co.id/9Ke3EZBaF0'
    ],
    problem: 'lambung',
    focus: 'ritme makan',
    comfort: 'pendamping lambung yang terasa lebih ramah dipakai rutin'
  },
  gurahfit: {
    productName: 'MADU GURAHFIT',
    affiliateLink: 'https://s.shopee.co.id/gMF32DRNk',
    hooks: [
      'Saat batuk datang berulang, yang turun sering bukan cuma kenyamanan tenggorokan, tapi juga enaknya menjalani aktivitas harian.',
      'Kalau tenggorokan mulai sensitif, banyak orang cenderung langsung cari sesuatu yang terasa hangat dan familiar di badan.',
      'Yang bikin berat bukan cuma napas yang terasa belum lega, tapi rasa tidak nyaman yang kebawa sampai malam.',
      'Tubuh biasanya tidak langsung terasa drop. Tapi saluran napas yang kurang nyaman sering kasih sinyal kecil lebih dulu.',
      'Malam sering jadi waktu paling jujur buat sadar kalau napas belum senyaman yang dibayangkan siang tadi.',
      'Awalnya cuma tenggorokan kurang enak. Lama-lama bicara panjang pun mulai terasa kurang nyaman.',
      'Bukan soal cari yang paling ramai dibahas, tapi cari pendamping yang terasa akrab dan gampang dipakai rutin.',
      'Di titik tertentu, orang baru sadar bahwa menjaga saluran napas bukan cuma soal reaksi cepat, tapi juga soal ritme hidup.',
      'Sore hari tubuh paling jujur menunjukkan apakah dari pagi badan sudah menahan rasa kurang nyaman.',
      'Kalau ingin napas terasa lebih nyaman, sering kali mulainya justru dari kebiasaan kecil yang dijaga konsisten.',
      'Yang bikin capek bukan cuma batuknya, tapi ritme kerja dan aktivitas yang ikut terganggu.',
      'Saat malam mulai tenang, rasa tidak nyaman di tenggorokan justru sering terasa lebih jelas.',
      'Banyak orang lebih tenang dengan pilihan hangat dan familiar saat tenggorokan mulai terasa sensitif.'
    ],
    cta: [
      'Kalau sedang cari pendamping yang lebih nyambung untuk topik pernapasan seperti ini, aku lebih merekomendasikan yang ini: https://s.shopee.co.id/gMF32DRNk',
      'Kalau lagi butuh opsi yang terasa lebih akrab dan nyaman untuk tenggorokan atau napas, aku cenderung merekomendasikan yang ini: https://s.shopee.co.id/gMF32DRNk'
    ],
    problem: 'napas dan tenggorokan',
    focus: 'kenyamanan pernapasan',
    comfort: 'pendamping hangat yang gampang masuk ke rutinitas'
  },
  jamkorat: {
    productName: 'MADU JAMKORAT',
    affiliateLink: 'https://s.shopee.co.id/9AKocoSJyn',
    hooks: [
      'Banyak orang ingin badan terasa lebih ringan, tapi lupa bahwa ritme makan, gerak, dan istirahat ikut menentukan rasanya.',
      'Yang bikin capek bukan cuma badan terasa berat, tapi aktivitas harian yang jadi ikut tidak enak dijalani.',
      'Tubuh biasanya tidak langsung protes keras. Tapi kasih sinyal kecil saat pola harian mulai berantakan.',
      'Kalau badan mulai terasa kurang ringan, sering kali itu bukan soal satu hari, tapi kebiasaan yang menumpuk.',
      'Sore hari sering jadi waktu paling jujur buat sadar apakah tubuh masih enak dipakai bergerak atau sebenarnya sudah menahan banyak sinyal.',
      'Banyak orang baru serius jaga tubuh setelah sadar rasa tidak nyaman ikut ganggu aktivitas dan istirahat.',
      'Awalnya cuma cepat capek. Lama-lama badan terasa tidak lagi seringan biasanya.',
      'Yang dicari sebenarnya bukan solusi instan, tapi pendekatan yang masuk akal dan nyaman dijalani rutin.',
      'Kalau gerak mulai terasa kurang bebas, biasanya tubuh sudah lama kasih tanda kecil sebelumnya.',
      'Menjelang malam, badan biasanya lebih sensitif menunjukkan apakah ritme hidup hari itu cukup ramah ke tubuh atau tidak.',
      'Banyak orang kira badan berat cuma soal usia atau capek, padahal pola hidup harian sering jauh lebih berpengaruh.',
      'Kalau ingin tubuh terasa lebih enak dijalani, sering kali mulainya dari kebiasaan kecil yang dibenahi pelan-pelan.'
    ],
    cta: [
      'Kalau sedang cari pendamping yang lebih nyambung untuk badan yang terasa berat atau kurang nyaman bergerak, aku lebih merekomendasikan yang ini: https://s.shopee.co.id/9AKocoSJyn',
      'Kalau mau pakai yang menurutku cocok untuk bantu jaga ritme tubuh seperti ini, yang ini layak dipertimbangkan: https://s.shopee.co.id/9AKocoSJyn'
    ],
    problem: 'badan terasa berat',
    focus: 'ritme tubuh',
    comfort: 'pendamping yang terasa akrab untuk dipakai lebih konsisten'
  },
  nurutenz: {
    productName: 'MADU NURUTENZ',
    affiliateLink: 'https://s.shopee.co.id/4Aw8iyTGID',
    hooks: [
      'Banyak orang baru sadar ritme hidup berantakan setelah badan mulai sering terasa kurang nyaman dari pagi sampai malam.',
      'Yang bikin capek bukan cuma kepala atau tengkuk yang terasa tidak enak, tapi fokus harian yang ikut turun.',
      'Tubuh biasanya tidak langsung terasa berat. Tapi kasih sinyal kecil yang sering dianggap capek biasa.',
      'Kalau badan mulai sering terasa tegang, biasanya ada kebiasaan harian yang sudah lama minta dirapikan.',
      'Sore hari sering jadi waktu paling jujur buat sadar apakah tubuh benar-benar nyaman atau cuma tertahan karena sibuk.',
      'Banyak orang baru lebih serius jaga tubuh setelah sadar efeknya nyambung ke fokus, tenaga, dan kualitas hari.',
      'Awalnya cuma terasa kurang enak sesekali. Lama-lama badan mulai terasa tidak seringan biasanya.',
      'Yang dicari sebenarnya bukan sesuatu yang terdengar heboh, tapi pendekatan yang sederhana dan realistis dipakai rutin.',
      'Kalau badan terasa tegang, sering kali masalahnya bukan cuma di satu titik, tapi di ritme hidup keseluruhan.',
      'Menjelang malam, tubuh biasanya lebih jujur menunjukkan apakah dari pagi sudah menahan rasa kurang nyaman.',
      'Banyak orang kira rasa kurang nyaman itu hal biasa, padahal tubuh sering sedang minta pola hidup yang lebih rapi.',
      'Kalau ingin badan terasa lebih nyaman, sering kali mulainya justru dari ritme hidup yang lebih stabil.'
    ],
    cta: [
      'Kalau sedang cari pendamping yang lebih nyambung untuk badan yang sering terasa tegang atau kurang nyaman, aku lebih merekomendasikan yang ini: https://s.shopee.co.id/4Aw8iyTGID',
      'Kalau mau pakai yang menurutku cocok untuk topik ritme tubuh dan tekanan seperti ini, yang ini layak dipertimbangkan: https://s.shopee.co.id/4Aw8iyTGID'
    ],
    problem: 'badan tegang dan kurang nyaman',
    focus: 'ritme hidup',
    comfort: 'pendamping yang terasa sederhana dan realistis dipakai rutin'
  }
};

const titleOverrides = {
  '05:00': {
    zestmag: 'Ritme makan lebih rapi',
    gurahfit: 'Napas nyaman dari kebiasaan kecil',
    jamkorat: 'Badan ringan dimulai pelan-pelan',
    nurutenz: 'Badan nyaman butuh ritme stabil'
  },
  '08:00': {
    zestmag: 'Lambung sensitif ganggu fokus',
    gurahfit: 'Tenggorokan sensitif ganggu aktivitas',
    jamkorat: 'Badan berat bikin aktivitas turun',
    nurutenz: 'Badan tegang bikin fokus turun'
  },
  '11:00': {
    zestmag: 'Yang akrab sering lebih nyaman',
    gurahfit: 'Pilihan hangat terasa menenangkan',
    jamkorat: 'Pendekatan ringan lebih realistis',
    nurutenz: 'Yang sederhana lebih enak dijalani'
  },
  '14:00': {
    zestmag: 'Sinyal lambung sering diremehkan',
    gurahfit: 'Saat napas mulai butuh perhatian',
    jamkorat: 'Tanda tubuh mulai minta ritme',
    nurutenz: 'Tubuh kasih sinyal pelan-pelan'
  },
  '17:00': {
    zestmag: 'Sore bikin lambung terasa jujur',
    gurahfit: 'Sore bikin badan lebih jujur',
    jamkorat: 'Sore terasa paling jujur di badan',
    nurutenz: 'Sore bikin tubuh terasa apa adanya'
  },
  '20:00': {
    zestmag: 'Malam bikin lambung lebih terasa',
    gurahfit: 'Malam bikin tenggorokan terasa jelas',
    jamkorat: 'Malam bikin tubuh lebih sensitif',
    nurutenz: 'Malam bikin badan terasa lebih jujur'
  },
  '23:00': {
    zestmag: 'Lambung tenang bikin hari enak',
    gurahfit: 'Napas nyaman bikin tidur enak',
    jamkorat: 'Tubuh ringan bikin istirahat enak',
    nurutenz: 'Badan nyaman bikin besok lebih enak'
  }
};

main();

function main() {
  const days = Number(getOption('--days') ?? config.defaultProductDayGenerateDays ?? '30');
  const startDate = getOption('--start-date') ?? currentLocalDateString(new Date());
  const outDir = path.resolve(getOption('--out-dir') ?? config.defaultProductDayDir ?? path.join(projectRoot, '02_content_strategy/generated_mix_hookflex_clean'));
  const dryRun = hasFlag('--dry-run');

  ensureDir(outDir);

  const written = [];
  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const localDate = addDaysToDateString(startDate, dayIndex);
    const doc = buildDayDocument(localDate, dayIndex);
    const filePath = path.join(outDir, `${localDate}.json`);
    if (!dryRun) {
      fs.writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`);
    }
    written.push({ localDate, filePath, style: doc.style, slotCount: doc.slots.length, dryRun });
  }

  console.log(JSON.stringify({
    dryRun,
    startDate,
    days,
    outDir,
    writtenCount: written.length,
    written
  }, null, 2));
}

function buildDayDocument(localDate, dayIndex) {
  const slots = slotTimes.map((time, slotIndex) => {
    const productKey = rotation[(dayIndex + slotIndex) % rotation.length];
    const product = products[productKey];
    const hook = product.hooks[(dayIndex * 3 + slotIndex) % product.hooks.length];
    return {
      time,
      title: titleOverrides[time][productKey],
      description: hook,
      replies: buildReplies(product, slotModes[time], dayIndex, slotIndex)
    };
  });

  return {
    productName: 'MIX 4 PRODUK',
    style: 'hook-bank-flex-mixed-clean',
    affiliateLink: 'mixed-per-slot',
    sourceProducts: rotation.map((key) => products[key].productName),
    localDate,
    slots
  };
}

function buildReplies(product, mode, dayIndex, slotIndex) {
  const cta = product.cta[(dayIndex + slotIndex) % product.cta.length];
  const { problem, focus, comfort } = product;

  if (mode === 'checklist') {
    return [
      `Biasanya mulainya bukan dari langkah besar, tapi dari kebiasaan kecil yang lebih rapi soal ${focus}.`,
      'Yang sering terasa membantu justru pola yang sederhana, lebih akrab di badan, dan tidak bikin rutinitas terasa berat.',
      `Kalau mau, mulai dari 2-3 hal dulu: tidur lebih rapi, pola harian lebih stabil, dan pilih ${comfort}.`,
      cta
    ];
  }

  if (mode === 'pain') {
    return [
      'Awalnya sering dianggap hal kecil, padahal kalau diulang terus efeknya bisa ikut ganggu fokus dan ritme aktivitas.',
      `Yang bikin capek biasanya bukan cuma ${problem}, tapi rasa tidak nyaman yang kebawa ke pekerjaan dan mood harian.`,
      `Di titik itu, banyak orang mulai sadar bahwa yang perlu dibenahi bukan cuma gejalanya, tapi juga ${focus} sehari-hari.`,
      'Makanya pendekatan yang terasa ringan dan realistis biasanya lebih gampang dijalani konsisten.',
      cta
    ];
  }

  if (mode === 'comfort') {
    return [
      'Karena itu banyak orang cenderung cari sesuatu yang terasa familiar, tidak berlebihan, dan nyaman dipakai rutin.',
      'Bukan soal cari yang paling heboh, tapi cari pendamping yang nyambung dengan kondisi tubuh dan ritme harian.',
      `Kalau bahas topik ${problem}, pendekatan yang lembut biasanya justru lebih mudah diterima.`,
      cta
    ];
  }

  if (mode === 'signals') {
    return [
      'Tanda-tandanya sering tidak datang sekaligus, tapi muncul pelan-pelan sampai akhirnya mulai terasa mengganggu.',
      'Ada yang mulai merasa fokus turun. Ada juga yang merasa aktivitas jadi tidak senyaman biasanya.',
      `Saat sinyal seperti ini mulai sering muncul, biasanya tubuh sedang minta ${focus} yang lebih rapi.`,
      cta
    ];
  }

  if (mode === 'awareness') {
    return [
      'Sibuk dari pagi sering bikin orang baru sadar kondisi badan ketika jam mulai melambat.',
      `Di sore hari, tubuh biasanya lebih jujur menunjukkan apakah dari tadi ${problem} sebenarnya sudah tertahan cukup lama.`,
      'Kalau polanya berulang, banyak orang mulai beralih ke rutinitas yang lebih stabil dan pendamping yang terasa lebih nyambung.',
      'Bukan cari yang dramatis, tapi yang paling mungkin dijaga konsisten.',
      cta
    ];
  }

  if (mode === 'night') {
    return [
      'Siang hari kadang masih bisa tertutup karena sibuk dan banyak distraksi.',
      `Tapi begitu malam lebih tenang, rasa tidak nyaman yang terkait ${problem} biasanya lebih gampang kerasa.`,
      `Karena itu banyak orang lebih suka punya ritual malam yang sederhana, tidak ribet, dan tetap mendukung ${focus}.`,
      'Pendamping yang terasa akrab biasanya lebih mudah masuk ke rutinitas seperti ini.',
      cta
    ];
  }

  return [
    'Kalau tubuh terasa lebih nyaman, biasanya efeknya ikut nyambung ke istirahat, fokus, dan enaknya jalanin hari berikutnya.',
    'Tubuh jarang langsung protes keras. Biasanya dia kasih sinyal kecil dulu, lalu diulang sampai kita benar-benar notice.',
    `Karena itu banyak orang memilih pendekatan yang pelan, masuk akal, dan selaras dengan ${focus} yang lebih rapi.`,
    cta
  ];
}

function currentLocalDateString(date) {
  const parts = toOffsetDateParts(date, config.timezoneOffsetMinutes);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function addDaysToDateString(value, dayOffset) {
  const [year, month, day] = String(value).split('-').map(Number);
  const utcMs = Date.UTC(year, month - 1, day + dayOffset, 0, 0, 0, 0);
  const shifted = new Date(utcMs);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function toOffsetDateParts(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getOption(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

function pad(value) {
  return String(value).padStart(2, '0');
}
