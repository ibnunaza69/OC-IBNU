import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaAdSetSnapshotRepository } from '../meta-sync/repositories/meta-adset.repository.js';
import { MetaCampaignSnapshotRepository } from '../meta-sync/repositories/meta-campaign.repository.js';
import { MetaApprovalService } from '../meta-write/meta-approval.service.js';
import { MetaClient } from '../providers/meta/meta.client.js';

interface AdSetCreateInput {
  campaignId: string;
  name: string;
  billingEvent: string;
  optimizationGoal: string;
  status?: 'ACTIVE' | 'PAUSED' | undefined;
  targeting: Record<string, unknown>;
  dailyBudget?: number | undefined;
  lifetimeBudget?: number | undefined;
  promotedObject?: Record<string, unknown> | undefined;
  bidStrategy?: string | undefined;
  bidAmount?: number | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
}

interface AdSetCreateRequest {
  draft: AdSetCreateInput;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  confirmHighImpact?: boolean | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

type CampaignSnapshot = NonNullable<Awaited<ReturnType<MetaCampaignSnapshotRepository['getLatestByCampaignId']>>>;

function ensureWriteEnabled(request: { dryRun?: boolean | undefined; secret?: string | undefined; reason: string }) {
  if (!request.reason || request.reason.trim().length < 5) {
    throw new AppError('Write reason is required and must be at least 5 characters', 'VALIDATION_ERROR', 400);
  }

  if (request.dryRun) {
    return {
      ok: true,
      mode: 'dry-run' as const,
      writeEnabled: env.META_WRITE_ENABLED,
      secretRequired: Boolean(env.META_WRITE_SECRET)
    };
  }

  if (!env.META_WRITE_ENABLED) {
    throw new AppError('Meta write gate is disabled', 'POLICY_REJECTED', 403);
  }

  if (env.META_WRITE_SECRET && request.secret !== env.META_WRITE_SECRET) {
    throw new AppError('Invalid write secret', 'PERMISSION_DENIED', 403);
  }

  return {
    ok: true,
    mode: 'live' as const,
    writeEnabled: env.META_WRITE_ENABLED,
    secretRequired: Boolean(env.META_WRITE_SECRET)
  };
}

function normalizeDraft(input: AdSetCreateInput) {
  const name = input.name.trim();
  const campaignId = input.campaignId.trim();
  const billingEvent = input.billingEvent.trim().toUpperCase();
  const optimizationGoal = input.optimizationGoal.trim().toUpperCase();
  const status = input.status ?? 'PAUSED';
  const bidStrategy = input.bidStrategy?.trim().toUpperCase();

  if (name.length < 3) {
    throw new AppError('Ad set name must be at least 3 characters', 'VALIDATION_ERROR', 400);
  }

  if (!campaignId) {
    throw new AppError('campaignId is required', 'VALIDATION_ERROR', 400);
  }

  if (!billingEvent) {
    throw new AppError('billingEvent is required', 'VALIDATION_ERROR', 400);
  }

  if (!optimizationGoal) {
    throw new AppError('optimizationGoal is required', 'VALIDATION_ERROR', 400);
  }

  if (!input.targeting || typeof input.targeting !== 'object' || Array.isArray(input.targeting)) {
    throw new AppError('targeting must be an object', 'VALIDATION_ERROR', 400);
  }

  if (!input.dailyBudget && !input.lifetimeBudget) {
    throw new AppError('Either dailyBudget or lifetimeBudget is required', 'VALIDATION_ERROR', 400);
  }

  if (input.dailyBudget && input.lifetimeBudget) {
    throw new AppError('Provide only one of dailyBudget or lifetimeBudget', 'VALIDATION_ERROR', 400);
  }

  return {
    campaign_id: campaignId,
    name,
    billing_event: billingEvent,
    optimization_goal: optimizationGoal,
    status,
    targeting: input.targeting,
    ...(input.dailyBudget ? { daily_budget: input.dailyBudget } : {}),
    ...(input.lifetimeBudget ? { lifetime_budget: input.lifetimeBudget } : {}),
    ...(input.promotedObject ? { promoted_object: input.promotedObject } : {}),
    ...(bidStrategy ? { bid_strategy: bidStrategy } : {}),
    ...(input.bidAmount ? { bid_amount: input.bidAmount } : {}),
    ...(input.startTime ? { start_time: input.startTime } : {}),
    ...(input.endTime ? { end_time: input.endTime } : {})
  };
}

export class AdSetWriteService {
  private readonly auditRepository = new AuditRepository();
  private readonly approvalService = new MetaApprovalService();
  private readonly metaClient = new MetaClient();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();

