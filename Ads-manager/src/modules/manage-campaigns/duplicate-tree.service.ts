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

interface DuplicateTreeDraft {
  sourceCampaignId: string;
  statusOption?: DuplicateStatusOption | undefined;
  includeAds?: boolean | undefined;
  cleanupOnFailure?: boolean | undefined;
  namePrefix?: string | undefined;
  nameSuffix?: string | undefined;
}

interface DuplicateTreeRequest {
  draft: DuplicateTreeDraft;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  confirmHighImpact?: boolean | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
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

function buildRenamedName(originalName: string | null, prefix: string | undefined, suffix: string | undefined, fallback: string) {
  const base = originalName?.trim() || fallback;
  const parts = [prefix?.trim(), base, suffix?.trim()].filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
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

export class DuplicateTreeService {
  private readonly auditRepository = new AuditRepository();
  private readonly approvalService = new MetaApprovalService();
  private readonly metaClient = new MetaClient();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();
  private readonly adRepository = new MetaAdSnapshotRepository();

  private async ensureSourceCampaignExists(campaignId: string) {
    const existing = await this.campaignRepository.getLatestByCampaignId(campaignId);
    if (existing) {
      return existing;
    }

    if (!env.META_AD_ACCOUNT_ID) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const liveCampaign = await this.metaClient.getCampaign(campaignId);
    const snapshot = await this.campaignRepository.upsert(env.META_AD_ACCOUNT_ID, liveCampaign.data);
    if (!snapshot) {
      throw new AppError('Failed to persist source campaign snapshot', 'REMOTE_TEMPORARY_FAILURE', 500, { campaignId });
    }
    return snapshot;
  }

  private normalizeDraft(input: DuplicateTreeDraft) {
    const sourceCampaignId = input.sourceCampaignId.trim();
    if (!sourceCampaignId) {
      throw new AppError('sourceCampaignId is required', 'VALIDATION_ERROR', 400);
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

    return {
      sourceCampaignId,
      statusOption: normalizeStatusOption(input.statusOption),
      includeAds: input.includeAds ?? true,
      cleanupOnFailure: input.cleanupOnFailure ?? true,
      namePrefix: input.namePrefix?.trim() || undefined,
      nameSuffix: input.nameSuffix?.trim() || `[Copy ${timestamp}]`
    };
  }

  private assertLiveConfirmation(request: DuplicateTreeRequest) {
    if (request.dryRun || request.confirmHighImpact) {
      return;
    }

    throw new AppError(
      'Live duplicate tree always requires confirmHighImpact=true because it can create multiple objects in one run',
      'POLICY_REJECTED',
      409,
      {
        reason: request.reason,
        recommendation: 'Preview first, then set confirmHighImpact=true for the live tree duplicate.'
      }
    );
  }

  private async buildPlan(sourceCampaignId: string, includeAds: boolean) {
    const campaign = await this.ensureSourceCampaignExists(sourceCampaignId);
    const adSets = await this.adSetRepository.listByCampaignId(sourceCampaignId, env.META_AD_ACCOUNT_ID);
    const adsByAdSet = new Map<string, Awaited<ReturnType<MetaAdSnapshotRepository['listByAdSetId']>>[number][]>();

    for (const adSet of adSets) {
      const ads = includeAds
        ? await this.adRepository.listByAdSetId(adSet.adSetId, env.META_AD_ACCOUNT_ID)
        : [];
      adsByAdSet.set(adSet.adSetId, ads);
    }

    return {
      campaign,
      adSets,
      adsByAdSet,
      totals: {
        adSets: adSets.length,
        ads: Array.from(adsByAdSet.values()).reduce((sum, items) => sum + items.length, 0)
      }
    };
  }

  private async rollbackCampaignTree(campaignId: string) {
    try {
      await this.metaClient.deleteCampaign(campaignId);
    } catch {
      return {
        ok: false,
        strategy: 'delete-campaign-failed' as const,
        campaignId
      };
    }

    await this.adRepository.deleteByCampaignId(campaignId);
    await this.adSetRepository.deleteByCampaignId(campaignId);
    await this.campaignRepository.deleteByCampaignId(campaignId);

    return {
      ok: true,
      strategy: 'delete-campaign' as const,
      campaignId
    };
  }

  async previewDuplicateTree(request: DuplicateTreeRequest) {
    const gate = ensureWriteEnabled(request);
    const draft = this.normalizeDraft(request.draft);
    const plan = await this.buildPlan(draft.sourceCampaignId, draft.includeAds);

    await this.auditRepository.create({
      operationType: 'meta.campaign.duplicate-tree.preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'campaign',
      targetId: draft.sourceCampaignId,
      status: 'pending',
      reason: request.reason,
      afterState: draft,
      metadata: {
        dryRun: true,
        writeGate: gate,
        sourceCampaignSnapshotId: plan.campaign.id,
        totals: plan.totals
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      action: 'duplicate-campaign-tree',
      writeGate: gate,
      draft,
      sourceCampaign: {
        id: plan.campaign.campaignId,
        name: plan.campaign.name,
        status: plan.campaign.status,
        objective: plan.campaign.objective
      },
      totals: plan.totals,
      plan: {
        adSets: plan.adSets.map((adSet) => ({
          sourceAdSetId: adSet.adSetId,
          sourceAdSetName: adSet.name,
          ads: (plan.adsByAdSet.get(adSet.adSetId) ?? []).map((ad) => ({
            sourceAdId: ad.adId,
            sourceAdName: ad.name,
            creativeId: ad.creativeId
          }))
        }))
      }
    };
  }

  async duplicateTree(request: DuplicateTreeRequest) {
    if (request.dryRun) {
      return this.previewDuplicateTree(request);
    }

    const gate = ensureWriteEnabled(request);
    const draft = this.normalizeDraft(request.draft);
    this.assertLiveConfirmation(request);
    const plan = await this.buildPlan(draft.sourceCampaignId, draft.includeAds);

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.campaign.duplicate-tree',
      targetType: 'campaign',
      targetId: draft.sourceCampaignId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: {
        ...draft,
        totals: plan.totals
      },
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    let copiedCampaignId: string | null = null;

    try {
      const copiedAdSets: Array<{ sourceAdSetId: string; copiedAdSetId: string }> = [];
      const copiedAds: Array<{ sourceAdId: string; copiedAdId: string | null }> = [];
      const renameWarnings: Array<{ objectType: string; objectId: string; message: string }> = [];

      const campaignCopy = await this.metaClient.copyCampaign(draft.sourceCampaignId, {
        deep_copy: false,
        status_option: draft.statusOption
      });
      copiedCampaignId = extractCopiedId(campaignCopy.data);

      if (!copiedCampaignId) {
        throw new AppError('Meta campaign tree duplicate did not return copied campaign id', 'REMOTE_TEMPORARY_FAILURE', 502, {
          providerResponse: campaignCopy.data
        });
      }

      const renamedCampaignName = buildRenamedName(plan.campaign.name, draft.namePrefix, draft.nameSuffix, `Campaign ${copiedCampaignId}`);
      try {
        await this.metaClient.updateCampaignName(copiedCampaignId, renamedCampaignName);
      } catch (error) {
        renameWarnings.push({
          objectType: 'campaign',
          objectId: copiedCampaignId,
          message: error instanceof Error ? error.message : 'Unknown campaign rename error'
        });
      }
      await this.campaignRepository.upsert(env.META_AD_ACCOUNT_ID!, (await this.metaClient.getCampaign(copiedCampaignId)).data);

      for (const sourceAdSet of plan.adSets) {
        const adSetCopy = await this.metaClient.copyAdSet(sourceAdSet.adSetId, {
          campaign_id: copiedCampaignId,
          deep_copy: false,
          status_option: draft.statusOption
        });
        const copiedAdSetId = extractCopiedId(adSetCopy.data);
        if (!copiedAdSetId) {
          throw new AppError('Meta ad set tree duplicate did not return copied ad set id', 'REMOTE_TEMPORARY_FAILURE', 502, {
            sourceAdSetId: sourceAdSet.adSetId,
            providerResponse: adSetCopy.data
          });
        }

        copiedAdSets.push({ sourceAdSetId: sourceAdSet.adSetId, copiedAdSetId });
        const renamedAdSetName = buildRenamedName(sourceAdSet.name, draft.namePrefix, draft.nameSuffix, `Ad Set ${copiedAdSetId}`);
        try {
          await this.metaClient.updateAdSetName(copiedAdSetId, renamedAdSetName);
        } catch (error) {
          renameWarnings.push({
            objectType: 'adset',
            objectId: copiedAdSetId,
            message: error instanceof Error ? error.message : 'Unknown ad set rename error'
          });
        }
        await this.adSetRepository.upsert(env.META_AD_ACCOUNT_ID!, (await this.metaClient.getAdSet(copiedAdSetId)).data);

        if (!draft.includeAds) {
          continue;
        }

        for (const sourceAd of plan.adsByAdSet.get(sourceAdSet.adSetId) ?? []) {
          const adCopy = await this.metaClient.copyAd(sourceAd.adId, {
            adset_id: copiedAdSetId,
            status_option: draft.statusOption
          });
          const copiedAdId = extractCopiedId(adCopy.data);
          copiedAds.push({ sourceAdId: sourceAd.adId, copiedAdId });
          if (!copiedAdId) {
            throw new AppError('Meta ad tree duplicate did not return copied ad id', 'REMOTE_TEMPORARY_FAILURE', 502, {
              sourceAdId: sourceAd.adId,
              providerResponse: adCopy.data
            });
          }

          const renamedAdName = buildRenamedName(sourceAd.name, draft.namePrefix, draft.nameSuffix, `Ad ${copiedAdId}`);
          try {
            await this.metaClient.updateAdName(copiedAdId, renamedAdName);
          } catch (error) {
            renameWarnings.push({
              objectType: 'ad',
              objectId: copiedAdId,
              message: error instanceof Error ? error.message : 'Unknown ad rename error'
            });
          }
          await this.adRepository.upsert(env.META_AD_ACCOUNT_ID!, (await this.metaClient.getAd(copiedAdId)).data);
        }
      }

      await this.auditRepository.create({
        operationType: 'meta.campaign.duplicate-tree',
        actor: request.actor ?? 'internal-api',
        targetType: 'campaign',
        targetId: copiedCampaignId,
        status: 'success',
        reason: request.reason,
        afterState: {
          draft,
          copiedCampaignId,
          copiedAdSets,
          copiedAds
        },
        metadata: {
          dryRun: false,
          writeGate: gate,
          sourceCampaignSnapshotId: plan.campaign.id,
          totals: plan.totals,
          renameWarnings
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'duplicate-campaign-tree',
        copiedCampaignId,
        copiedAdSets,
        copiedAds,
        renameWarnings,
        totals: plan.totals,
        sourceCampaign: {
          id: plan.campaign.campaignId,
          name: plan.campaign.name,
          status: plan.campaign.status,
          objective: plan.campaign.objective
        }
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign tree duplicate failed');
      const rollback = copiedCampaignId && draft.cleanupOnFailure
        ? await this.rollbackCampaignTree(copiedCampaignId)
        : null;

      await this.auditRepository.create({
        operationType: 'meta.campaign.duplicate-tree',
        actor: request.actor ?? 'internal-api',
        targetType: 'campaign',
        targetId: copiedCampaignId ?? draft.sourceCampaignId,
        status: 'failed',
        reason: request.reason,
        afterState: draft,
        metadata: {
          dryRun: false,
          sourceCampaignSnapshotId: plan.campaign.id,
          totals: plan.totals,
          copiedCampaignId,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details ?? null,
          rollback
        }
      });

      throw new AppError(appError.message, appError.code, appError.statusCode, {
        ...(appError.details ?? {}),
        rollback
      });
    }
  }
}
