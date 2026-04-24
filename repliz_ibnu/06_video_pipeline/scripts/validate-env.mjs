import {spawnSync} from 'node:child_process';

const checks = [
  ['node', ['-v']],
  ['npm', ['-v']],
  ['ffmpeg', ['-version']],
];

let ok = true;
for (const [cmd, args] of checks) {
  const result = spawnSync(cmd, args, {encoding: 'utf8'});
  if (result.status === 0) {
    console.log(`[ok] ${cmd}: ${(result.stdout || result.stderr).split('\n')[0]}`);
  } else {
    ok = false;
    console.log(`[missing] ${cmd}`);
  }
}

if (!ok) {
  process.exit(1);
}
