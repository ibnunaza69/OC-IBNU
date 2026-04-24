import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [briefPath] = process.argv.slice(2);

if (!briefPath) {
  console.error('Usage: node scripts/render-from-brief.mjs <brief.json>');
  process.exit(1);
}

const cwd = process.cwd();
const brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
const generatedDir = path.join(cwd, 'examples/props');
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, {recursive: true});

const slug = path.basename(briefPath, path.extname(briefPath));
const propsFile = path.join(generatedDir, `${slug}.generated.json`);
execFileSync(process.platform === 'win32' ? 'node.exe' : 'node', ['scripts/generate-quick-render.mjs', briefPath, propsFile], {
  stdio: 'inherit',
  cwd,
});

const composition = brief.template === 'quote-promo' ? 'QuotePromoVertical' : 'CarouselTeaserVertical';
const outDir = path.join('/root/.openclaw/workspace/repliz_ibnu/runtime/generated_videos');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive: true});
const outFile = path.join(outDir, `${slug}.mp4`);

execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  'remotion',
  'render',
  'src/index.ts',
  composition,
  outFile,
  '--props=' + propsFile,
], {stdio: 'inherit', cwd});

console.log(`Rendered video: ${outFile}`);
