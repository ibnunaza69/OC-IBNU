import { ManageCampaignsCleanupService } from './manage-campaigns-cleanup.service.js';
import { DuplicateWriteService } from './duplicate-write.service.js';
import { MetaWriteService } from '../meta-write/meta-write.service.js';
import type {
  MetaStatusWriteRequest,
  MetaWritableStatus,
  MetaWriteTargetType
} from '../meta-write/meta-write.types.js';

interface BulkCommonOptions {
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

interface BulkResult<T> {
  targetId: string;
  status: 'success' | 'failed';
  result?: T;
  error?: { message: string; code?: string | undefined; statusCode?: number | undefined };
}

interface BulkStatusRequest extends BulkCommonOptions {
  targetType: MetaWriteTargetType;
  targetIds: string[];
  nextStatus: MetaWritableStatus;
}

interface BulkDeleteRequest extends BulkCommonOptions {
  targetType: 'campaign' | 'adset';
  targetIds: string[];
}

interface BulkDuplicateCampaignRequest extends BulkCommonOptions {
  sourceCampaignIds: string[];
  statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
  deepCopy?: boolean | undefined;
  confirmHighImpact?: boolean | undefined;
}

function toBulkError(error: unknown) {
  if (error instanceof Error) {
    const maybeCode = (error as { code?: unknown }).code;
    const maybeStatus = (error as { statusCode?: unknown }).statusCode;
    return {
      message: error.message,
      code: typeof maybeCode === 'string' ? maybeCode : undefined,
      statusCode: typeof maybeStatus === 'number' ? maybeStatus : undefined
    };
  }
  return { message: String(error) };
}

export class BulkActionsService {
  private readonly cleanupService = new ManageCampaignsCleanupService();
  private readonly duplicateService = new DuplicateWriteService();
  private readonly writeService = new MetaWriteService();

  async bulkChangeStatus(request: BulkStatusRequest) {
    const unique = Array.from(new Set(request.targetIds.map((id) => id.trim()).filter(Boolean)));
    const results: BulkResult<unknown>[] = [];

    for (const targetId of unique) {
      try {
        const statusRequest: MetaStatusWriteRequest = {
          targetType: request.targetType,
          targetId,
          nextStatus: request.nextStatus,
          reason: request.reason,
          dryRun: request.dryRun,
          actor: request.actor,
          secret: request.secret,
          approvalId: request.approvalId,
          approvalToken: request.approvalToken
        };
        const result = await this.writeService.changeStatus(statusRequest);
        results.push({ targetId, status: 'success', result });
      } catch (error) {
        results.push({ targetId, status: 'failed', error: toBulkError(error) });
      }
    }

    return {
      ok: true as const,
      mode: request.dryRun ? ('dry-run' as const) : ('live' as const),
      targetType: request.targetType,
      nextStatus: request.nextStatus,
      total: unique.length,
      succeeded: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results
    };
  }

  async bulkDelete(request: BulkDeleteRequest) {
    const unique = Array.from(new Set(request.targetIds.map((id) => id.trim()).filter(Boolean)));
    const results: BulkResult<unknown>[] = [];

    for (const targetId of unique) {
      try {
        const baseRequest = {
          targetId,
          reason: request.reason,
          dryRun: request.dryRun,
          actor: request.actor,
          secret: request.secret,
          approvalId: request.approvalId,
          approvalToken: request.approvalToken
        };
        const result = request.targetType === 'campaign'
          ? await this.cleanupService.deleteCampaign(baseRequest)
          : await this.cleanupService.deleteAdSet(baseRequest);
        results.push({ targetId, status: 'success', result });
      } catch (error) {
        results.push({ targetId, status: 'failed', error: toBulkError(error) });
      }
    }

    return {
      ok: true as const,
      mode: request.dryRun ? ('dry-run' as const) : ('live' as const),
      targetType: request.targetType,
      total: unique.length,
      succeeded: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results
    };
  }

  async bulkDuplicateCampaigns(request: BulkDuplicateCampaignRequest) {
    const unique = Array.from(new Set(request.sourceCampaignIds.map((id) => id.trim()).filter(Boolean)));
    const results: BulkResult<unknown>[] = [];

    for (const sourceCampaignId of unique) {
      try {
        const result = await this.duplicateService.duplicateCampaign({
          draft: {
            sourceCampaignId,
            statusOption: request.statusOption,
            deepCopy: request.deepCopy
          },
          reason: request.reason,
          dryRun: request.dryRun,
          actor: request.actor,
          secret: request.secret,
          approvalId: request.approvalId,
          approvalToken: request.approvalToken,
          confirmHighImpact: request.confirmHighImpact
        });
        results.push({ targetId: sourceCampaignId, status: 'success', result });
      } catch (error) {
        results.push({ targetId: sourceCampaignId, status: 'failed', error: toBulkError(error) });
      }
    }

    return {
      ok: true as const,
      mode: request.dryRun ? ('dry-run' as const) : ('live' as const),
      total: unique.length,
      succeeded: results.filter((r) => r.status === 'success').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results
    };
  }
}
