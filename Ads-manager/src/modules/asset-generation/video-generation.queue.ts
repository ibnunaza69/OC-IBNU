import { logger } from '../../lib/logger.js';
import { JobsStateRepository } from '../foundation/jobs/jobs.repository.js';
import { startQueue } from '../foundation/queue/queue.js';
import { VideoGenerationService } from './video-generation.service.js';

export const KIE_RUNWAY_VIDEO_POLL_JOB_NAME = 'asset.generation.video.kie-runway.poll';

export interface KieRunwayVideoPollJobData {
  taskId: string;
  providerTaskId: string;
  requestedBy: string;
  requestedAt: string;
}

const jobsRepository = new JobsStateRepository();
const videoGenerationService = new VideoGenerationService();

export async function ensureKieRunwayVideoPollQueue() {
  const queue = await startQueue();
  await queue.createQueue(KIE_RUNWAY_VIDEO_POLL_JOB_NAME);
  return queue;
}

export async function enqueueKieRunwayVideoPollJob(input: KieRunwayVideoPollJobData) {
  const queue = await ensureKieRunwayVideoPollQueue();

  const jobId = await queue.send(KIE_RUNWAY_VIDEO_POLL_JOB_NAME, input, {
    singletonKey: `asset-kie-runway-video-poll:${input.taskId}`,
    singletonSeconds: 30,
    retryLimit: 2,
    retryDelay: 10
  });

  await jobsRepository.upsert({
    jobName: KIE_RUNWAY_VIDEO_POLL_JOB_NAME,
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
    queue: KIE_RUNWAY_VIDEO_POLL_JOB_NAME,
    jobId,
    payload: input
  };
}

export async function registerKieRunwayVideoPollWorker() {
  const queue = await ensureKieRunwayVideoPollQueue();

  await queue.work<KieRunwayVideoPollJobData>(KIE_RUNWAY_VIDEO_POLL_JOB_NAME, async (jobs) => {
    const results = [];

    for (const job of jobs) {
      const data = job.data;

      await jobsRepository.upsert({
        jobName: KIE_RUNWAY_VIDEO_POLL_JOB_NAME,
        jobKey: data.taskId,
        status: 'running',
        payload: {
          workerJobId: job.id,
          startedAt: new Date().toISOString(),
          ...data
        }
      });

      try {
        const result = await videoGenerationService.refreshRunwayVideoTask({
          taskId: data.taskId,
          actor: 'worker'
        });

        await jobsRepository.upsert({
          jobName: KIE_RUNWAY_VIDEO_POLL_JOB_NAME,
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

        logger.info({ jobId: job.id, taskId: data.taskId, status: result.task.status }, 'kie runway video poll job completed');
        results.push({ ok: true, jobId: job.id, taskId: data.taskId, status: result.task.status, assetCount: result.assets.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown KIE Runway video poll failure';

        await jobsRepository.upsert({
          jobName: KIE_RUNWAY_VIDEO_POLL_JOB_NAME,
          jobKey: data.taskId,
          status: 'failed',
          lastError: message,
          payload: {
            workerJobId: job.id,
            failedAt: new Date().toISOString(),
            ...data
          }
        });

        logger.error({ err: error, jobId: job.id, taskId: data.taskId }, 'kie runway video poll job failed');
        throw error;
      }
    }

    return results;
  });
}
