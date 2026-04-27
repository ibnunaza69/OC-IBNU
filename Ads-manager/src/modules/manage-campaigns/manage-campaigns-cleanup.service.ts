import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaAdSetSnapshotRepository } from '../meta-sync/repositories/meta-adset.repository.js';
import { MetaAdSnapshotRepository } from '../meta-sync/repositories/meta-ad.repository.js';
import { MetaCampaignSnapshotRepository } from '../meta-sync/repositories/meta-campaign.repository.js';
import { MetaApprovalService } from '../meta-write/meta-approval.service.js';
import { MetaClient } from '../providers/meta/meta.client.js';

interface CleanupRequest {
  targetId: string;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
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

export class ManageCampaignsCleanupService {
  private readonly auditRepository = new AuditRepository();
  private readonly approvalService = new MetaApprovalService();
  private readonly metaClient = new MetaClient();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();
  private readonly adRepository = new MetaAdSnapshotRepository();

  async previewDeleteCampaign(request: CleanupRequest) {
    const gate = ensureWriteEnabled(request);
    const snapshot = await this.campaignRepository.getLatestByCampaignId(request.targetId);

    if (!snapshot) {
      throw new AppError('Campaign snapshot not found. Sync campaigns first before attempting delete.', 'RESOURCE_NOT_FOUND', 404);
    }

    await this.auditRepository.create({
      operationType: 'meta.campaign.delete-preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'campaign',
      targetId: request.targetId,
      status: 'pending',
      reason: request.reason,
      beforeState: snapshot.rawPayload,
      metadata: {
        dryRun: true,
        writeGate: gate,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      preview: {
        campaignId: request.targetId,
        currentStatus: snapshot.status ?? null,
        currentName: snapshot.name ?? null,
        dryRun: true,
        writeGate: gate,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    };
  }

  async deleteCampaign(request: CleanupRequest) {
    if (request.dryRun) {
      return this.previewDeleteCampaign(request);
    }

    const gate = ensureWriteEnabled(request);
    const snapshot = await this.campaignRepository.getLatestByCampaignId(request.targetId);

    if (!snapshot) {
      throw new AppError('Campaign snapshot not found. Sync campaigns first before attempting delete.', 'RESOURCE_NOT_FOUND', 404);
    }

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.campaign.delete',
      targetType: 'campaign',
      targetId: request.targetId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: {
        campaignId: request.targetId,
        name: snapshot.name ?? null
      },
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.deleteCampaign(request.targetId);
      const deletedAds = await this.adRepository.deleteByCampaignId(request.targetId);
      const deletedAdSets = await this.adSetRepository.deleteByCampaignId(request.targetId);
      const deletedCampaigns = await this.campaignRepository.deleteByCampaignId(request.targetId);

      await this.auditRepository.create({
        operationType: 'meta.campaign.delete',
        actor: request.actor ?? 'internal-api',
        targetType: 'campaign',
        targetId: request.targetId,
        status: 'success',
        reason: request.reason,
        beforeState: snapshot.rawPayload,
        metadata: {
          dryRun: false,
          writeGate: gate,
          localSnapshotDeleted: true,
          deletedSnapshotCounts: {
            campaigns: deletedCampaigns.length,
            adSets: deletedAdSets.length,
            ads: deletedAds.length
          },
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'delete-campaign',
        campaignId: request.targetId,
        result: result.data,
        localSnapshotDeleted: true,
        deletedSnapshotCounts: {
          campaigns: deletedCampaigns.length,
          adSets: deletedAdSets.length,
          ads: deletedAds.length
        }
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign delete failed');

      await this.auditRepository.create({
        operationType: 'meta.campaign.delete',
        actor: request.actor ?? 'internal-api',
        targetType: 'campaign',
        targetId: request.targetId,
        status: 'failed',
        reason: request.reason,
        beforeState: snapshot.rawPayload,
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

  async previewDeleteAdSet(request: CleanupRequest) {
    const gate = ensureWriteEnabled(request);
    const snapshot = await this.adSetRepository.getLatestByAdSetId(request.targetId);

    if (!snapshot) {
      throw new AppError('Ad set snapshot not found. Sync ad sets first before attempting delete.', 'RESOURCE_NOT_FOUND', 404);
    }

    await this.auditRepository.create({
      operationType: 'meta.adset.delete-preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'adset',
      targetId: request.targetId,
      status: 'pending',
      reason: request.reason,
      beforeState: snapshot.rawPayload,
      metadata: {
        dryRun: true,
        writeGate: gate,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      preview: {
        adSetId: request.targetId,
        currentStatus: snapshot.status ?? null,
        currentName: snapshot.name ?? null,
        campaignId: snapshot.campaignId ?? null,
        dryRun: true,
        writeGate: gate,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    };
  }

  async deleteAdSet(request: CleanupRequest) {
    if (request.dryRun) {
      return this.previewDeleteAdSet(request);
    }

    const gate = ensureWriteEnabled(request);
    const snapshot = await this.adSetRepository.getLatestByAdSetId(request.targetId);

    if (!snapshot) {
      throw new AppError('Ad set snapshot not found. Sync ad sets first before attempting delete.', 'RESOURCE_NOT_FOUND', 404);
    }

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.adset.delete',
      targetType: 'adset',
      targetId: request.targetId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: {
        adSetId: request.targetId,
        name: snapshot.name ?? null,
        campaignId: snapshot.campaignId ?? null
      },
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.deleteAdSet(request.targetId);
      const deletedAds = await this.adRepository.deleteByAdSetId(request.targetId);
      const deletedAdSets = await this.adSetRepository.deleteByAdSetId(request.targetId);

      await this.auditRepository.create({
        operationType: 'meta.adset.delete',
        actor: request.actor ?? 'internal-api',
        targetType: 'adset',
        targetId: request.targetId,
        status: 'success',
        reason: request.reason,
        beforeState: snapshot.rawPayload,
        metadata: {
          dryRun: false,
          writeGate: gate,
          localSnapshotDeleted: true,
          deletedSnapshotCounts: {
            adSets: deletedAdSets.length,
            ads: deletedAds.length
          },
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'delete-adset',
        adSetId: request.targetId,
        result: result.data,
        localSnapshotDeleted: true,
        deletedSnapshotCounts: {
          adSets: deletedAdSets.length,
          ads: deletedAds.length
        }
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad set delete failed');

      await this.auditRepository.create({
        operationType: 'meta.adset.delete',
        actor: request.actor ?? 'internal-api',
        targetType: 'adset',
        targetId: request.targetId,
        status: 'failed',
        reason: request.reason,
        beforeState: snapshot.rawPayload,
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
