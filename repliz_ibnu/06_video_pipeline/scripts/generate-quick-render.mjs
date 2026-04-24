import fs from 'node:fs/promises';
import path from 'node:path';

const [briefPath, outputPath] = process.argv.slice(2);

if (!briefPath || !outputPath) {
  console.error('Usage: node scripts/generate-quick-render.mjs <brief.json> <output.json>');
  process.exit(1);
}

const raw = JSON.parse(await fs.readFile(briefPath, 'utf8'));
const palette = raw.palette || {
  background: '#081120',
  panel: '#101B37',
  primary: '#7DD3FC',
  secondary: '#FDE68A',
  text: '#F8FAFC',
  mutedText: '#CBD5E1'
};
const brand = raw.brand || {name: 'Canva Belajar Harian', handle: '@canvabelajar'};
const cta = raw.cta || {label: 'Komentar', keyword: 'IKUT'};

let payload;

if (raw.template === 'quote-promo') {
  payload = {
    meta: {title: raw.title || 'Quote promo', ratio: '9:16', fps: raw.fps || 30, durationInFrames: raw.durationInFrames || 150},
    palette,
    brand,
    eyebrow: raw.eyebrow || 'untuk pemula',
    hook: raw.hook,
    body: raw.body,
    footerNote: raw.footerNote || 'Cocok untuk creator dan affiliator.',
    cta,
  };
} else if (raw.template === 'carousel-teaser') {
  payload = {
    meta: {title: raw.title || 'Carousel teaser', ratio: '9:16', fps: raw.fps || 30},
    palette,
    brand,
    kicker: raw.kicker || 'teaser carousel',
    title: raw.titleText || raw.title || 'Belajar bikin carousel yang enak di-swipe',
    footerNote: raw.footerNote || 'Bisa dipakai untuk edukasi, jualan, dan branding.',
    cta,
    slides: raw.slides,
  };
} else {
  throw new Error('Unsupported template. Use: quote-promo or carousel-teaser');
}

await fs.mkdir(path.dirname(outputPath), {recursive: true});
await fs.writeFile(outputPath, JSON.stringify(payload, null, 2) + '\n');
console.log(`Generated props: ${outputPath}`);
