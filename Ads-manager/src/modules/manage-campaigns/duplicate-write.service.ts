import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaAdSetSnapshotRepository } from '../meta-sync/repositories/meta-adset.repository.js';
import { MetaAdSnapshotRepository } from '../meta-sync/repositories/meta-ad.repository.js';
import { MetaCampaignSnapshotRepository } from '../meta-sync/repositories/meta-campaign.repository.js';
import { MetaApprovalService } from '../meta-write/meta-approval.service.js';
import { MetaClient } from '../providers/meta/meta.client.js';

const DUPLICATE_STATUS_OPTIONS = ['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE'] as const;
type DuplicateStatusOption = (typeof DUPLICATE_STATUS_OPTIONS)[number];

type CampaignSnapshot = NonNullable<Awaited<ReturnType<MetaCampaignSnapshotRepository['getLatestByCampaignId']>>>;
type AdSetSnapshot = NonNullable<Awaited<ReturnType<MetaAdSetSnapshotRepository['getLatestByAdSetId']>>>;
type AdSnapshot = NonNullable<Awaited<ReturnType<MetaAdSnapshotRepository['getLatestByAdId']>>>;

interface BaseDuplicateRequest {
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  confirmHighImpact?: boolean | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

interface CampaignDuplicateInput {
  sourceCampaignId: string;
  statusOption?: DuplicateStatusOption | undefined;
  deepCopy?: boolean | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  renameOptions?: Record<string, unknown> | undefined;
  parameterOverrides?: Record<string, unknown> | undefined;
  migrateToAdvantagePlus?: boolean | undefined;
}

interface CampaignDuplicateRequest extends BaseDuplicateRequest {
  draft: CampaignDuplicateInput;
}

interface AdSetDuplicateInput {
  sourceAdSetId: string;
  targetCampaignId?: string | undefined;
  statusOption?: DuplicateStatusOption | undefined;
  deepCopy?: boolean | undefined;
  createDcoAdSet?: boolean | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  renameOptions?: Record<string, unknown> | undefined;
}

interface AdSetDuplicateRequest extends BaseDuplicateRequest {
  draft: AdSetDuplicateInput;
}

interface AdDuplicateInput {
  sourceAdId: string;
  targetAdSetId?: string | undefined;
  statusOption?: DuplicateStatusOption | undefined;
  renameOptions?: Record<string, unknown> | undefined;
  creativeParameters?: Record<string, unknown> | undefined;
}

interface AdDuplicateRequest extends BaseDuplicateRequest {
  draft: AdDuplicateInput;
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

function normalizeStatusOption(value?: string | null): DuplicateStatusOption {
  const normalized = value?.trim().toUpperCase() as DuplicateStatusOption | undefined;
  return normalized && DUPLICATE_STATUS_OPTIONS.includes(normalized) ? normalized : 'PAUSED';
}

function asTrimmed(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function assertObjectRecord(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(`${fieldName} must be an object`, 'VALIDATION_ERROR', 400);
  }

  return value as Record<string, unknown>;
}

function extractCopiedId(payload: Record<string, unknown>) {
  const candidates = [
    payload.id,
    payload.copied_campaign_id,
    payload.copied_adset_id,
    payload.copied_ad_id,
    payload.campaign_id,
    payload.adset_id,
    payload.ad_id
  ];

  const copiedId = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof copiedId === 'string' ? copiedId : null;
}

export class DuplicateWriteService {
  private readonly auditRepository = new AuditRepository();
  private readonly approvalService = new MetaApprovalService();
  private readonly metaClient = new MetaClient();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();
  private readonly adRepository = new MetaAdSnapshotRepository();

  private async ensureSourceCampaignExists(campaignId: string): Promise<CampaignSnapshot> {
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
        throw new AppError('Failed to persist source campaign snapshot', 'REMOTE_TEMPORARY_FAILURE', 500, { campaignId });
      }
      return snapshot;
    } catch {
      throw new AppError('Source campaign not found or not readable', 'RESOURCE_NOT_FOUND', 404, { campaignId });
    }
  }

