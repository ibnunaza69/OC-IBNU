import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaSyncService } from '../meta-sync/meta-sync.service.js';
import { DuplicateTreeService } from './duplicate-tree.service.js';
import { PreflightCheckService } from './preflight-check.service.js';

type VerificationCheckStatus = 'passed' | 'warning' | 'blocked';

interface VerificationCheckResult {
  check: 'sync-hierarchy' | 'preflight-create-ad' | 'inspect-ad-promotability' | 'preflight-duplicate-ad' | 'duplicate-tree-dry-run';
  status: VerificationCheckStatus;
  summary: string;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface MetaVerificationRunnerInput {
  reason: string;
  actor?: string | undefined;
  syncHierarchy?: boolean | undefined;
  limit?: number | undefined;
  createAdPreflight?: Record<string, unknown> | undefined;
  promotability?: {
    adId: string;
    targetAdSetId?: string | undefined;
  } | undefined;
  duplicateAdPreflight?: {
    sourceAdId: string;
    targetAdSetId?: string | undefined;
    statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    renameOptions?: Record<string, unknown> | undefined;
    creativeParameters?: Record<string, unknown> | undefined;
  } | undefined;
  duplicateTree?: {
    sourceCampaignId: string;
    statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    includeAds?: boolean | undefined;
    cleanupOnFailure?: boolean | undefined;
    namePrefix?: string | undefined;
    nameSuffix?: string | undefined;
  } | undefined;
}

function toCheckStatus(value?: string | null): VerificationCheckStatus {
  if (value === 'blocked') {
    return 'blocked';
  }

  if (value === 'conditional') {
    return 'warning';
  }

  return 'passed';
}

function summarizeCheck(status: VerificationCheckStatus, blockedCount = 0, warningCount = 0) {
  if (status === 'blocked') {
    return blockedCount > 0
      ? `blocked with ${blockedCount} blocker(s)`
      : 'blocked';
  }

  if (status === 'warning') {
    return warningCount > 0
      ? `conditional with ${warningCount} warning(s)`
      : 'conditional';
  }

  return 'likely ready';
}

export class MetaVerificationRunnerService {
  private readonly auditRepository = new AuditRepository();
  private readonly metaSyncService = new MetaSyncService();
  private readonly preflightCheckService = new PreflightCheckService();
  private readonly duplicateTreeService = new DuplicateTreeService();

  private async runCheck(check: VerificationCheckResult['check'], runner: () => Promise<Omit<VerificationCheckResult, 'check'>>) {
    try {
      const result = await runner();
      return {
        check,
        ...result
      } satisfies VerificationCheckResult;
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : new AppError(`${check} failed`, 'REMOTE_TEMPORARY_FAILURE', 500, {
            originalMessage: error instanceof Error ? error.message : 'Unknown verification runner error'
          });

      return {
        check,
        status: 'blocked',
        summary: appError.message,
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      } satisfies VerificationCheckResult;
    }
  }

