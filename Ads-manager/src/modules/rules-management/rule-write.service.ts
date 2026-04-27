import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaRuleSnapshotRepository } from '../meta-sync/repositories/meta-rule.repository.js';
import { MetaApprovalService } from '../meta-write/meta-approval.service.js';
import { MetaClient } from '../providers/meta/meta.client.js';
import { RuleValidationService } from './rule-validation.service.js';
import type { MetaRuleDraftPayload } from './rule-draft.types.js';

interface RuleCreateRequest {
  draft: unknown;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  confirmHighImpact?: boolean | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

interface RuleUpdateRequest extends RuleCreateRequest {
  ruleId: string;
}

interface RuleStatusChangeRequest {
  ruleId: string;
  nextStatus: 'ENABLED' | 'DISABLED';
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  confirmHighImpact?: boolean | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

interface RuleDeleteRequest {
  ruleId: string;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  confirmHighImpact?: boolean | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

function isRuleWriteEnabled(request: { dryRun?: boolean | undefined; secret?: string | undefined; reason: string }) {
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

function toApprovalPayload(draft: MetaRuleDraftPayload) {
  return {
    name: draft.name,
    status: draft.status,
    evaluation_spec: draft.evaluation_spec,
    execution_spec: draft.execution_spec,
    ...(draft.schedule_spec ? { schedule_spec: draft.schedule_spec } : {})
  } satisfies Record<string, unknown>;
}

function toDraftInputFromSnapshot(rawPayload: Record<string, unknown>) {
  const evaluationSpec = rawPayload.evaluation_spec;
  const executionSpec = rawPayload.execution_spec;
  const scheduleSpec = rawPayload.schedule_spec;

  return {
    name: typeof rawPayload.name === 'string' ? rawPayload.name : 'Existing Meta Rule',
    status: rawPayload.status === 'ENABLED' || rawPayload.status === 'DISABLED' ? rawPayload.status : 'DISABLED',
    evaluationSpec: {
      evaluationType:
        evaluationSpec && typeof evaluationSpec === 'object' && (evaluationSpec as Record<string, unknown>).evaluation_type === 'TRIGGER'
          ? 'TRIGGER'
          : 'SCHEDULE',
      filters:
        evaluationSpec && typeof evaluationSpec === 'object' && Array.isArray((evaluationSpec as Record<string, unknown>).filters)
          ? (evaluationSpec as Record<string, unknown>).filters
          : []
    },
    executionSpec: {
      executionType:
        executionSpec && typeof executionSpec === 'object' && typeof (executionSpec as Record<string, unknown>).execution_type === 'string'
          ? (executionSpec as Record<string, unknown>).execution_type
          : 'NOTIFICATION',
      executionOptions:
        executionSpec && typeof executionSpec === 'object' && Array.isArray((executionSpec as Record<string, unknown>).execution_options)
          ? (executionSpec as Record<string, unknown>).execution_options
          : []
    },
    ...(scheduleSpec && typeof scheduleSpec === 'object'
      ? {
          scheduleSpec: {
            scheduleType:
              typeof (scheduleSpec as Record<string, unknown>).schedule_type === 'string'
                ? (scheduleSpec as Record<string, unknown>).schedule_type
                : 'CUSTOM',
            schedule:
              Array.isArray((scheduleSpec as Record<string, unknown>).schedule)
                ? (scheduleSpec as Record<string, unknown>).schedule
                : []
          }
        }
      : {})
  };
}

export class RuleWriteService {
  private readonly validationService = new RuleValidationService();
  private readonly approvalService = new MetaApprovalService();
  private readonly auditRepository = new AuditRepository();
  private readonly metaClient = new MetaClient();
  private readonly ruleRepository = new MetaRuleSnapshotRepository();

  private assertHighImpactConfirmation(options: {
    confirmHighImpact?: boolean | undefined;
    requiresConfirmation: boolean;
    reason: string;
    operationLabel: string;
    details: Record<string, unknown>;
  }) {
    if (!options.requiresConfirmation || options.confirmHighImpact) {
      return;
    }

    throw new AppError(
      `${options.operationLabel} requires confirmHighImpact=true or a safer rollout path`,
      'POLICY_REJECTED',
      409,
      {
        reason: options.reason,
        ...options.details
      }
    );
  }

  private buildSummaryFromSnapshot(rawPayload: Record<string, unknown>) {
    try {
      const draftInput = toDraftInputFromSnapshot(rawPayload);
      return this.validationService.validateDraft(draftInput).summary;
    } catch {
      return null;
    }
  }

  private async refreshRuleSnapshot(ruleId: string) {
    if (!env.META_AD_ACCOUNT_ID) {
      return {
        snapshotUpdated: false,
        ruleId,
        error: 'META_AD_ACCOUNT_ID is not configured'
      };
    }

    try {
      const liveRule = await this.metaClient.getRule(ruleId);
      await this.ruleRepository.upsert(env.META_AD_ACCOUNT_ID, liveRule.data);

      return {
        snapshotUpdated: true,
        ruleId,
        strategy: 'live-read' as const
      };
    } catch (error) {
      return {
        snapshotUpdated: false,
        ruleId,
        strategy: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown rule snapshot refresh error'
      };
    }
  }

  async previewCreateRule(request: RuleCreateRequest) {
    const gate = isRuleWriteEnabled(request);
    const validation = this.validationService.validateDraft(request.draft);

    await this.auditRepository.create({
      operationType: 'meta.rule.preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'rule',
      targetId: `draft:${validation.normalizedDraft.name}`,
      status: 'pending',
      reason: request.reason,
      afterState: {
        draft: validation.normalizedDraft,
        summary: validation.summary
      },
      metadata: {
        dryRun: true,
        warnings: validation.warnings,
        writeGate: gate
      }
    });

    return {
      ...validation,
      mode: 'dry-run',
      writeGate: gate
    };
  }

  async createRule(request: RuleCreateRequest) {
    if (request.dryRun) {
      return this.previewCreateRule(request);
    }

    const gate = isRuleWriteEnabled(request);
    const validation = this.validationService.validateDraft(request.draft);
    const approvalTargetId = `draft:${validation.normalizedDraft.name}`;

    this.assertHighImpactConfirmation({
      confirmHighImpact: request.confirmHighImpact,
      requiresConfirmation: validation.normalizedDraft.status === 'ENABLED' && validation.summary.explicitApprovalRecommended,
      reason: request.reason,
      operationLabel: 'Live rule create in ENABLED status',
      details: {
        targetId: approvalTargetId,
        summary: validation.summary,
        warnings: validation.warnings,
        recommendation: 'Create the rule as DISABLED first, then enable it explicitly after review.'
      }
    });

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.rule.create',
      targetType: 'rule',
      targetId: approvalTargetId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: toApprovalPayload(validation.normalizedDraft),
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.createRule(validation.normalizedDraft);
      const createdRuleId = result.data.id ?? result.data.rule_id ?? approvalTargetId;
      const refreshedSnapshot = result.data.id
        ? await this.refreshRuleSnapshot(result.data.id)
        : {
            snapshotUpdated: false,
            ruleId: createdRuleId,
            strategy: 'missing-id' as const,
            error: 'Meta create rule response did not include rule id'
          };

      await this.auditRepository.create({
        operationType: 'meta.rule.create',
        actor: request.actor ?? 'internal-api',
        targetType: 'rule',
        targetId: createdRuleId,
        status: 'success',
        reason: request.reason,
        afterState: {
          draft: validation.normalizedDraft,
          providerResponse: result.data,
          ruleId: createdRuleId
        },
        metadata: {
          dryRun: false,
          summary: validation.summary,
          warnings: validation.warnings,
          writeGate: gate,
          refreshedSnapshot,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'create-rule',
        ruleId: createdRuleId,
        result: result.data,
        normalizedDraft: validation.normalizedDraft,
        summary: validation.summary,
        warnings: validation.warnings,
        refreshedSnapshot
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule create failed');

      await this.auditRepository.create({
        operationType: 'meta.rule.create',
        actor: request.actor ?? 'internal-api',
        targetType: 'rule',
        targetId: approvalTargetId,
        status: 'failed',
        reason: request.reason,
        afterState: {
          draft: validation.normalizedDraft
        },
        metadata: {
          dryRun: false,
          summary: validation.summary,
          warnings: validation.warnings,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }

  async previewUpdateRule(request: RuleUpdateRequest) {
    const gate = isRuleWriteEnabled(request);
    const snapshot = await this.ruleRepository.getLatestByRuleId(request.ruleId);

    if (!snapshot) {
      throw new AppError('Rule snapshot not found. Sync rules first before attempting update.', 'RESOURCE_NOT_FOUND', 404);
    }

    const validation = this.validationService.validateDraft(request.draft);

    await this.auditRepository.create({
      operationType: 'meta.rule.update-preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'rule',
      targetId: request.ruleId,
      status: 'pending',
      reason: request.reason,
      beforeState: snapshot.rawPayload,
      afterState: {
        draft: validation.normalizedDraft,
        summary: validation.summary
      },
      metadata: {
        dryRun: true,
        warnings: validation.warnings,
        writeGate: gate,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    });

    return {
      ...validation,
      mode: 'dry-run',
      writeGate: gate,
      ruleId: request.ruleId,
      previousRule: snapshot.rawPayload
    };
  }

  async updateRule(request: RuleUpdateRequest) {
    if (request.dryRun) {
      return this.previewUpdateRule(request);
    }

    const gate = isRuleWriteEnabled(request);
    const snapshot = await this.ruleRepository.getLatestByRuleId(request.ruleId);

    if (!snapshot) {
      throw new AppError('Rule snapshot not found. Sync rules first before attempting update.', 'RESOURCE_NOT_FOUND', 404);
    }

    const validation = this.validationService.validateDraft(request.draft);

    this.assertHighImpactConfirmation({
      confirmHighImpact: request.confirmHighImpact,
      requiresConfirmation: validation.normalizedDraft.status === 'ENABLED' && validation.summary.explicitApprovalRecommended,
      reason: request.reason,
      operationLabel: 'Live rule update in ENABLED status',
      details: {
        targetId: request.ruleId,
        summary: validation.summary,
        warnings: validation.warnings,
        recommendation: 'Update the rule in DISABLED status first when impact is non-trivial.'
      }
    });

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.rule.update',
      targetType: 'rule',
      targetId: request.ruleId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: toApprovalPayload(validation.normalizedDraft),
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.updateRule(request.ruleId, validation.normalizedDraft);
      const refreshedSnapshot = await this.refreshRuleSnapshot(request.ruleId);

      await this.auditRepository.create({
        operationType: 'meta.rule.update',
        actor: request.actor ?? 'internal-api',
        targetType: 'rule',
        targetId: request.ruleId,
        status: 'success',
        reason: request.reason,
        beforeState: snapshot.rawPayload,
        afterState: {
          draft: validation.normalizedDraft,
          providerResponse: result.data
        },
        metadata: {
          dryRun: false,
          summary: validation.summary,
          warnings: validation.warnings,
          writeGate: gate,
          refreshedSnapshot,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'update-rule',
        ruleId: request.ruleId,
        result: result.data,
        normalizedDraft: validation.normalizedDraft,
        summary: validation.summary,
        warnings: validation.warnings,
        refreshedSnapshot
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule update failed');

      await this.auditRepository.create({
        operationType: 'meta.rule.update',
        actor: request.actor ?? 'internal-api',
        targetType: 'rule',
        targetId: request.ruleId,
        status: 'failed',
        reason: request.reason,
        beforeState: snapshot.rawPayload,
        afterState: {
          draft: validation.normalizedDraft
        },
        metadata: {
          dryRun: false,
          summary: validation.summary,
          warnings: validation.warnings,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }

  async previewStatusChange(request: RuleStatusChangeRequest) {
    const gate = isRuleWriteEnabled(request);
    const snapshot = await this.ruleRepository.getLatestByRuleId(request.ruleId);

    if (!snapshot) {
      throw new AppError('Rule snapshot not found. Sync rules first before attempting write.', 'RESOURCE_NOT_FOUND', 404);
    }

    const currentStatus = snapshot.status ?? null;
    const noOp = currentStatus === request.nextStatus;

    await this.auditRepository.create({
      operationType: 'meta.rule.status-preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'rule',
      targetId: request.ruleId,
      status: 'pending',
      reason: request.reason,
      beforeState: {
        status: currentStatus,
        snapshotId: snapshot.id
      },
      afterState: {
        status: request.nextStatus
      },
      metadata: {
        dryRun: true,
        noOp,
        writeGate: gate,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      preview: {
        ruleId: request.ruleId,
        currentStatus,
        nextStatus: request.nextStatus,
        noOp,
        dryRun: true,
        writeGate: gate,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    };
  }

  async changeStatus(request: RuleStatusChangeRequest) {
    if (request.dryRun) {
      return this.previewStatusChange(request);
    }

    const gate = isRuleWriteEnabled(request);
    const snapshot = await this.ruleRepository.getLatestByRuleId(request.ruleId);

    if (!snapshot) {
      throw new AppError('Rule snapshot not found. Sync rules first before attempting write.', 'RESOURCE_NOT_FOUND', 404);
    }

    const currentStatus = snapshot.status ?? null;
    const snapshotSummary = this.buildSummaryFromSnapshot((snapshot.rawPayload ?? {}) as Record<string, unknown>);
    if (currentStatus === request.nextStatus) {
      throw new AppError('Rule is already in the requested status', 'POLICY_REJECTED', 409);
    }

    this.assertHighImpactConfirmation({
      confirmHighImpact: request.confirmHighImpact,
      requiresConfirmation: request.nextStatus === 'ENABLED' && Boolean(snapshotSummary?.explicitApprovalRecommended),
      reason: request.reason,
      operationLabel: 'Live enable/high-impact rule activation',
      details: {
        targetId: request.ruleId,
        currentStatus,
        nextStatus: request.nextStatus,
        summary: snapshotSummary,
        recommendation: 'Use confirmHighImpact=true only after explicit review of budget/delivery/mass-operation impact.'
      }
    });

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.rule.status-change',
      targetType: 'rule',
      targetId: request.ruleId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: {
        status: request.nextStatus
      },
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.updateRuleStatus(request.ruleId, request.nextStatus);
      const refreshedSnapshot = await this.refreshRuleSnapshot(request.ruleId);

      await this.auditRepository.create({
        operationType: 'meta.rule.status-change',
        actor: request.actor ?? 'internal-api',
        targetType: 'rule',
        targetId: request.ruleId,
        status: 'success',
        reason: request.reason,
        beforeState: {
          status: currentStatus,
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

      return {
        ok: true,
        mode: 'live',
        action: 'rule-status-change',
        ruleId: request.ruleId,
        previousStatus: currentStatus,
        nextStatus: request.nextStatus,
        result: result.data,
        refreshedSnapshot
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule status change failed');

      await this.auditRepository.create({
        operationType: 'meta.rule.status-change',
        actor: request.actor ?? 'internal-api',
        targetType: 'rule',
        targetId: request.ruleId,
        status: 'failed',
        reason: request.reason,
        beforeState: {
          status: currentStatus,
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

  async enableRule(ruleId: string, reason: string, options: Omit<RuleStatusChangeRequest, 'ruleId' | 'nextStatus' | 'reason'> = {}) {
    return this.changeStatus({
      ruleId,
      nextStatus: 'ENABLED',
      reason,
      ...options
    });
  }

  async disableRule(ruleId: string, reason: string, options: Omit<RuleStatusChangeRequest, 'ruleId' | 'nextStatus' | 'reason'> = {}) {
    return this.changeStatus({
      ruleId,
      nextStatus: 'DISABLED',
      reason,
      ...options
    });
  }

  async previewDeleteRule(request: RuleDeleteRequest) {
    const gate = isRuleWriteEnabled(request);
    const snapshot = await this.ruleRepository.getLatestByRuleId(request.ruleId);

    if (!snapshot) {
      throw new AppError('Rule snapshot not found. Sync rules first before attempting delete.', 'RESOURCE_NOT_FOUND', 404);
    }

    await this.auditRepository.create({
      operationType: 'meta.rule.delete-preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'rule',
      targetId: request.ruleId,
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
        ruleId: request.ruleId,
        currentStatus: snapshot.status ?? null,
        currentName: snapshot.name ?? null,
        dryRun: true,
        writeGate: gate,
        snapshotUpdatedAt: snapshot.updatedAt,
        snapshotSyncedAt: snapshot.syncedAt
      }
    };
  }

  async deleteRule(request: RuleDeleteRequest) {
    if (request.dryRun) {
      return this.previewDeleteRule(request);
    }

    const gate = isRuleWriteEnabled(request);
    const snapshot = await this.ruleRepository.getLatestByRuleId(request.ruleId);

    if (!snapshot) {
      throw new AppError('Rule snapshot not found. Sync rules first before attempting delete.', 'RESOURCE_NOT_FOUND', 404);
    }

    const snapshotSummary = this.buildSummaryFromSnapshot((snapshot.rawPayload ?? {}) as Record<string, unknown>);

    this.assertHighImpactConfirmation({
      confirmHighImpact: request.confirmHighImpact,
      requiresConfirmation: snapshot.status === 'ENABLED' || Boolean(snapshotSummary?.touchesBudget) || Boolean(snapshotSummary?.massOperation),
      reason: request.reason,
      operationLabel: 'Live rule delete',
      details: {
        targetId: request.ruleId,
        currentStatus: snapshot.status ?? null,
        summary: snapshotSummary,
        recommendation: 'Disable the rule first or pass confirmHighImpact=true after explicit review for enabled, budget-impact, or mass-operation rules.'
      }
    });

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.rule.delete',
      targetType: 'rule',
      targetId: request.ruleId,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: {
        ruleId: request.ruleId,
        name: snapshot.name ?? null
      },
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    try {
      const result = await this.metaClient.deleteRule(request.ruleId);
      await this.ruleRepository.deleteByRuleId(request.ruleId);

      await this.auditRepository.create({
        operationType: 'meta.rule.delete',
        actor: request.actor ?? 'internal-api',
        targetType: 'rule',
        targetId: request.ruleId,
        status: 'success',
        reason: request.reason,
        beforeState: snapshot.rawPayload,
        metadata: {
          dryRun: false,
          writeGate: gate,
          localSnapshotDeleted: true,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'delete-rule',
        ruleId: request.ruleId,
        result: result.data,
        localSnapshotDeleted: true
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule delete failed');

      await this.auditRepository.create({
        operationType: 'meta.rule.delete',
        actor: request.actor ?? 'internal-api',
        targetType: 'rule',
        targetId: request.ruleId,
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