  private async ensureSourceAdSetExists(adSetId: string): Promise<AdSetSnapshot> {
    const existing = await this.adSetRepository.getLatestByAdSetId(adSetId);
    if (existing) {
      return existing;
    }

    if (!env.META_AD_ACCOUNT_ID) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    try {
      const liveAdSet = await this.metaClient.getAdSet(adSetId);
      const snapshot = await this.adSetRepository.upsert(env.META_AD_ACCOUNT_ID, liveAdSet.data);
      if (!snapshot) {
        throw new AppError('Failed to persist source ad set snapshot', 'REMOTE_TEMPORARY_FAILURE', 500, { adSetId });
      }
      return snapshot;
    } catch {
      throw new AppError('Source ad set not found or not readable', 'RESOURCE_NOT_FOUND', 404, { adSetId });
    }
  }

  private async ensureSourceAdExists(adId: string): Promise<AdSnapshot> {
    const existing = await this.adRepository.getLatestByAdId(adId);
    if (existing) {
      return existing;
    }

    if (!env.META_AD_ACCOUNT_ID) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    try {
      const liveAd = await this.metaClient.getAd(adId);
      const snapshot = await this.adRepository.upsert(env.META_AD_ACCOUNT_ID, liveAd.data);
      if (!snapshot) {
        throw new AppError('Failed to persist source ad snapshot', 'REMOTE_TEMPORARY_FAILURE', 500, { adId });
      }
      return snapshot;
    } catch {
      throw new AppError('Source ad not found or not readable', 'RESOURCE_NOT_FOUND', 404, { adId });
    }
  }

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

  private async refreshAdSnapshot(adId: string) {
    if (!env.META_AD_ACCOUNT_ID) {
      return {
        snapshotUpdated: false,
        adId,
        error: 'META_AD_ACCOUNT_ID is not configured'
      };
    }

    try {
      const liveAd = await this.metaClient.getAd(adId);
      await this.adRepository.upsert(env.META_AD_ACCOUNT_ID, liveAd.data);
      return {
        snapshotUpdated: true,
        adId,
        strategy: 'live-read' as const
      };
    } catch (error) {
      return {
        snapshotUpdated: false,
        adId,
        strategy: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown ad snapshot refresh error'
      };
    }
  }

  private normalizeCampaignDuplicateDraft(input: CampaignDuplicateInput) {
    const sourceCampaignId = input.sourceCampaignId.trim();
    const statusOption = normalizeStatusOption(input.statusOption);
    const renameOptions = assertObjectRecord(input.renameOptions, 'renameOptions');
    const parameterOverrides = assertObjectRecord(input.parameterOverrides, 'parameterOverrides');

    if (!sourceCampaignId) {
      throw new AppError('sourceCampaignId is required', 'VALIDATION_ERROR', 400);
    }

    return {
      sourceCampaignId,
      statusOption,
      deepCopy: input.deepCopy ?? false,
      startTime: asTrimmed(input.startTime),
      endTime: asTrimmed(input.endTime),
      renameOptions,
      parameterOverrides,
      migrateToAdvantagePlus: input.migrateToAdvantagePlus ?? false
    };
  }

  private normalizeAdSetDuplicateDraft(input: AdSetDuplicateInput) {
    const sourceAdSetId = input.sourceAdSetId.trim();
    const targetCampaignId = asTrimmed(input.targetCampaignId);
    const statusOption = normalizeStatusOption(input.statusOption);
    const renameOptions = assertObjectRecord(input.renameOptions, 'renameOptions');

    if (!sourceAdSetId) {
      throw new AppError('sourceAdSetId is required', 'VALIDATION_ERROR', 400);
    }

    return {
      sourceAdSetId,
      targetCampaignId,
      statusOption,
      deepCopy: input.deepCopy ?? false,
      createDcoAdSet: input.createDcoAdSet ?? false,
      startTime: asTrimmed(input.startTime),
      endTime: asTrimmed(input.endTime),
      renameOptions
    };
  }

