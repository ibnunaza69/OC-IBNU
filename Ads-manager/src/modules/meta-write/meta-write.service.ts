import { AppError } from '../../lib/errors.js';
import { env } from '../../config/env.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { enqueueMetaSyncHierarchyJob } from '../meta-sync/meta-sync.queue.js';
import { MetaAdSnapshotRepository } from '../meta-sync/repositories/meta-ad.repository.js';
import { MetaCampaignSnapshotRepository } from '../meta-sync/repositories/meta-campaign.repository.js';
import { MetaClient } from '../providers/meta/meta.client.js';
import { MetaApprovalService } from './meta-approval.service.js';
import { MetaWriteGate } from './meta-write.gate.js';
import type { MetaBudgetWriteRequest, MetaStatusWriteRequest } from './meta-write.types.js';
import type { MetaAdSummary, MetaCampaignSummary } from '../providers/meta/meta.types.js';

function getSnapshotStatus(snapshot: { status: string | null; effectiveStatus?: string | null }) {
  return snapshot.effectiveStatus ?? snapshot.status ?? null;
}

function parseBudget(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

const TRANSIENT_META_STATUSES = new Set(['IN_PROCESS']);
const SNAPSHOT_SETTLE_MAX_ATTEMPTS = 4;
const SNAPSHOT_SETTLE_DELAY_MS = 1500;

function isTransientMetaStatus(value: string | null | undefined) {
  return value ? TRANSIENT_META_STATUSES.has(value) : false;
}

function hasTransientMetaStatus(payload: { status?: string; effective_status?: string }) {
  return isTransientMetaStatus(payload.status) || isTransientMetaStatus(payload.effective_status);
}

function getLivePayloadStatus(payload: { status?: string; effective_status?: string }) {
  return payload.effective_status ?? payload.status ?? null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RefreshSnapshotResult {
  strategy: 'live-read' | 'optimistic-fallback' | 'failed';
  snapshotUpdated: boolean;
  settled: boolean;
  attempts: number;
  error?: string;
}

type CampaignSnapshot = NonNullable<Awaited<ReturnType<MetaCampaignSnapshotRepository['getLatestByCampaignId']>>>;
type AdSnapshot = NonNullable<Awaited<ReturnType<MetaAdSnapshotRepository['getLatestByAdId']>>>;

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as T;
}

export class MetaWriteService {
  private readonly gate = new MetaWriteGate();
  private readonly approvalService = new MetaApprovalService();
  private readonly auditRepository = new AuditRepository();
  private readonly metaClient = new MetaClient();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();
  private readonly adRepository = new MetaAdSnapshotRepository();

  private async readCampaignUntil(
    campaignId: string,
    accountId: string,
    predicate: (payload: MetaCampaignSummary) => boolean
  ) {
    let attempts = 0;
    let latest: MetaCampaignSummary | null = null;

    while (attempts < SNAPSHOT_SETTLE_MAX_ATTEMPTS) {
      if (attempts > 0) {
        await sleep(SNAPSHOT_SETTLE_DELAY_MS);
      }

      const liveCampaign = await this.metaClient.getCampaign(campaignId);
      latest = liveCampaign.data;
      await this.campaignRepository.upsert(accountId, latest);
      attempts += 1;

      if (predicate(latest)) {
        return {
          payload: latest,
          attempts,
          settled: true
        };
      }
    }

    if (!latest) {
      throw new AppError('Campaign refresh did not return payload', 'REMOTE_TEMPORARY_FAILURE', 502);
    }

    return {
      payload: latest,
      attempts,
      settled: false
    };
  }

  private async readAdUntil(
    adId: string,
    accountId: string,
    predicate: (payload: MetaAdSummary) => boolean
  ) {
    let attempts = 0;
    let latest: MetaAdSummary | null = null;

    while (attempts < SNAPSHOT_SETTLE_MAX_ATTEMPTS) {
      if (attempts > 0) {
        await sleep(SNAPSHOT_SETTLE_DELAY_MS);
      }

      const liveAd = await this.metaClient.getAd(adId);
      latest = liveAd.data;
      await this.adRepository.upsert(accountId, latest);
      attempts += 1;

      if (predicate(latest)) {
        return {
          payload: latest,
          attempts,
          settled: true
        };
      }
    }

    if (!latest) {
      throw new AppError('Ad refresh did not return payload', 'REMOTE_TEMPORARY_FAILURE', 502);
    }

    return {
      payload: latest,
      attempts,
      settled: false
    };
  }

  private buildOptimisticCampaignPayload(
    snapshot: CampaignSnapshot,
    overrides: Partial<MetaCampaignSummary>
  ): MetaCampaignSummary {
    const rawPayload = (snapshot.rawPayload ?? {}) as Partial<MetaCampaignSummary>;

    return compactObject({
      id: snapshot.campaignId,
      name: overrides.name ?? rawPayload.name,
      objective: overrides.objective ?? rawPayload.objective,
      status: overrides.status ?? rawPayload.status ?? snapshot.status ?? undefined,
      effective_status: overrides.effective_status ?? rawPayload.effective_status ?? snapshot.effectiveStatus ?? undefined,
      buying_type: overrides.buying_type ?? rawPayload.buying_type,
      daily_budget: overrides.daily_budget ?? rawPayload.daily_budget ?? snapshot.dailyBudget ?? undefined,
      lifetime_budget: overrides.lifetime_budget ?? rawPayload.lifetime_budget ?? snapshot.lifetimeBudget ?? undefined,
      start_time: overrides.start_time ?? rawPayload.start_time ?? snapshot.startTime?.toISOString(),
      stop_time: overrides.stop_time ?? rawPayload.stop_time ?? snapshot.stopTime?.toISOString(),
      updated_time: overrides.updated_time ?? new Date().toISOString()
    }) as MetaCampaignSummary;
  }

  private buildOptimisticAdPayload(
    snapshot: AdSnapshot,
    overrides: Partial<MetaAdSummary>
  ): MetaAdSummary {
    const rawPayload = (snapshot.rawPayload ?? {}) as Partial<MetaAdSummary>;

    return compactObject({
      id: snapshot.adId,
      campaign_id: overrides.campaign_id ?? rawPayload.campaign_id ?? snapshot.campaignId ?? undefined,
      adset_id: overrides.adset_id ?? rawPayload.adset_id ?? snapshot.adSetId ?? undefined,
      name: overrides.name ?? rawPayload.name,
      status: overrides.status ?? rawPayload.status ?? snapshot.status ?? undefined,
      effective_status: overrides.effective_status ?? rawPayload.effective_status ?? snapshot.effectiveStatus ?? undefined,
      creative: overrides.creative ?? rawPayload.creative ?? undefined,
      updated_time: overrides.updated_time ?? new Date().toISOString()
    }) as MetaAdSummary;
  }

  private async refreshStatusTargetSnapshot(
    request: MetaStatusWriteRequest,
    snapshot: CampaignSnapshot | AdSnapshot
  ): Promise<RefreshSnapshotResult> {
    try {
      if (request.targetType === 'campaign') {
        const settledCampaign = await this.readCampaignUntil(
          request.targetId,
          snapshot.accountId,
          (payload) => getLivePayloadStatus(payload) === request.nextStatus && !hasTransientMetaStatus(payload)
        );

        return {
          strategy: 'live-read',
          snapshotUpdated: true,
          settled: settledCampaign.settled,
          attempts: settledCampaign.attempts
        };
      } else {
        const settledAd = await this.readAdUntil(
          request.targetId,
          snapshot.accountId,
          (payload) => getLivePayloadStatus(payload) === request.nextStatus && !hasTransientMetaStatus(payload)
        );

        return {
          strategy: 'live-read',
          snapshotUpdated: true,
          settled: settledAd.settled,
          attempts: settledAd.attempts
        };
      }
    } catch (error) {
      try {
        if (request.targetType === 'campaign') {
          await this.campaignRepository.upsert(
            snapshot.accountId,
            this.buildOptimisticCampaignPayload(snapshot as CampaignSnapshot, {
              id: request.targetId,
              status: request.nextStatus,
              effective_status: request.nextStatus
            })
          );
        } else {
          await this.adRepository.upsert(
            snapshot.accountId,
            this.buildOptimisticAdPayload(snapshot as AdSnapshot, {
              id: request.targetId,
              status: request.nextStatus,
              effective_status: request.nextStatus
            })
          );
        }

        return {
          strategy: 'optimistic-fallback',
          snapshotUpdated: true,
          settled: false,
          attempts: 1,
          error: error instanceof Error ? error.message : 'Unknown snapshot refresh error'
        };
      } catch (fallbackError) {
        return {
          strategy: 'failed',
          snapshotUpdated: false,
          settled: false,
          attempts: 1,
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown snapshot refresh error'
        };
      }
    }
  }

  private async refreshCampaignBudgetSnapshot(
    snapshot: CampaignSnapshot,
    nextDailyBudget: number
  ): Promise<RefreshSnapshotResult> {
    try {
      const settledCampaign = await this.readCampaignUntil(
        snapshot.campaignId,
        snapshot.accountId,
        (payload) => payload.daily_budget === String(nextDailyBudget) && !hasTransientMetaStatus(payload)
      );

      return {
        strategy: 'live-read',
        snapshotUpdated: true,
        settled: settledCampaign.settled,
        attempts: settledCampaign.attempts
      };
    } catch (error) {
      try {
        await this.campaignRepository.upsert(
          snapshot.accountId,
          this.buildOptimisticCampaignPayload(snapshot, {
            id: snapshot.campaignId,
            daily_budget: String(nextDailyBudget)
          })
        );

        return {
          strategy: 'optimistic-fallback',
          snapshotUpdated: true,
          settled: false,
          attempts: 1,
          error: error instanceof Error ? error.message : 'Unknown snapshot refresh error'
        };
      } catch (fallbackError) {
        return {
          strategy: 'failed',
          snapshotUpdated: false,
          settled: false,
          attempts: 1,
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown snapshot refresh error'
        };
      }
    }
  }

  private async getTargetSnapshot(request: MetaStatusWriteRequest) {
    if (request.targetType === 'campaign') {
      const snapshot = await this.campaignRepository.getLatestByCampaignId(request.targetId);
      if (!snapshot) {
        throw new AppError('Campaign snapshot not found. Sync first before attempting write.', 'RESOURCE_NOT_FOUND', 404);
      }
      return snapshot;
    }

    const snapshot = await this.adRepository.getLatestByAdId(request.targetId);
    if (!snapshot) {
      throw new AppError('Ad snapshot not found. Sync first before attempting write.', 'RESOURCE_NOT_FOUND', 404);
    }
    return snapshot;
  }

  async previewStatusChange(request: MetaStatusWriteRequest) {
    const gate = this.gate.assertAllowed({ ...request, dryRun: true });
    const snapshot = await this.getTargetSnapshot(request);
    const currentStatus = getSnapshotStatus(snapshot);
    const noOp = currentStatus === request.nextStatus;

    const preview = {
      targetType: request.targetType,
      targetId: request.targetId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      currentStatus: currentStatus ?? null,
      nextStatus: request.nextStatus,
      noOp,
      dryRun: true,
      writeGate: gate,
      snapshotUpdatedAt: snapshot.updatedAt,
      snapshotSyncedAt: snapshot.syncedAt
    };

    await this.auditRepository.create({
      operationType: 'meta.write.preview',
      actor: request.actor ?? 'internal-api',
      targetType: request.targetType,
      targetId: request.targetId,
      status: 'pending',
      reason: request.reason,
      beforeState: {
        status: currentStatus ?? null,
        snapshotId: snapshot.id
      },
      afterState: {
        status: request.nextStatus
      },
      metadata: {
        dryRun: true,
        noOp,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      preview
    };
  }

  async changeStatus(request: MetaStatusWriteRequest) {
    if (request.dryRun) {
      return this.previewStatusChange(request);
    }

    const gate = this.gate.assertAllowed(request);
    const snapshot = await this.getTargetSnapshot(request);
    const currentStatus = getSnapshotStatus(snapshot);

    if (currentStatus === request.nextStatus) {
      throw new AppError('Target is already in the requested status', 'POLICY_REJECTED', 409);
    }

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.write.status-change',
      targetType: request.targetType,
      targetId: request.targetId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: {
        nextStatus: request.nextStatus
      },
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = request.targetType === 'campaign'
        ? await this.metaClient.updateCampaignStatus(request.targetId, request.nextStatus)
        : await this.metaClient.updateAdStatus(request.targetId, request.nextStatus);
      const refreshedSnapshot = await this.refreshStatusTargetSnapshot(request, snapshot);

      await this.auditRepository.create({
        operationType: 'meta.write.status-change',
        actor: request.actor ?? 'internal-api',
        targetType: request.targetType,
        targetId: request.targetId,
        status: 'success',
        reason: request.reason,
        beforeState: {
          status: currentStatus ?? null,
          snapshotId: snapshot.id
        },
        afterState: {
          status: request.nextStatus,
          providerResponse: result.data
        },
        metadata: {
          dryRun: false,
          writeGate: gate,
          refreshedSnapshot,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      await enqueueMetaSyncHierarchyJob({
        requestedBy: `write:${request.actor ?? 'internal-api'}`,
        limit: 25
      });

      return {
        ok: true,
        mode: 'live',
        targetType: request.targetType,
        targetId: request.targetId,
        previousStatus: currentStatus ?? null,
        nextStatus: request.nextStatus,
        result: result.data,
        refreshScheduled: true
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta write failed');

      await this.auditRepository.create({
        operationType: 'meta.write.status-change',
        actor: request.actor ?? 'internal-api',
        targetType: request.targetType,
        targetId: request.targetId,
        status: 'failed',
        reason: request.reason,
        beforeState: {
          status: currentStatus ?? null,
          snapshotId: snapshot.id
        },
        afterState: {
          status: request.nextStatus
        },
        metadata: {
          dryRun: false,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }

  async previewCampaignBudgetChange(request: MetaBudgetWriteRequest) {
    const gate = this.gate.assertBudgetAllowed({ ...request, dryRun: true });
    const snapshot = await this.campaignRepository.getLatestByCampaignId(request.targetId);

    if (!snapshot) {
      throw new AppError('Campaign snapshot not found. Sync first before attempting budget change.', 'RESOURCE_NOT_FOUND', 404);
    }

    const currentDailyBudget = parseBudget(snapshot.dailyBudget);

    if (!currentDailyBudget) {
      throw new AppError('Campaign daily budget is unavailable in snapshot', 'VALIDATION_ERROR', 400);
    }

    const delta = request.nextDailyBudget - currentDailyBudget;
    const deltaAbsolute = Math.abs(delta);
    const deltaPercent = currentDailyBudget > 0 ? Number(((deltaAbsolute / currentDailyBudget) * 100).toFixed(2)) : null;
    const noOp = delta === 0;
    const withinAbsoluteLimit = deltaAbsolute <= env.META_BUDGET_MAX_ABSOLUTE_DELTA;
    const withinPercentLimit = deltaPercent === null ? false : deltaPercent <= env.META_BUDGET_MAX_PERCENT_DELTA;
    const withinGuardrail = noOp || (withinAbsoluteLimit && withinPercentLimit);

    const preview = {
      targetType: request.targetType,
      targetId: request.targetId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      currentDailyBudget,
      nextDailyBudget: request.nextDailyBudget,
      delta,
      deltaAbsolute,
      deltaPercent,
      direction: delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'unchanged',
      noOp,
      withinGuardrail,
      guardrail: {
        maxAbsoluteDelta: env.META_BUDGET_MAX_ABSOLUTE_DELTA,
        maxPercentDelta: env.META_BUDGET_MAX_PERCENT_DELTA,
        withinAbsoluteLimit,
        withinPercentLimit
      },
      dryRun: true,
      writeGate: gate,
      snapshotUpdatedAt: snapshot.updatedAt,
      snapshotSyncedAt: snapshot.syncedAt
    };

    await this.auditRepository.create({
      operationType: 'meta.budget.preview',
      actor: request.actor ?? 'internal-api',
      targetType: request.targetType,
      targetId: request.targetId,
      status: 'pending',
      reason: request.reason,
      beforeState: {
        dailyBudget: currentDailyBudget,
        snapshotId: snapshot.id
      },
      afterState: {
        dailyBudget: request.nextDailyBudget
      },
      metadata: {
        dryRun: true,
        noOp,
        withinGuardrail,
        delta,
        deltaAbsolute,
        deltaPercent,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      preview
    };
  }

  async changeCampaignBudget(request: MetaBudgetWriteRequest) {
    if (request.dryRun) {
      return this.previewCampaignBudgetChange(request);
    }

    const gate = this.gate.assertBudgetAllowed(request);
    const snapshot = await this.campaignRepository.getLatestByCampaignId(request.targetId);

    if (!snapshot) {
      throw new AppError('Campaign snapshot not found. Sync first before attempting budget change.', 'RESOURCE_NOT_FOUND', 404);
    }

    const currentDailyBudget = parseBudget(snapshot.dailyBudget);

    if (!currentDailyBudget) {
      throw new AppError('Campaign daily budget is unavailable in snapshot', 'VALIDATION_ERROR', 400);
    }

    const delta = request.nextDailyBudget - currentDailyBudget;
    const deltaAbsolute = Math.abs(delta);
    const deltaPercent = currentDailyBudget > 0 ? Number(((deltaAbsolute / currentDailyBudget) * 100).toFixed(2)) : null;

    if (delta === 0) {
      throw new AppError('Campaign budget is already at the requested value', 'POLICY_REJECTED', 409);
    }

    if (deltaAbsolute > env.META_BUDGET_MAX_ABSOLUTE_DELTA) {
      throw new AppError('Budget delta exceeds absolute guardrail', 'POLICY_REJECTED', 409, {
        maxAbsoluteDelta: env.META_BUDGET_MAX_ABSOLUTE_DELTA,
        deltaAbsolute
      });
    }

    if (deltaPercent !== null && deltaPercent > env.META_BUDGET_MAX_PERCENT_DELTA) {
      throw new AppError('Budget delta exceeds percent guardrail', 'POLICY_REJECTED', 409, {
        maxPercentDelta: env.META_BUDGET_MAX_PERCENT_DELTA,
        deltaPercent
      });
    }

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.budget.change',
      targetType: request.targetType,
      targetId: request.targetId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: {
        nextDailyBudget: request.nextDailyBudget
      },
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.updateCampaignDailyBudget(request.targetId, request.nextDailyBudget);
      const refreshedSnapshot = await this.refreshCampaignBudgetSnapshot(snapshot, request.nextDailyBudget);

      await this.auditRepository.create({
        operationType: 'meta.budget.change',
        actor: request.actor ?? 'internal-api',
        targetType: request.targetType,
        targetId: request.targetId,
        status: 'success',
        reason: request.reason,
        beforeState: {
          dailyBudget: currentDailyBudget,
          snapshotId: snapshot.id
        },
        afterState: {
          dailyBudget: request.nextDailyBudget,
          providerResponse: result.data
        },
        metadata: {
          dryRun: false,
          delta,
          deltaAbsolute,
          deltaPercent,
          refreshedSnapshot,
          writeGate: gate,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      await enqueueMetaSyncHierarchyJob({
        requestedBy: `budget:${request.actor ?? 'internal-api'}`,
        limit: 25
      });

      return {
        ok: true,
        mode: 'live',
        targetType: request.targetType,
        targetId: request.targetId,
        previousDailyBudget: currentDailyBudget,
        nextDailyBudget: request.nextDailyBudget,
        delta,
        deltaPercent,
        result: result.data,
        refreshScheduled: true
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta budget change failed');

      await this.auditRepository.create({
        operationType: 'meta.budget.change',
        actor: request.actor ?? 'internal-api',
        targetType: request.targetType,
        targetId: request.targetId,
        status: 'failed',
        reason: request.reason,
        beforeState: {
          dailyBudget: currentDailyBudget,
          snapshotId: snapshot.id
        },
        afterState: {
          dailyBudget: request.nextDailyBudget
        },
        metadata: {
          dryRun: false,
          delta,
          deltaAbsolute,
          deltaPercent,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }

  async startCampaign(targetId: string, reason: string, options: Pick<MetaStatusWriteRequest, 'dryRun' | 'actor' | 'secret' | 'approvalId' | 'approvalToken'> = {}) {
    return this.changeStatus({
      targetType: 'campaign',
      targetId,
      nextStatus: 'ACTIVE',
      reason,
      dryRun: options.dryRun,
      actor: options.actor,
      secret: options.secret,
      approvalId: options.approvalId,
      approvalToken: options.approvalToken
    });
  }

  async stopCampaign(targetId: string, reason: string, options: Pick<MetaStatusWriteRequest, 'dryRun' | 'actor' | 'secret' | 'approvalId' | 'approvalToken'> = {}) {
    return this.changeStatus({
      targetType: 'campaign',
      targetId,
      nextStatus: 'PAUSED',
      reason,
      dryRun: options.dryRun,
      actor: options.actor,
      secret: options.secret,
      approvalId: options.approvalId,
      approvalToken: options.approvalToken
    });
  }

  async startAd(targetId: string, reason: string, options: Pick<MetaStatusWriteRequest, 'dryRun' | 'actor' | 'secret' | 'approvalId' | 'approvalToken'> = {}) {
    return this.changeStatus({
      targetType: 'ad',
      targetId,
      nextStatus: 'ACTIVE',
      reason,
      dryRun: options.dryRun,
      actor: options.actor,
      secret: options.secret,
      approvalId: options.approvalId,
      approvalToken: options.approvalToken
    });
  }

  async stopAd(targetId: string, reason: string, options: Pick<MetaStatusWriteRequest, 'dryRun' | 'actor' | 'secret' | 'approvalId' | 'approvalToken'> = {}) {
    return this.changeStatus({
      targetType: 'ad',
      targetId,
      nextStatus: 'PAUSED',
      reason,
      dryRun: options.dryRun,
      actor: options.actor,
      secret: options.secret,
      approvalId: options.approvalId,
      approvalToken: options.approvalToken
    });
  }

  async increaseCampaignBudget(targetId: string, amount: number, reason: string, options: Pick<MetaBudgetWriteRequest, 'dryRun' | 'actor' | 'secret' | 'approvalId' | 'approvalToken'> = {}) {
    const snapshot = await this.campaignRepository.getLatestByCampaignId(targetId);

    if (!snapshot) {
      throw new AppError('Campaign snapshot not found. Sync first before attempting budget change.', 'RESOURCE_NOT_FOUND', 404);
    }

    const currentDailyBudget = parseBudget(snapshot.dailyBudget);

    if (!currentDailyBudget) {
      throw new AppError('Campaign daily budget is unavailable in snapshot', 'VALIDATION_ERROR', 400);
    }

    return this.changeCampaignBudget({
      targetType: 'campaign',
      targetId,
      nextDailyBudget: currentDailyBudget + amount,
      reason,
      dryRun: options.dryRun,
      actor: options.actor,
      secret: options.secret,
      approvalId: options.approvalId,
      approvalToken: options.approvalToken
    });
  }

  async decreaseCampaignBudget(targetId: string, amount: number, reason: string, options: Pick<MetaBudgetWriteRequest, 'dryRun' | 'actor' | 'secret' | 'approvalId' | 'approvalToken'> = {}) {
    const snapshot = await this.campaignRepository.getLatestByCampaignId(targetId);

    if (!snapshot) {
      throw new AppError('Campaign snapshot not found. Sync first before attempting budget change.', 'RESOURCE_NOT_FOUND', 404);
    }

    const currentDailyBudget = parseBudget(snapshot.dailyBudget);

    if (!currentDailyBudget) {
      throw new AppError('Campaign daily budget is unavailable in snapshot', 'VALIDATION_ERROR', 400);
    }

    return this.changeCampaignBudget({
      targetType: 'campaign',
      targetId,
      nextDailyBudget: Math.max(1, currentDailyBudget - amount),
      reason,
      dryRun: options.dryRun,
      actor: options.actor,
      secret: options.secret,
      approvalId: options.approvalId,
      approvalToken: options.approvalToken
    });
  }
}
