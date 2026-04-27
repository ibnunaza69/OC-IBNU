import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { WriteApprovalRepository } from '../foundation/approvals/write-approval.repository.js';

export interface IssueMetaWriteApprovalInput {
  operationType:
    | 'meta.write.status-change'
    | 'meta.budget.change'
    | 'meta.campaign.create'
    | 'meta.adset.create'
    | 'meta.ad.create'
    | 'meta.campaign.delete'
    | 'meta.adset.delete'
    | 'meta.campaign.duplicate'
    | 'meta.campaign.duplicate-tree'
    | 'meta.adset.duplicate'
    | 'meta.ad.duplicate'
    | 'meta.video.publish'
    | 'meta.rule.create'
    | 'meta.rule.update'
    | 'meta.rule.status-change'
    | 'meta.rule.delete';
  targetType: 'campaign' | 'adset' | 'ad' | 'rule' | 'asset-library';
  targetId: string;
  actor: string;
  reason: string;
  payload: Record<string, unknown>;
}

export interface ConsumeMetaWriteApprovalInput extends IssueMetaWriteApprovalInput {
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function hashString(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function buildFingerprint(input: IssueMetaWriteApprovalInput) {
  return hashString(JSON.stringify(sortValue({
    operationType: input.operationType,
    targetType: input.targetType,
    targetId: input.targetId,
    actor: input.actor,
    reason: input.reason,
    payload: input.payload
  })));
}

export class MetaApprovalService {
  private readonly repository = new WriteApprovalRepository();
  private readonly auditRepository = new AuditRepository();

  async issueApproval(input: IssueMetaWriteApprovalInput) {
    if (!input.reason || input.reason.trim().length < 5) {
      throw new AppError('Approval reason is required and must be at least 5 characters', 'VALIDATION_ERROR', 400);
    }

    const approvalToken = randomBytes(18).toString('hex');
    const approvalTokenHash = hashString(approvalToken);
    const requestFingerprint = buildFingerprint(input);
    const expiresAt = new Date(Date.now() + (env.META_WRITE_APPROVAL_TTL_SECONDS * 1000));

    const approval = await this.repository.create({
      operationType: input.operationType,
      targetType: input.targetType,
      targetId: input.targetId,
      actor: input.actor,
      reason: input.reason,
      requestFingerprint,
      approvalTokenHash,
      status: 'pending',
      payload: input.payload,
      expiresAt
    });

    if (!approval) {
      throw new AppError('Failed to create approval record', 'REMOTE_TEMPORARY_FAILURE', 500);
    }

    await this.auditRepository.create({
      operationType: 'meta.write.approval.issue',
      actor: input.actor,
      targetType: input.targetType,
      targetId: input.targetId,
      status: 'success',
      reason: input.reason,
      metadata: {
        approvalId: approval.id,
        expiresAt,
        operationType: input.operationType,
        payload: input.payload
      }
    });

    return {
      ok: true,
      approvalId: approval.id,
      approvalToken,
      expiresAt,
      operationType: input.operationType,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: input.payload
    };
  }

  async assertAndConsumeApproval(input: ConsumeMetaWriteApprovalInput) {
    if (!env.META_WRITE_APPROVAL_REQUIRED) {
      return {
        ok: true,
        required: false,
        approvalId: null
      };
    }

    if (!input.approvalId || !input.approvalToken) {
      throw new AppError('Approval id and token are required for live write', 'POLICY_REJECTED', 403);
    }

    const approval = await this.repository.findById(input.approvalId);

    if (!approval) {
      throw new AppError('Approval not found', 'RESOURCE_NOT_FOUND', 404);
    }

    const approvalRecord = approval;

    if (approvalRecord.status !== 'pending') {
      throw new AppError('Approval is no longer pending', 'POLICY_REJECTED', 409);
    }

    if (approvalRecord.expiresAt.getTime() <= Date.now()) {
      await this.repository.markExpired(approvalRecord.id);
      throw new AppError('Approval has expired', 'POLICY_REJECTED', 409);
    }

    const expectedFingerprint = buildFingerprint({
      operationType: input.operationType,
      targetType: input.targetType,
      targetId: input.targetId,
      actor: input.actor,
      reason: input.reason,
      payload: input.payload
    });

    if (approvalRecord.requestFingerprint !== expectedFingerprint) {
      throw new AppError('Approval does not match this write request', 'POLICY_REJECTED', 409);
    }

    if (approvalRecord.approvalTokenHash !== hashString(input.approvalToken)) {
      throw new AppError('Invalid approval token', 'PERMISSION_DENIED', 403);
    }

    await this.repository.markUsed(approvalRecord.id);

    await this.auditRepository.create({
      operationType: 'meta.write.approval.consume',
      actor: input.actor,
      targetType: input.targetType,
      targetId: input.targetId,
      status: 'success',
      reason: input.reason,
      metadata: {
        approvalId: approvalRecord.id,
        operationType: input.operationType,
        payload: input.payload
      }
    });

    return {
      ok: true,
      required: true,
      approvalId: approvalRecord.id
    };
  }
}