  private async ensureParentCampaignExists(campaignId: string): Promise<CampaignSnapshot> {
    const existing = await this.campaignRepository.getLatestByCampaignId(campaignId);
    if (existing) {
      return existing;
    }

    if (!env.META_AD_ACCOUNT_ID) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    try {
      const liveCampaign = await this.metaClient.getCampaign(campaignId);
      const snapshot = await this.campaignRepository.upsert(env.META_AD_ACCOUNT_ID, liveCampaign.data);

      if (!snapshot) {
        throw new AppError('Failed to persist parent campaign snapshot', 'REMOTE_TEMPORARY_FAILURE', 500, {
          campaignId
        });
      }

      return snapshot;
    } catch {
      throw new AppError('Parent campaign not found or not readable', 'RESOURCE_NOT_FOUND', 404, {
        campaignId
      });
    }
  }

  private async refreshAdSetSnapshot(adSetId: string) {
    if (!env.META_AD_ACCOUNT_ID) {
      return {
        snapshotUpdated: false,
        adSetId,
        error: 'META_AD_ACCOUNT_ID is not configured'
      };
    }

    try {
      const liveAdSet = await this.metaClient.getAdSet(adSetId);
      await this.adSetRepository.upsert(env.META_AD_ACCOUNT_ID, liveAdSet.data);

      return {
        snapshotUpdated: true,
        adSetId,
        strategy: 'live-read' as const
      };
    } catch (error) {
      return {
        snapshotUpdated: false,
        adSetId,
        strategy: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown ad set snapshot refresh error'
      };
    }
  }

  private assertHighImpactConfirmation(request: AdSetCreateRequest, draft: ReturnType<typeof normalizeDraft>) {
    if (request.dryRun || draft.status !== 'ACTIVE' || request.confirmHighImpact) {
      return;
    }

    throw new AppError(
      'Live ad set create with ACTIVE status requires confirmHighImpact=true or safer PAUSED rollout',
      'POLICY_REJECTED',
      409,
      {
        reason: request.reason,
        draft,
        recommendation: 'Create ad set in PAUSED status first, then explicitly start it later.'
      }
    );
  }

  async previewCreateAdSet(request: AdSetCreateRequest) {
    const gate = ensureWriteEnabled(request);
    const draft = normalizeDraft(request.draft);
    const parentCampaign = await this.ensureParentCampaignExists(draft.campaign_id);

    await this.auditRepository.create({
      operationType: 'meta.adset.preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'adset',
      targetId: `draft:${draft.name}`,
      status: 'pending',
      reason: request.reason,
      afterState: draft,
      metadata: {
        dryRun: true,
        parentCampaignId: draft.campaign_id,
        parentCampaignSnapshotId: parentCampaign.id,
        writeGate: gate,
        activeRequiresConfirmHighImpact: draft.status === 'ACTIVE'
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      writeGate: gate,
      draft,
      parentCampaign: {
        id: parentCampaign.campaignId,
        name: parentCampaign.name,
        status: parentCampaign.status
      },
      activeRequiresConfirmHighImpact: draft.status === 'ACTIVE'
    };
  }

  async createAdSet(request: AdSetCreateRequest) {
    if (request.dryRun) {
      return this.previewCreateAdSet(request);
    }

    const gate = ensureWriteEnabled(request);
    const draft = normalizeDraft(request.draft);
    const parentCampaign = await this.ensureParentCampaignExists(draft.campaign_id);
    this.assertHighImpactConfirmation(request, draft);

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.adset.create',
      targetType: 'adset',
      targetId: `draft:${draft.name}`,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: draft,
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.createAdSet(draft);
      const adSetId = result.data.id ?? `draft:${draft.name}`;
      const refreshedSnapshot = result.data.id
        ? await this.refreshAdSetSnapshot(result.data.id)
        : {
            snapshotUpdated: false,
            adSetId,
            strategy: 'missing-id' as const,
            error: 'Meta create ad set response did not include ad set id'
          };

      await this.auditRepository.create({
        operationType: 'meta.adset.create',
        actor: request.actor ?? 'internal-api',
        targetType: 'adset',
        targetId: adSetId,
        status: 'success',
        reason: request.reason,
        afterState: {
          draft,
          providerResponse: result.data,
          adSetId
        },
        metadata: {
          dryRun: false,
          parentCampaignId: draft.campaign_id,
          parentCampaignSnapshotId: parentCampaign.id,
          writeGate: gate,
          refreshedSnapshot,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'create-adset',
        adSetId,
        draft,
        parentCampaign: {
          id: parentCampaign.campaignId,
          name: parentCampaign.name,
          status: parentCampaign.status
        },
        result: result.data,
        refreshedSnapshot
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad set create failed');

      await this.auditRepository.create({
        operationType: 'meta.adset.create',
        actor: request.actor ?? 'internal-api',
        targetType: 'adset',
        targetId: `draft:${draft.name}`,
        status: 'failed',
        reason: request.reason,
        afterState: draft,
        metadata: {
          dryRun: false,
          parentCampaignId: draft.campaign_id,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }
}
