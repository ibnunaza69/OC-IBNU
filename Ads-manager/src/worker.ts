import { logger } from './lib/logger.js';
import { registerKieImagePollWorker } from './modules/asset-generation/image-generation.queue.js';
import { registerKieRunwayVideoPollWorker } from './modules/asset-generation/video-generation.queue.js';
import { registerMetaSyncHierarchyWorker } from './modules/meta-sync/meta-sync.queue.js';
import { startQueue, stopQueue } from './modules/foundation/queue/queue.js';
import { registerMetaVerificationRunnerWorker } from './modules/manage-campaigns/verification-runner.queue.js';

async function main() {
  const queue = await startQueue();

  await queue.createQueue('foundation.healthcheck');
  await queue.work('foundation.healthcheck', async (job) => {
    logger.info({ job }, 'foundation.healthcheck job executed');
    return { ok: true, executedAt: new Date().toISOString() };
  });

  await registerKieImagePollWorker();
  await registerKieRunwayVideoPollWorker();
  await registerMetaSyncHierarchyWorker();
  await registerMetaVerificationRunnerWorker();

  logger.info('worker started');
  logger.info('registered jobs: foundation.healthcheck, asset.generation.image.kie.poll, asset.generation.video.kie-runway.poll, meta.sync.hierarchy, meta.verification.runner');
}

void main();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, 'worker shutting down');
    await stopQueue();
    process.exit(0);
  });
}
