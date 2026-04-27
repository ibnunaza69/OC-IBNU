import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaCampaignSnapshotRepository } from '../meta-sync/repositories/meta-campaign.repository.js';
import { MetaApprovalService } from '../meta-write/meta-approval.service.js';
import { MetaClient } from '../providers/meta/meta.client.js';

interface CampaignCreateInput {
  name: string;
  objective: string;
  status?: 'ACTIVE' | 'PAUSED' | undefined;
  buyingType?: string | undefined;
  isAdSetBudgetSharingEnabled?: boolean | undefined;
  specialAdCategories?: string[] | undefined;
}

interface CampaignCreateRequest {
  draft: CampaignCreateInput;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  confirmHighImpact?: boolean | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

function normalizeDraft(input: CampaignCreateInput) {
  const name = input.name.trim();
  const objective = input.objective.trim().toUpperCase();
  const status = input.status ?? 'PAUSED';
  const buyingType = input.buyingType?.trim().toUpperCase();
  const specialAdCategories = [...new Set((input.specialAdCategories ?? []).map((item) => item.trim().toUpperCase()).filter(Boolean))];

  if (name.length < 3) {
    throw new AppError('Campaign name must be at least 3 characters', 'VALIDATION_ERROR', 400);
  }

  if (!objective) {
    throw new AppError('Campaign objective is required', 'VALIDATION_ERROR', 400);
  }

  return {
    name,
    objective,
    status,
    is_adset_budget_sharing_enabled: input.isAdSetBudgetSharingEnabled ?? false,
    ...(buyingType ? { buying_type: buyingType } : {}),
    special_ad_categories: specialAdCategories
  };
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

export class CampaignWriteService {
  private readonly auditRepository = new AuditRepository();
  private readonly approvalService = new MetaApprovalService();
  private readonly metaClient = new MetaClient();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();

  private async refreshCampaignSnapshot(campaignId: string) {
    if (!env.META_AD_ACCOUNT_ID) {
      return {
        snapshotUpdated: false,
        campaignId,
        error: 'META_AD_ACCOUNT_ID is not configured'
      };
    }

    try {
      const liveCampaign = await this.metaClient.getCampaign(campaignId);
      await this.campaignRepository.upsert(env.META_AD_ACCOUNT_ID, liveCampaign.data);

      return {
        snapshotUpdated: true,
        campaignId,
        strategy: 'live-read' as const
      };
    } catch (error) {
      return {
        snapshotUpdated: false,
        campaignId,
        strategy: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown campaign snapshot refresh error'
      };
    }
  }

  private assertHighImpactConfirmation(request: CampaignCreateRequest, draft: ReturnType<typeof normalizeDraft>) {
    if (request.dryRun || draft.status !== 'ACTIVE' || request.confirmHighImpact) {
      return;
    }

    throw new AppError(
      'Live campaign create with ACTIVE status requires confirmHighImpact=true or safer PAUSED rollout',
      'POLICY_REJECTED',
      409,
      {
        reason: request.reason,
        draft,
        recommendation: 'Create campaign in PAUSED status first, then explicitly start it later.'
      }
    );
  }

  async previewCreateCampaign(request: CampaignCreateRequest) {
    const gate = ensureWriteEnabled(request);
    const draft = normalizeDraft(request.draft);

    await this.auditRepository.create({
      operationType: 'meta.campaign.preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'campaign',
      targetId: `draft:${draft.name}`,
      status: 'pending',
      reason: request.reason,
      afterState: draft,
      metadata: {
        dryRun: true,
        writeGate: gate,
        activeRequiresConfirmHighImpact: draft.status === 'ACTIVE'
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      writeGate: gate,
      draft,
      activeRequiresConfirmHighImpact: draft.status === 'ACTIVE'
    };
  }

  async createCampaign(request: CampaignCreateRequest) {
    if (request.dryRun) {
      return this.previewCreateCampaign(request);
    }

    const gate = ensureWriteEnabled(request);
    const draft = normalizeDraft(request.draft);
    this.assertHighImpactConfirmation(request, draft);

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.campaign.create',
      targetType: 'campaign',
      targetId: `draft:${draft.name}`,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: draft,
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.createCampaign(draft);
      const campaignId = result.data.id ?? `draft:${draft.name}`;
      const refreshedSnapshot = result.data.id
        ? await this.refreshCampaignSnapshot(result.data.id)
        : {
            snapshotUpdated: false,
            campaignId,
            strategy: 'missing-id' as const,
            error: 'Meta create campaign response did not include campaign id'
          };

      await this.auditRepository.create({
        operationType: 'meta.campaign.create',
        actor: request.actor ?? 'internal-api',
        targetType: 'campaign',
        targetId: campaignId,
        status: 'success',
        reason: request.reason,
        afterState: {
          draft,
          providerResponse: result.data,
          campaignId
        },
        metadata: {
          dryRun: false,
          writeGate: gate,
          refreshedSnapshot,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'create-campaign',
        campaignId,
        draft,
        result: result.data,
        refreshedSnapshot
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign create failed');

      await this.auditRepository.create({
        operationType: 'meta.campaign.create',
        actor: request.actor ?? 'internal-api',
        targetType: 'campaign',
        targetId: `draft:${draft.name}`,
        status: 'failed',
        reason: request.reason,
        afterState: draft,
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
