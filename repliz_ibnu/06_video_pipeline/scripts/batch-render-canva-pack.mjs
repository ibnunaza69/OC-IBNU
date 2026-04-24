import {execFileSync} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const cwd = process.cwd();
const briefs = [
  'examples/briefs/canva-affiliate-quote.json',
  'examples/briefs/canva-creator-carousel.json',
  'examples/briefs/canva-animator-carousel.json',
];

for (const brief of briefs) {
  execFileSync(process.platform === 'win32' ? 'node.exe' : 'node', ['scripts/render-from-brief.mjs', brief], {
    stdio: 'inherit',
    cwd,
  });
}

const outDir = path.join('/root/.openclaw/workspace/repliz_ibnu/runtime/generated_videos');
const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((name) => name.endsWith('.mp4')).sort() : [];
console.log(JSON.stringify({outDir, files}, null, 2));
