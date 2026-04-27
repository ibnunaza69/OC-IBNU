import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import type { MetaBudgetWriteRequest, MetaStatusWriteRequest } from './meta-write.types.js';

export class MetaWriteGate {
  assertAllowed(request: MetaStatusWriteRequest) {
    if (!request.reason || request.reason.trim().length < 5) {
      throw new AppError('Write reason is required and must be at least 5 characters', 'VALIDATION_ERROR', 400);
    }

    if (!request.targetId || request.targetId.trim().length < 5) {
      throw new AppError('Target id is required', 'VALIDATION_ERROR', 400);
    }

    if (!['campaign', 'ad'].includes(request.targetType)) {
      throw new AppError('Unsupported write target type', 'VALIDATION_ERROR', 400);
    }

    if (!['ACTIVE', 'PAUSED'].includes(request.nextStatus)) {
      throw new AppError('Unsupported target status', 'VALIDATION_ERROR', 400);
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

  assertBudgetAllowed(request: MetaBudgetWriteRequest) {
    if (!request.reason || request.reason.trim().length < 5) {
      throw new AppError('Write reason is required and must be at least 5 characters', 'VALIDATION_ERROR', 400);
    }

    if (!request.targetId || request.targetId.trim().length < 5) {
      throw new AppError('Target id is required', 'VALIDATION_ERROR', 400);
    }

    if (request.targetType !== 'campaign') {
      throw new AppError('Unsupported budget target type', 'VALIDATION_ERROR', 400);
    }

    if (!Number.isInteger(request.nextDailyBudget) || request.nextDailyBudget <= 0) {
      throw new AppError('nextDailyBudget must be a positive integer', 'VALIDATION_ERROR', 400);
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

  getStatus() {
    return {
      ok: true,
      gate: {
        enabled: env.META_WRITE_ENABLED,
        secretRequired: Boolean(env.META_WRITE_SECRET),
        approvalRequired: env.META_WRITE_APPROVAL_REQUIRED,
        approvalTtlSeconds: env.META_WRITE_APPROVAL_TTL_SECONDS,
        allowedTargetTypes: ['campaign', 'ad'],
        allowedStatuses: ['ACTIVE', 'PAUSED'],
        budgetGuardrails: {
          campaignOnly: true,
          maxAbsoluteDelta: env.META_BUDGET_MAX_ABSOLUTE_DELTA,
          maxPercentDelta: env.META_BUDGET_MAX_PERCENT_DELTA
        },
        notes: [
          'dry-run allowed even when live write is disabled',
          'live write requires META_WRITE_ENABLED=true',
          'if META_WRITE_SECRET is set, x-meta-write-secret header is required for live write',
          'if META_WRITE_APPROVAL_REQUIRED=true, a matching approval id/token pair is required for live write',
          'campaign budget changes beyond configured delta guardrails are blocked'
        ]
      }
    };
  }
}
