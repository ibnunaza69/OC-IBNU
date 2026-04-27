import { env } from '../../config/env.js';
import { configService } from '../../config/settings.js';
import { logger } from '../../lib/logger.js';
import { JobsStateRepository } from '../foundation/jobs/jobs.repository.js';
import { startQueue } from '../foundation/queue/queue.js';
import { MetaSyncService } from './meta-sync.service.js';

export const META_SYNC_HIERARCHY_JOB_NAME = 'meta.sync.hierarchy';

export interface MetaSyncHierarchyJobData {
  accountId: string;
  limit: number;
  requestedBy: string;
  requestedAt: string;
}

const jobsRepository = new JobsStateRepository();
const metaSyncService = new MetaSyncService();

export async function ensureMetaSyncHierarchyQueue() {
  const queue = await startQueue();
  await queue.createQueue(META_SYNC_HIERARCHY_JOB_NAME);
  return queue;
}

export async function enqueueMetaSyncHierarchyJob(input: Partial<MetaSyncHierarchyJobData> = {}) {
  const accountId = input.accountId ?? await configService.getMetaAccountId();

  if (!accountId) {
    throw new Error('META_AD_ACCOUNT_ID is not configured');
  }

  const limit = input.limit ?? 25;
  const requestedBy = input.requestedBy ?? 'system';
  const requestedAt = input.requestedAt ?? new Date().toISOString();

  const queue = await ensureMetaSyncHierarchyQueue();
  const payload: MetaSyncHierarchyJobData = {
    accountId,
    limit,
    requestedBy,
    requestedAt
  };

  const jobId = await queue.send(META_SYNC_HIERARCHY_JOB_NAME, payload, {
    singletonKey: `meta-sync-hierarchy:${accountId}`,
    singletonSeconds: 60,
    retryLimit: 2,
    retryDelay: 5
  });

  await jobsRepository.upsert({
    jobName: META_SYNC_HIERARCHY_JOB_NAME,
    jobKey: accountId,
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
    queue: META_SYNC_HIERARCHY_JOB_NAME,
    payload
  };
}

export async function registerMetaSyncHierarchyWorker() {
  const queue = await ensureMetaSyncHierarchyQueue();

  await queue.work<MetaSyncHierarchyJobData>(META_SYNC_HIERARCHY_JOB_NAME, async (jobs) => {
    const results = [];

    for (const job of jobs) {
      const data = job.data;
      const accountId = data.accountId ?? await configService.getMetaAccountId();

      if (!accountId) {
        throw new Error('META_AD_ACCOUNT_ID is not configured');
      }

      await jobsRepository.upsert({
        jobName: META_SYNC_HIERARCHY_JOB_NAME,
        jobKey: accountId,
        status: 'running',
        payload: {
          workerJobId: job.id,
          startedAt: new Date().toISOString(),
          ...data
        }
      });

      try {
        const result = await metaSyncService.syncAccountHierarchy(data.limit ?? 25, accountId);

        await jobsRepository.upsert({
          jobName: META_SYNC_HIERARCHY_JOB_NAME,
          jobKey: accountId,
          status: 'succeeded',
          payload: {
            workerJobId: job.id,
            finishedAt: new Date().toISOString(),
            accountId,
            limit: data.limit ?? 25,
            campaignCount: result.campaigns.length,
            adSetCount: result.adSets.length,
            adCount: result.ads.length,
            requestedBy: data.requestedBy,
            requestedAt: data.requestedAt
          }
        });

        logger.info({ jobId: job.id, accountId }, 'meta sync hierarchy job succeeded');

        results.push({
          ok: true,
          jobId: job.id,
          accountId,
          campaignCount: result.campaigns.length,
          adSetCount: result.adSets.length,
          adCount: result.ads.length
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown meta sync hierarchy failure';

        await jobsRepository.upsert({
          jobName: META_SYNC_HIERARCHY_JOB_NAME,
          jobKey: accountId,
          status: 'failed',
          lastError: message,
          payload: {
            workerJobId: job.id,
            failedAt: new Date().toISOString(),
            accountId,
            limit: data.limit ?? 25,
            requestedBy: data.requestedBy,
            requestedAt: data.requestedAt
          }
        });

        logger.error({ err: error, jobId: job.id, accountId }, 'meta sync hierarchy job failed');
        throw error;
      }
    }

    return results;
  });

  if (env.META_SYNC_HIERARCHY_CRON) {
    await queue.schedule(
      META_SYNC_HIERARCHY_JOB_NAME,
      env.META_SYNC_HIERARCHY_CRON,
      {
        accountId: env.META_AD_ACCOUNT_ID ?? '',
        limit: 25,
        requestedBy: 'cron',
        requestedAt: new Date().toISOString()
      },
      {
        singletonKey: `meta-sync-hierarchy:${env.META_AD_ACCOUNT_ID ?? 'default'}`,
        singletonSeconds: 60,
        retryLimit: 2,
        retryDelay: 5
      }
    );

    logger.info({ cron: env.META_SYNC_HIERARCHY_CRON }, 'meta sync hierarchy schedule enabled');
  }
}
