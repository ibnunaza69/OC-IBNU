import { env } from '../../config/env.js';
import { configService } from '../../config/settings.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaAdSnapshotRepository } from '../meta-sync/repositories/meta-ad.repository.js';
import { MetaAdSetSnapshotRepository } from '../meta-sync/repositories/meta-adset.repository.js';
import { MetaCampaignSnapshotRepository } from '../meta-sync/repositories/meta-campaign.repository.js';
import { MetaClient } from '../providers/meta/meta.client.js';

export interface StartStopRequest {
  targetType: 'campaign' | 'adset' | 'ad';
  targetId: string;
  action: 'START' | 'STOP';
  actor?: string | undefined;
  reason: string;
}

export class StartStopService {
  private readonly auditRepository = new AuditRepository();
  private readonly metaClient = new MetaClient();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();
  private readonly adRepository = new MetaAdSnapshotRepository();

  async changeStatus(request: StartStopRequest) {
    if (!request.reason || request.reason.trim().length < 5) {
      throw new AppError('Write reason is required and must be at least 5 characters', 'VALIDATION_ERROR', 400);
    }

    if (!env.META_WRITE_ENABLED) {
      throw new AppError('Meta write gate is disabled', 'POLICY_REJECTED', 403);
    }

    const accountId = await configService.getMetaAccountId();
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const { targetType, targetId, action } = request;
    const targetStatus = action === 'START' ? 'ACTIVE' : 'PAUSED';

    let previousState: any = null;

    // Validate parent states when unpausing (START -> ACTIVE)
    if (targetType === 'ad') {
      const adSnapshot = await this.adRepository.getLatestByAdId(targetId);
      if (!adSnapshot) {
        throw new AppError(`Ad ${targetId} not found in snapshot`, 'RESOURCE_NOT_FOUND', 404);
      }
      
      previousState = adSnapshot.rawPayload;

      if (targetStatus === 'ACTIVE') {
        if (!adSnapshot.campaignId || !adSnapshot.adSetId) {
          throw new AppError(`Ad ${targetId} missing parent campaign or adset`, 'VALIDATION_ERROR', 400);
        }

        const campaign = await this.campaignRepository.getLatestByCampaignId(adSnapshot.campaignId);
        if (!campaign || campaign.status !== 'ACTIVE') {
          throw new AppError(`Cannot unpause Ad: Parent Campaign ${adSnapshot.campaignId} is not ACTIVE`, 'POLICY_REJECTED', 409);
        }

        const adSet = await this.adSetRepository.getLatestByAdSetId(adSnapshot.adSetId);
        if (!adSet || adSet.status !== 'ACTIVE') {
          throw new AppError(`Cannot unpause Ad: Parent AdSet ${adSnapshot.adSetId} is not ACTIVE`, 'POLICY_REJECTED', 409);
        }
      }
    } else if (targetType === 'adset') {
      const adSetSnapshot = await this.adSetRepository.getLatestByAdSetId(targetId);
      if (!adSetSnapshot) {
        throw new AppError(`AdSet ${targetId} not found in snapshot`, 'RESOURCE_NOT_FOUND', 404);
      }
      
      previousState = adSetSnapshot.rawPayload;

      if (targetStatus === 'ACTIVE') {
        if (!adSetSnapshot.campaignId) {
            throw new AppError(`AdSet ${targetId} missing parent campaign`, 'VALIDATION_ERROR', 400);
        }

        const campaign = await this.campaignRepository.getLatestByCampaignId(adSetSnapshot.campaignId);
        if (!campaign || campaign.status !== 'ACTIVE') {
          throw new AppError(`Cannot unpause AdSet: Parent Campaign ${adSetSnapshot.campaignId} is not ACTIVE`, 'POLICY_REJECTED', 409);
        }
      }
    } else if (targetType === 'campaign') {
      const campaignSnapshot = await this.campaignRepository.getLatestByCampaignId(targetId);
      if (!campaignSnapshot) {
        throw new AppError(`Campaign ${targetId} not found in snapshot`, 'RESOURCE_NOT_FOUND', 404);
      }

      previousState = campaignSnapshot.rawPayload;
    }

    if (previousState && previousState.status === targetStatus) {
       return {
         ok: true,
         changed: false,
         message: `Status is already ${targetStatus}`
       };
    }

    try {
      let providerResult;
      let currentState;

      if (targetType === 'campaign') {
        providerResult = await this.metaClient.updateCampaignStatus(targetId, targetStatus);
        const liveCampaign = await this.metaClient.getCampaign(targetId);
        currentState = liveCampaign.data;
        await this.campaignRepository.upsert(accountId, currentState);
      } else if (targetType === 'adset') {
        providerResult = await this.metaClient.updateAdSetStatus(targetId, targetStatus);
        const liveAdSet = await this.metaClient.getAdSet(targetId);
        currentState = liveAdSet.data;
        await this.adSetRepository.upsert(accountId, currentState);
      } else if (targetType === 'ad') {
        providerResult = await this.metaClient.updateAdStatus(targetId, targetStatus);
        const liveAd = await this.metaClient.getAd(targetId);
        currentState = liveAd.data;
        await this.adRepository.upsert(accountId, currentState);
      }

      await this.auditRepository.create({
        operationType: `meta.${targetType}.status_change`,
        actor: request.actor ?? 'internal-api',
        targetType,
        targetId,
        status: 'success',
        reason: request.reason,
        beforeState: previousState,
        afterState: currentState,
        metadata: {
          action,
          targetStatus,
          providerRequestId: providerResult?.requestId,
          statusCode: providerResult?.status
        }
      });

      return {
        ok: true,
        changed: true,
        action,
        targetType,
        targetId,
        targetStatus,
        result: providerResult?.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError(`Failed to change ${targetType} status to ${targetStatus}`);

      await this.auditRepository.create({
        operationType: `meta.${targetType}.status_change`,
        actor: request.actor ?? 'internal-api',
        targetType,
        targetId,
        status: 'failed',
        reason: request.reason,
        beforeState: previousState,
        metadata: {
          action,
          targetStatus,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }
}