  private normalizeAdDuplicateDraft(input: AdDuplicateInput) {
    const sourceAdId = input.sourceAdId.trim();
    const targetAdSetId = asTrimmed(input.targetAdSetId);
    const statusOption = normalizeStatusOption(input.statusOption);
    const renameOptions = assertObjectRecord(input.renameOptions, 'renameOptions');
    const creativeParameters = assertObjectRecord(input.creativeParameters, 'creativeParameters');

    if (!sourceAdId) {
      throw new AppError('sourceAdId is required', 'VALIDATION_ERROR', 400);
    }

    return {
      sourceAdId,
      targetAdSetId,
      statusOption,
      renameOptions,
      creativeParameters
    };
  }

  private assertCampaignDuplicateConfirmation(request: CampaignDuplicateRequest, draft: ReturnType<DuplicateWriteService['normalizeCampaignDuplicateDraft']>) {
    if (request.dryRun || request.confirmHighImpact || (draft.statusOption !== 'ACTIVE' && !draft.deepCopy)) {
      return;
    }

    throw new AppError(
      'Live campaign duplicate with ACTIVE status or deepCopy=true requires confirmHighImpact=true',
      'POLICY_REJECTED',
      409,
      {
        reason: request.reason,
        draft,
        recommendation: 'Use PAUSED status_option for safer rollout, or explicitly confirm high impact before duplicating a deeper tree.'
      }
    );
  }

  private assertAdSetDuplicateConfirmation(request: AdSetDuplicateRequest, draft: ReturnType<DuplicateWriteService['normalizeAdSetDuplicateDraft']>) {
    if (request.dryRun || request.confirmHighImpact || (draft.statusOption !== 'ACTIVE' && !draft.deepCopy)) {
      return;
    }

    throw new AppError(
      'Live ad set duplicate with ACTIVE status or deepCopy=true requires confirmHighImpact=true',
      'POLICY_REJECTED',
      409,
      {
        reason: request.reason,
        draft,
        recommendation: 'Use PAUSED status_option for safer rollout, or explicitly confirm high impact before duplicating the ad set tree.'
      }
    );
  }

  private assertAdDuplicateConfirmation(request: AdDuplicateRequest, draft: ReturnType<DuplicateWriteService['normalizeAdDuplicateDraft']>) {
    if (request.dryRun || request.confirmHighImpact || draft.statusOption !== 'ACTIVE') {
      return;
    }

    throw new AppError(
      'Live ad duplicate with ACTIVE status requires confirmHighImpact=true or safer PAUSED rollout',
      'POLICY_REJECTED',
      409,
      {
        reason: request.reason,
        draft,
        recommendation: 'Duplicate ad in PAUSED state first, then explicitly start it later.'
      }
    );
  }

