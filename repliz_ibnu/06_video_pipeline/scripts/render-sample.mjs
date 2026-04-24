import {execFileSync} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const cwd = process.cwd();
const outDir = path.join(cwd, 'out');
const outFile = path.join(outDir, 'canva-animasi-sample.mp4');
const propsFile = path.join(cwd, 'examples/props/canva-animasi.json');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, {recursive: true});
}

execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'remotion',
    'render',
    'src/index.ts',
    'ShortVideoVertical',
    outFile,
    '--props=' + propsFile,
  ],
  {stdio: 'inherit', cwd},
);