  async run(input: MetaVerificationRunnerInput) {
    if (!input.reason || input.reason.trim().length < 5) {
      throw new AppError('Verification reason is required and must be at least 5 characters', 'VALIDATION_ERROR', 400);
    }

    const shouldSyncHierarchy = input.syncHierarchy ?? true;
    const hasAnyCheck = shouldSyncHierarchy
      || Boolean(input.createAdPreflight)
      || Boolean(input.promotability)
      || Boolean(input.duplicateAdPreflight)
      || Boolean(input.duplicateTree);

    if (!hasAnyCheck) {
      throw new AppError('At least one verification check is required', 'VALIDATION_ERROR', 400);
    }

    const actor = input.actor ?? 'internal-api';
    const executedAt = new Date().toISOString();
    const checks: VerificationCheckResult[] = [];

    if (shouldSyncHierarchy) {
      checks.push(await this.runCheck('sync-hierarchy', async () => {
        const result = await this.metaSyncService.syncAccountHierarchy(input.limit ?? 25);
        return {
          status: 'passed',
          summary: `synced ${result.campaigns.length} campaign(s), ${result.adSets.length} ad set(s), ${result.ads.length} ad(s)`,
          payload: {
            syncedAccountId: result.account?.accountId ?? null,
            campaignCount: result.campaigns.length,
            adSetCount: result.adSets.length,
            adCount: result.ads.length,
            paging: result.paging ?? null,
            adSetPaging: result.adSetPaging ?? null,
            adPaging: result.adPaging ?? null
          }
        };
      }));
    }

    if (input.createAdPreflight) {
      checks.push(await this.runCheck('preflight-create-ad', async () => {
        const result = await this.preflightCheckService.preflightCreateAd({
          draft: input.createAdPreflight!,
          reason: input.reason,
          actor
        });
        const status = toCheckStatus(result.status);

        return {
          status,
          summary: summarizeCheck(status, result.blockers?.length ?? 0, result.warnings?.length ?? 0),
          payload: result
        };
      }));
    }

    if (input.promotability) {
      checks.push(await this.runCheck('inspect-ad-promotability', async () => {
        const result = await this.preflightCheckService.inspectAdPromotability({
          adId: input.promotability!.adId,
          targetAdSetId: input.promotability!.targetAdSetId
        });
        const status = toCheckStatus(result.status);

        return {
          status,
          summary: summarizeCheck(status, result.blockers?.length ?? 0, result.warnings?.length ?? 0),
          payload: result
        };
      }));
    }

    if (input.duplicateAdPreflight) {
      checks.push(await this.runCheck('preflight-duplicate-ad', async () => {
        const result = await this.preflightCheckService.preflightDuplicateAd({
          draft: {
            sourceAdId: input.duplicateAdPreflight!.sourceAdId,
            targetAdSetId: input.duplicateAdPreflight!.targetAdSetId,
            statusOption: input.duplicateAdPreflight!.statusOption,
            renameOptions: input.duplicateAdPreflight!.renameOptions,
            creativeParameters: input.duplicateAdPreflight!.creativeParameters
          },
          reason: input.reason,
          actor
        });
        const status = toCheckStatus(result.status);

        return {
          status,
          summary: summarizeCheck(status, result.blockers?.length ?? 0, result.warnings?.length ?? 0),
          payload: result
        };
      }));
    }

    if (input.duplicateTree) {
      checks.push(await this.runCheck('duplicate-tree-dry-run', async () => {
        const result = await this.duplicateTreeService.previewDuplicateTree({
          draft: {
            sourceCampaignId: input.duplicateTree!.sourceCampaignId,
            statusOption: input.duplicateTree!.statusOption,
            includeAds: input.duplicateTree!.includeAds,
            cleanupOnFailure: input.duplicateTree!.cleanupOnFailure,
            namePrefix: input.duplicateTree!.namePrefix,
            nameSuffix: input.duplicateTree!.nameSuffix
          },
          reason: input.reason,
          actor,
          dryRun: true,
          confirmHighImpact: false
        });

        return {
          status: 'passed',
          summary: `planned ${result.totals.adSets} ad set(s) and ${result.totals.ads} ad(s) in duplicate-tree dry-run`,
          payload: result
        };
      }));
    }

    const blocked = checks.filter((item) => item.status === 'blocked').length;
    const warnings = checks.filter((item) => item.status === 'warning').length;
    const passed = checks.filter((item) => item.status === 'passed').length;
    const overallStatus: VerificationCheckStatus = blocked > 0
      ? 'blocked'
      : warnings > 0
        ? 'warning'
        : 'passed';

    const response = {
      ok: true,
      action: 'meta-verification-runner',
      actor,
      reason: input.reason,
      executedAt,
      overallStatus,
      summary: {
        total: checks.length,
        passed,
        warnings,
        blocked
      },
      checks
    };

    await this.auditRepository.create({
      operationType: 'meta.verification.run',
      actor,
      targetType: 'verification-suite',
      targetId: 'meta-regression',
      status: 'success',
      reason: input.reason,
      metadata: response
    });

    return response;
  }
}