  async previewDuplicateCampaign(request: CampaignDuplicateRequest) {
    const gate = ensureWriteEnabled(request);
    const draft = this.normalizeCampaignDuplicateDraft(request.draft);
    const sourceCampaign = await this.ensureSourceCampaignExists(draft.sourceCampaignId);

    await this.auditRepository.create({
      operationType: 'meta.campaign.duplicate-preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'campaign',
      targetId: draft.sourceCampaignId,
      status: 'pending',
      reason: request.reason,
      afterState: draft,
      metadata: {
        dryRun: true,
        writeGate: gate,
        sourceCampaignSnapshotId: sourceCampaign.id,
        highImpactReasons: {
          activeStatus: draft.statusOption === 'ACTIVE',
          deepCopy: draft.deepCopy
        }
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      writeGate: gate,
      draft,
      sourceCampaign: {
        id: sourceCampaign.campaignId,
        name: sourceCampaign.name,
        status: sourceCampaign.status,
        objective: sourceCampaign.objective
      },
      highImpactReasons: {
        activeStatus: draft.statusOption === 'ACTIVE',
        deepCopy: draft.deepCopy
      }
    };
  }

  async duplicateCampaign(request: CampaignDuplicateRequest) {
    if (request.dryRun) {
      return this.previewDuplicateCampaign(request);
    }

    const gate = ensureWriteEnabled(request);
    const draft = this.normalizeCampaignDuplicateDraft(request.draft);
    const sourceCampaign = await this.ensureSourceCampaignExists(draft.sourceCampaignId);
    this.assertCampaignDuplicateConfirmation(request, draft);

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.campaign.duplicate',
      targetType: 'campaign',
      targetId: draft.sourceCampaignId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: draft,
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.copyCampaign(draft.sourceCampaignId, {
        deep_copy: draft.deepCopy,
        end_time: draft.endTime,
        migrate_to_advantage_plus: draft.migrateToAdvantagePlus,
        parameter_overrides: draft.parameterOverrides,
        rename_options: draft.renameOptions,
        start_time: draft.startTime,
        status_option: draft.statusOption
      });
      const copiedCampaignId = extractCopiedId(result.data);
      const refreshedSnapshot = copiedCampaignId
        ? await this.refreshCampaignSnapshot(copiedCampaignId)
        : {
            snapshotUpdated: false,
            campaignId: null,
            strategy: 'missing-id' as const,
            error: 'Meta campaign copy response did not include copied campaign id'
          };

      await this.auditRepository.create({
        operationType: 'meta.campaign.duplicate',
        actor: request.actor ?? 'internal-api',
        targetType: 'campaign',
        targetId: copiedCampaignId ?? draft.sourceCampaignId,
        status: 'success',
        reason: request.reason,
        afterState: {
          sourceCampaignId: draft.sourceCampaignId,
          copiedCampaignId,
          providerResponse: result.data,
          draft
        },
        metadata: {
          dryRun: false,
          writeGate: gate,
          sourceCampaignSnapshotId: sourceCampaign.id,
          refreshedSnapshot,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'duplicate-campaign',
        copiedCampaignId,
        draft,
        sourceCampaign: {
          id: sourceCampaign.campaignId,
          name: sourceCampaign.name,
          status: sourceCampaign.status,
          objective: sourceCampaign.objective
        },
        result: result.data,
        refreshedSnapshot
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign duplicate failed');

      await this.auditRepository.create({
        operationType: 'meta.campaign.duplicate',
        actor: request.actor ?? 'internal-api',
        targetType: 'campaign',
        targetId: draft.sourceCampaignId,
        status: 'failed',
        reason: request.reason,
        afterState: draft,
        metadata: {
          dryRun: false,
          sourceCampaignSnapshotId: sourceCampaign.id,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }

  async previewDuplicateAdSet(request: AdSetDuplicateRequest) {
    const gate = ensureWriteEnabled(request);
    const draft = this.normalizeAdSetDuplicateDraft(request.draft);
    const sourceAdSet = await this.ensureSourceAdSetExists(draft.sourceAdSetId);
    const targetCampaign = draft.targetCampaignId
      ? await this.ensureSourceCampaignExists(draft.targetCampaignId)
      : null;

    await this.auditRepository.create({
      operationType: 'meta.adset.duplicate-preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'adset',
      targetId: draft.sourceAdSetId,
      status: 'pending',
      reason: request.reason,
      afterState: draft,
      metadata: {
        dryRun: true,
        writeGate: gate,
        sourceAdSetSnapshotId: sourceAdSet.id,
        sourceCampaignId: sourceAdSet.campaignId,
        targetCampaignSnapshotId: targetCampaign?.id ?? null,
        highImpactReasons: {
          activeStatus: draft.statusOption === 'ACTIVE',
          deepCopy: draft.deepCopy
        }
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      writeGate: gate,
      draft,
      sourceAdSet: {
        id: sourceAdSet.adSetId,
        name: sourceAdSet.name,
        status: sourceAdSet.status,
        campaignId: sourceAdSet.campaignId
      },
      targetCampaign: targetCampaign
        ? {
            id: targetCampaign.campaignId,
            name: targetCampaign.name,
            status: targetCampaign.status
          }
        : null,
      highImpactReasons: {
        activeStatus: draft.statusOption === 'ACTIVE',
        deepCopy: draft.deepCopy
      }
    };
  }

  async duplicateAdSet(request: AdSetDuplicateRequest) {
    if (request.dryRun) {
      return this.previewDuplicateAdSet(request);
    }

    const gate = ensureWriteEnabled(request);
    const draft = this.normalizeAdSetDuplicateDraft(request.draft);
    const sourceAdSet = await this.ensureSourceAdSetExists(draft.sourceAdSetId);
    const targetCampaign = draft.targetCampaignId
      ? await this.ensureSourceCampaignExists(draft.targetCampaignId)
      : null;
    this.assertAdSetDuplicateConfirmation(request, draft);

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.adset.duplicate',
      targetType: 'adset',
      targetId: draft.sourceAdSetId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: draft,
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.copyAdSet(draft.sourceAdSetId, {
        campaign_id: draft.targetCampaignId,
        create_dco_adset: draft.createDcoAdSet,
        deep_copy: draft.deepCopy,
        end_time: draft.endTime,
        rename_options: draft.renameOptions,
        start_time: draft.startTime,
        status_option: draft.statusOption
      });
      const copiedAdSetId = extractCopiedId(result.data);
      const refreshedSnapshot = copiedAdSetId
        ? await this.refreshAdSetSnapshot(copiedAdSetId)
        : {
            snapshotUpdated: false,
            adSetId: null,
            strategy: 'missing-id' as const,
            error: 'Meta ad set copy response did not include copied ad set id'
          };

      await this.auditRepository.create({
        operationType: 'meta.adset.duplicate',
        actor: request.actor ?? 'internal-api',
        targetType: 'adset',
        targetId: copiedAdSetId ?? draft.sourceAdSetId,
        status: 'success',
        reason: request.reason,
        afterState: {
          sourceAdSetId: draft.sourceAdSetId,
          copiedAdSetId,
          providerResponse: result.data,
          draft
        },
        metadata: {
          dryRun: false,
          writeGate: gate,
          sourceAdSetSnapshotId: sourceAdSet.id,
          sourceCampaignId: sourceAdSet.campaignId,
          targetCampaignSnapshotId: targetCampaign?.id ?? null,
          refreshedSnapshot,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'duplicate-adset',
        copiedAdSetId,
        draft,
        sourceAdSet: {
          id: sourceAdSet.adSetId,
          name: sourceAdSet.name,
          status: sourceAdSet.status,
          campaignId: sourceAdSet.campaignId
        },
        targetCampaign: targetCampaign
          ? {
              id: targetCampaign.campaignId,
              name: targetCampaign.name,
              status: targetCampaign.status
            }
          : null,
        result: result.data,
        refreshedSnapshot
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad set duplicate failed');

      await this.auditRepository.create({
        operationType: 'meta.adset.duplicate',
        actor: request.actor ?? 'internal-api',
        targetType: 'adset',
        targetId: draft.sourceAdSetId,
        status: 'failed',
        reason: request.reason,
        afterState: draft,
        metadata: {
          dryRun: false,
          sourceAdSetSnapshotId: sourceAdSet.id,
          sourceCampaignId: sourceAdSet.campaignId,
          targetCampaignSnapshotId: targetCampaign?.id ?? null,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }

  async previewDuplicateAd(request: AdDuplicateRequest) {
    const gate = ensureWriteEnabled(request);
    const draft = this.normalizeAdDuplicateDraft(request.draft);
    const sourceAd = await this.ensureSourceAdExists(draft.sourceAdId);
    const targetAdSet = draft.targetAdSetId
      ? await this.ensureSourceAdSetExists(draft.targetAdSetId)
      : null;

    await this.auditRepository.create({
      operationType: 'meta.ad.duplicate-preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'ad',
      targetId: draft.sourceAdId,
      status: 'pending',
      reason: request.reason,
      afterState: draft,
      metadata: {
        dryRun: true,
        writeGate: gate,
        sourceAdSnapshotId: sourceAd.id,
        sourceAdSetId: sourceAd.adSetId,
        sourceCampaignId: sourceAd.campaignId,
        targetAdSetSnapshotId: targetAdSet?.id ?? null,
        activeRequiresConfirmHighImpact: draft.statusOption === 'ACTIVE'
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      writeGate: gate,
      draft,
      sourceAd: {
        id: sourceAd.adId,
        name: sourceAd.name,
        status: sourceAd.status,
        adSetId: sourceAd.adSetId,
        campaignId: sourceAd.campaignId,
        creativeId: sourceAd.creativeId
      },
      targetAdSet: targetAdSet
        ? {
            id: targetAdSet.adSetId,
            name: targetAdSet.name,
            status: targetAdSet.status,
            campaignId: targetAdSet.campaignId
          }
        : null,
      activeRequiresConfirmHighImpact: draft.statusOption === 'ACTIVE'
    };
  }

  async duplicateAd(request: AdDuplicateRequest) {
    if (request.dryRun) {
      return this.previewDuplicateAd(request);
    }

    const gate = ensureWriteEnabled(request);
    const draft = this.normalizeAdDuplicateDraft(request.draft);
    const sourceAd = await this.ensureSourceAdExists(draft.sourceAdId);
    const targetAdSet = draft.targetAdSetId
      ? await this.ensureSourceAdSetExists(draft.targetAdSetId)
      : null;
    this.assertAdDuplicateConfirmation(request, draft);

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.ad.duplicate',
      targetType: 'ad',
      targetId: draft.sourceAdId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: draft,
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.copyAd(draft.sourceAdId, {
        adset_id: draft.targetAdSetId,
        creative_parameters: draft.creativeParameters,
        rename_options: draft.renameOptions,
        status_option: draft.statusOption
      });
      const copiedAdId = extractCopiedId(result.data);
      const refreshedSnapshot = copiedAdId
        ? await this.refreshAdSnapshot(copiedAdId)
        : {
            snapshotUpdated: false,
            adId: null,
            strategy: 'missing-id' as const,
            error: 'Meta ad copy response did not include copied ad id'
          };

      await this.auditRepository.create({
        operationType: 'meta.ad.duplicate',
        actor: request.actor ?? 'internal-api',
        targetType: 'ad',
        targetId: copiedAdId ?? draft.sourceAdId,
        status: 'success',
        reason: request.reason,
        afterState: {
          sourceAdId: draft.sourceAdId,
          copiedAdId,
          providerResponse: result.data,
          draft
        },
        metadata: {
          dryRun: false,
          writeGate: gate,
          sourceAdSnapshotId: sourceAd.id,
          sourceAdSetId: sourceAd.adSetId,
          sourceCampaignId: sourceAd.campaignId,
          targetAdSetSnapshotId: targetAdSet?.id ?? null,
          refreshedSnapshot,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'duplicate-ad',
        copiedAdId,
        draft,
        sourceAd: {
          id: sourceAd.adId,
          name: sourceAd.name,
          status: sourceAd.status,
          adSetId: sourceAd.adSetId,
          campaignId: sourceAd.campaignId,
          creativeId: sourceAd.creativeId
        },
        targetAdSet: targetAdSet
          ? {
              id: targetAdSet.adSetId,
              name: targetAdSet.name,
              status: targetAdSet.status,
              campaignId: targetAdSet.campaignId
            }
          : null,
        result: result.data,
        refreshedSnapshot
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad duplicate failed');

      await this.auditRepository.create({
        operationType: 'meta.ad.duplicate',
        actor: request.actor ?? 'internal-api',
        targetType: 'ad',
        targetId: draft.sourceAdId,
        status: 'failed',
        reason: request.reason,
        afterState: draft,
        metadata: {
          dryRun: false,
          sourceAdSnapshotId: sourceAd.id,
          sourceAdSetId: sourceAd.adSetId,
          sourceCampaignId: sourceAd.campaignId,
          targetAdSetSnapshotId: targetAdSet?.id ?? null,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }
}
