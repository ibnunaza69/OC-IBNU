import { spawnSync } from 'node:child_process';
import { cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const nuxtRoot = resolve(process.cwd(), 'dashboard-nuxt');
const distRoot = resolve(process.cwd(), 'dashboard-dist');
const nuxtDist = resolve(nuxtRoot, '.output/public');

const result = spawnSync(process.platform === 'win32' ? 'nuxt.cmd' : 'nuxt', ['generate'], {
  cwd: nuxtRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production'
  }
});

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}

if (result.error) {
  throw result.error;
}

await rm(distRoot, { recursive: true, force: true });
await cp(nuxtDist, distRoot, { recursive: true });

