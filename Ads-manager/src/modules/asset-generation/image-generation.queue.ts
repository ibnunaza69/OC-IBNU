import { logger } from '../../lib/logger.js';
import { JobsStateRepository } from '../foundation/jobs/jobs.repository.js';
import { startQueue } from '../foundation/queue/queue.js';
import { ImageGenerationService } from './image-generation.service.js';

export const KIE_IMAGE_POLL_JOB_NAME = 'asset.generation.image.kie.poll';

export interface KieImagePollJobData {
  taskId: string;
  providerTaskId: string;
  requestedBy: string;
  requestedAt: string;
}

const jobsRepository = new JobsStateRepository();
const imageGenerationService = new ImageGenerationService();

export async function ensureKieImagePollQueue() {
  const queue = await startQueue();
  await queue.createQueue(KIE_IMAGE_POLL_JOB_NAME);
  return queue;
}

export async function enqueueKieImagePollJob(input: KieImagePollJobData) {
  const queue = await ensureKieImagePollQueue();

  const jobId = await queue.send(KIE_IMAGE_POLL_JOB_NAME, input, {
    singletonKey: `asset-kie-poll:${input.taskId}`,
    singletonSeconds: 30,
    retryLimit: 2,
    retryDelay: 10
  });

  await jobsRepository.upsert({
    jobName: KIE_IMAGE_POLL_JOB_NAME,
    jobKey: input.taskId,
    status: jobId ? 'queued' : 'deduplicated',
    payload: {
      jobId,
      ...input
    }
  });

  return {
    ok: true,
    status: jobId ? 'queued' : 'deduplicated',
    queue: KIE_IMAGE_POLL_JOB_NAME,
    jobId,
    payload: input
  };
}

export async function registerKieImagePollWorker() {
  const queue = await ensureKieImagePollQueue();

  await queue.work<KieImagePollJobData>(KIE_IMAGE_POLL_JOB_NAME, async (jobs) => {
    const results = [];

    for (const job of jobs) {
      const data = job.data;

      await jobsRepository.upsert({
        jobName: KIE_IMAGE_POLL_JOB_NAME,
        jobKey: data.taskId,
        status: 'running',
        payload: {
          workerJobId: job.id,
          startedAt: new Date().toISOString(),
          ...data
        }
      });

      try {
        const result = await imageGenerationService.refreshKieImageTask({
          taskId: data.taskId,
          actor: 'worker'
        });

        await jobsRepository.upsert({
          jobName: KIE_IMAGE_POLL_JOB_NAME,
          jobKey: data.taskId,
          status: result.task.status,
          payload: {
            workerJobId: job.id,
            finishedAt: new Date().toISOString(),
            ...data,
            taskStatus: result.task.status,
            assetCount: result.assets.length
          }
        });

        logger.info({ jobId: job.id, taskId: data.taskId, status: result.task.status }, 'kie image poll job completed');
        results.push({ ok: true, jobId: job.id, taskId: data.taskId, status: result.task.status, assetCount: result.assets.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown KIE image poll failure';

        await jobsRepository.upsert({
          jobName: KIE_IMAGE_POLL_JOB_NAME,
          jobKey: data.taskId,
          status: 'failed',
          lastError: message,
          payload: {
            workerJobId: job.id,
            failedAt: new Date().toISOString(),
            ...data
          }
        });

        logger.error({ err: error, jobId: job.id, taskId: data.taskId }, 'kie image poll job failed');
        throw error;
      }
    }

    return results;
  });
}
