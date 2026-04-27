import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaCampaignSnapshotRepository } from '../meta-sync/repositories/meta-campaign.repository.js';
import { MetaAdSetSnapshotRepository } from '../meta-sync/repositories/meta-adset.repository.js';
import { MetaApprovalService } from '../meta-write/meta-approval.service.js';
import { MetaClient } from '../providers/meta/meta.client.js';

function parseBudget(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}

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

export interface BudgetControlRequest {
  targetType: 'campaign' | 'adset';
  targetId: string;
  mutationType: 'set_amount' | 'increase_amount' | 'decrease_amount' | 'increase_percent' | 'decrease_percent';
  value: number;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

export class BudgetControlService {
  private readonly auditRepository = new AuditRepository();
  private readonly metaClient = new MetaClient();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();
  private readonly approvalService = new MetaApprovalService();

  async adjustBudget(request: BudgetControlRequest) {
    const gate = ensureWriteEnabled(request);

    let budgetOwnerType: 'campaign' | 'adset' = request.targetType;
    let budgetOwnerId = request.targetId;
    let currentDailyBudget: number | null = null;
    let snapshotId: string | undefined;

    if (request.targetType === 'campaign') {
      const campaign = await this.campaignRepository.getLatestByCampaignId(request.targetId);
      if (!campaign) {
        throw new AppError('Campaign snapshot not found', 'RESOURCE_NOT_FOUND', 404);
      }
      
      currentDailyBudget = parseBudget(campaign.dailyBudget);
      snapshotId = campaign.id;
      
      if (currentDailyBudget === null) {
        throw new AppError('Campaign does not have a daily budget (CBO might be off)', 'VALIDATION_ERROR', 400);
      }
    } else {
      const adSet = await this.adSetRepository.getLatestByAdSetId(request.targetId);
      if (!adSet) {
        throw new AppError('AdSet snapshot not found', 'RESOURCE_NOT_FOUND', 404);
      }
      
      currentDailyBudget = parseBudget(adSet.dailyBudget);
      snapshotId = adSet.id;
      
      if (currentDailyBudget === null && adSet.campaignId) {
        const campaign = await this.campaignRepository.getLatestByCampaignId(adSet.campaignId);
        if (campaign) {
          const campaignBudget = parseBudget(campaign.dailyBudget);
          if (campaignBudget !== null) {
            throw new AppError('Cannot mutate Ad Set budget because parent Campaign uses Campaign Budget Optimization (CBO)', 'POLICY_REJECTED', 409);
          }
        }
      }
      
      if (currentDailyBudget === null) {
        throw new AppError('Neither AdSet nor its parent Campaign have a daily budget', 'VALIDATION_ERROR', 400);
      }
    }

    let nextDailyBudget = currentDailyBudget;

    switch (request.mutationType) {
      case 'set_amount':
        nextDailyBudget = request.value;
        break;
      case 'increase_amount':
        nextDailyBudget += request.value;
        break;
      case 'decrease_amount':
        nextDailyBudget -= request.value;
        break;
      case 'increase_percent':
        nextDailyBudget = Math.trunc(currentDailyBudget * (1 + request.value / 100));
        break;
      case 'decrease_percent':
        nextDailyBudget = Math.trunc(currentDailyBudget * (1 - request.value / 100));
        break;
      default:
        throw new AppError('Invalid mutation type', 'VALIDATION_ERROR', 400);
    }

    if (nextDailyBudget <= 0) {
      throw new AppError('Next daily budget must be greater than 0', 'VALIDATION_ERROR', 400);
    }

    const delta = nextDailyBudget - currentDailyBudget;
    
    if (request.dryRun) {
      await this.auditRepository.create({
        operationType: 'budget.adjust.preview',
        actor: request.actor ?? 'internal-api',
        targetType: budgetOwnerType,
        targetId: budgetOwnerId,
        status: 'pending',
        reason: request.reason,
        beforeState: {
          dailyBudget: currentDailyBudget,
          snapshotId
        },
        afterState: {
          dailyBudget: nextDailyBudget
        },
        metadata: {
          dryRun: true,
          delta,
          mutationType: request.mutationType,
          originalTargetType: request.targetType,
          originalTargetId: request.targetId,
          writeGate: gate
        }
      });
      
      return {
        ok: true,
        mode: 'dry-run',
        budgetOwnerType,
        budgetOwnerId,
        currentDailyBudget,
        nextDailyBudget,
        delta,
        writeGate: gate
      };
    }

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.budget.change',
      targetType: budgetOwnerType,
      targetId: budgetOwnerId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: {
        nextDailyBudget,
        mutationType: request.mutationType
      },
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      let result;
      if (budgetOwnerType === 'campaign') {
        result = await this.metaClient.updateCampaignDailyBudget(budgetOwnerId, nextDailyBudget);
        if (env.META_AD_ACCOUNT_ID) {
          const liveCampaign = await this.metaClient.getCampaign(budgetOwnerId);
          await this.campaignRepository.upsert(env.META_AD_ACCOUNT_ID, liveCampaign.data);
        }
      } else {
        result = await this.metaClient.updateAdSetDailyBudget(budgetOwnerId, nextDailyBudget);
        if (env.META_AD_ACCOUNT_ID) {
          const liveAdSet = await this.metaClient.getAdSet(budgetOwnerId);
          await this.adSetRepository.upsert(env.META_AD_ACCOUNT_ID, liveAdSet.data);
        }
      }

      await this.auditRepository.create({
        operationType: 'budget.adjust',
        actor: request.actor ?? 'internal-api',
        targetType: budgetOwnerType,
        targetId: budgetOwnerId,
        status: 'success',
        reason: request.reason,
        beforeState: {
          dailyBudget: currentDailyBudget,
          snapshotId
        },
        afterState: {
          dailyBudget: nextDailyBudget,
          providerResponse: result.data
        },
        metadata: {
          dryRun: false,
          delta,
          mutationType: request.mutationType,
          originalTargetType: request.targetType,
          originalTargetId: request.targetId,
          writeGate: gate,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        budgetOwnerType,
        budgetOwnerId,
        currentDailyBudget,
        nextDailyBudget,
        delta,
        result: result.data,
        writeGate: gate
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta budget adjust failed');
      
      await this.auditRepository.create({
        operationType: 'budget.adjust',
        actor: request.actor ?? 'internal-api',
        targetType: budgetOwnerType,
        targetId: budgetOwnerId,
        status: 'failed',
        reason: request.reason,
        beforeState: {
          dailyBudget: currentDailyBudget,
          snapshotId
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
}
