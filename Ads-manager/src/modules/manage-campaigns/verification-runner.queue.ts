import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { JobsStateRepository } from '../foundation/jobs/jobs.repository.js';
import { startQueue } from '../foundation/queue/queue.js';
import { MetaVerificationRunnerService, type MetaVerificationRunnerInput } from './verification-runner.service.js';

export const META_VERIFICATION_RUNNER_JOB_NAME = 'meta.verification.runner';

export interface MetaVerificationRunnerJobData extends MetaVerificationRunnerInput {
  requestedBy: string;
  requestedAt: string;
}

const jobsRepository = new JobsStateRepository();
const verificationRunnerService = new MetaVerificationRunnerService();

function parseScheduledConfig(): MetaVerificationRunnerInput | null {
  const raw = env.META_VERIFICATION_RUNNER_CONFIG_JSON;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('META_VERIFICATION_RUNNER_CONFIG_JSON must be a JSON object');
    }

    return parsed as MetaVerificationRunnerInput;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Invalid META_VERIFICATION_RUNNER_CONFIG_JSON: ${error.message}`
        : 'Invalid META_VERIFICATION_RUNNER_CONFIG_JSON'
    );
  }
}

function buildPayload(input: Partial<MetaVerificationRunnerJobData> = {}): MetaVerificationRunnerJobData {
  return {
    reason: input.reason ?? 'Meta verification regression run',
    actor: input.actor ?? 'queue-worker',
    syncHierarchy: input.syncHierarchy ?? true,
    limit: input.limit ?? 25,
    createAdPreflight: input.createAdPreflight,
    promotability: input.promotability,
    duplicateAdPreflight: input.duplicateAdPreflight,
    duplicateTree: input.duplicateTree,
    requestedBy: input.requestedBy ?? 'system',
    requestedAt: input.requestedAt ?? new Date().toISOString()
  };
}

export async function ensureMetaVerificationRunnerQueue() {
  const queue = await startQueue();
  await queue.createQueue(META_VERIFICATION_RUNNER_JOB_NAME);
  return queue;
}

export async function enqueueMetaVerificationRunnerJob(input: Partial<MetaVerificationRunnerJobData> = {}) {
  const payload = buildPayload(input);
  const queue = await ensureMetaVerificationRunnerQueue();

  const jobId = await queue.send(META_VERIFICATION_RUNNER_JOB_NAME, payload, {
    singletonKey: META_VERIFICATION_RUNNER_JOB_NAME,
    singletonSeconds: 60,
    retryLimit: 2,
    retryDelay: 10
  });

  await jobsRepository.upsert({
    jobName: META_VERIFICATION_RUNNER_JOB_NAME,
    status: jobId ? 'queued' : 'deduplicated',
    payload: {
      jobId,
      ...payload
    }
  });

  return {
    ok: true,
    jobId,
    status: jobId ? 'queued' : 'deduplicated',
    queue: META_VERIFICATION_RUNNER_JOB_NAME,
    payload
  };
}

export async function registerMetaVerificationRunnerWorker() {
  const queue = await ensureMetaVerificationRunnerQueue();

  await queue.work<MetaVerificationRunnerJobData>(META_VERIFICATION_RUNNER_JOB_NAME, async (jobs) => {
    const results = [];

    for (const job of jobs) {
      const payload = buildPayload(job.data);

      await jobsRepository.upsert({
        jobName: META_VERIFICATION_RUNNER_JOB_NAME,
        status: 'running',
        payload: {
          workerJobId: job.id,
          startedAt: new Date().toISOString(),
          ...payload
        }
      });

      try {
        const result = await verificationRunnerService.run({
          ...payload,
          actor: payload.actor ?? 'queue-worker'
        });

        await jobsRepository.upsert({
          jobName: META_VERIFICATION_RUNNER_JOB_NAME,
          status: 'succeeded',
          payload: {
            workerJobId: job.id,
            finishedAt: new Date().toISOString(),
            requestedBy: payload.requestedBy,
            requestedAt: payload.requestedAt,
            result
          }
        });

        logger.info({ jobId: job.id }, 'meta verification runner job succeeded');
        results.push({ ok: true, jobId: job.id, result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown meta verification runner failure';

        await jobsRepository.upsert({
          jobName: META_VERIFICATION_RUNNER_JOB_NAME,
          status: 'failed',
          lastError: message,
          payload: {
            workerJobId: job.id,
            failedAt: new Date().toISOString(),
            requestedBy: payload.requestedBy,
            requestedAt: payload.requestedAt,
            reason: payload.reason
          }
        });

        logger.error({ err: error, jobId: job.id }, 'meta verification runner job failed');
        throw error;
      }
    }

    return results;
  });

  if (env.META_VERIFICATION_RUNNER_CRON) {
    const scheduledConfig = parseScheduledConfig();

    if (!scheduledConfig) {
      logger.warn('META_VERIFICATION_RUNNER_CRON is set but META_VERIFICATION_RUNNER_CONFIG_JSON is empty; schedule skipped');
      return;
    }

    await queue.schedule(
      META_VERIFICATION_RUNNER_JOB_NAME,
      env.META_VERIFICATION_RUNNER_CRON,
      buildPayload({
        ...scheduledConfig,
        actor: scheduledConfig.actor ?? 'cron',
        requestedBy: 'cron',
        requestedAt: new Date().toISOString()
      }),
      {
        singletonKey: META_VERIFICATION_RUNNER_JOB_NAME,
        singletonSeconds: 60,
        retryLimit: 2,
        retryDelay: 10
      }
    );

    logger.info({ cron: env.META_VERIFICATION_RUNNER_CRON }, 'meta verification runner schedule enabled');
  }
}
