import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuleWriteService } from './rule-write.service.js';
import { AppError } from '../../lib/errors.js';

vi.mock('../../config/env.js', () => ({
  env: {
    META_WRITE_ENABLED: true,
    META_AD_ACCOUNT_ID: 'act_123',
    META_WRITE_SECRET: 'secret123'
  },
}));

const mockAuditCreate = vi.fn();
vi.mock('../foundation/audit/audit.repository.js', () => ({
  AuditRepository: vi.fn().mockImplementation(() => ({
    create: mockAuditCreate,
  })),
}));

const mockRuleUpsert = vi.fn();
const mockGetLatestByRuleId = vi.fn();
const mockDeleteByRuleId = vi.fn();
vi.mock('../meta-sync/repositories/meta-rule.repository.js', () => ({
  MetaRuleSnapshotRepository: vi.fn().mockImplementation(() => ({
    upsert: mockRuleUpsert,
    getLatestByRuleId: mockGetLatestByRuleId,
    deleteByRuleId: mockDeleteByRuleId,
  })),
}));

const mockAssertAndConsumeApproval = vi.fn();
vi.mock('../meta-write/meta-approval.service.js', () => ({
  MetaApprovalService: vi.fn().mockImplementation(() => ({
    assertAndConsumeApproval: mockAssertAndConsumeApproval,
  })),
}));

const mockMetaCreateRule = vi.fn();
const mockMetaUpdateRule = vi.fn();
const mockMetaUpdateRuleStatus = vi.fn();
const mockMetaDeleteRule = vi.fn();
const mockMetaGetRule = vi.fn();
vi.mock('../providers/meta/meta.client.js', () => ({
  MetaClient: vi.fn().mockImplementation(() => ({
    createRule: mockMetaCreateRule,
    updateRule: mockMetaUpdateRule,
    updateRuleStatus: mockMetaUpdateRuleStatus,
    deleteRule: mockMetaDeleteRule,
    getRule: mockMetaGetRule,
  })),
}));

const mockValidateDraft = vi.fn();
vi.mock('./rule-validation.service.js', () => ({
  RuleValidationService: vi.fn().mockImplementation(() => ({
    validateDraft: mockValidateDraft,
  })),
}));

describe('RuleWriteService', () => {
  let service: RuleWriteService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RuleWriteService();
    mockValidateDraft.mockReturnValue({
      normalizedDraft: { name: 'Test Rule', status: 'DISABLED' },
      summary: { explicitApprovalRecommended: false },
      warnings: [],
    });
  });

  describe('Validation & Gate', () => {
    it('should throw if reason is missing or too short', async () => {
      await expect(
        service.createRule({
          draft: {},
          reason: 'abc', // < 5 chars
          secret: 'secret123',
        })
      ).rejects.toThrow(AppError);
    });

    it('should throw if secret is invalid and not dry run', async () => {
      await expect(
        service.createRule({
          draft: {},
          reason: 'Valid reason',
          secret: 'wrong_secret',
        })
      ).rejects.toThrow(/Invalid write secret/);
    });
  });

  describe('createRule', () => {
    it('should preview rule creation if dryRun is true', async () => {
      const result = await service.createRule({
        draft: {},
        reason: 'Dry run test',
        dryRun: true,
      });

      expect(result.mode).toBe('dry-run');
      expect(result.writeGate.ok).toBe(true);
      expect(mockMetaCreateRule).not.toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'meta.rule.preview',
        })
      );
    });

    it('should require confirmHighImpact if rule is ENABLED and high impact', async () => {
      mockValidateDraft.mockReturnValue({
        normalizedDraft: { name: 'Test Rule', status: 'ENABLED' },
        summary: { explicitApprovalRecommended: true },
        warnings: [],
      });

      await expect(
        service.createRule({
          draft: {},
          reason: 'High impact creation',
          secret: 'secret123',
        })
      ).rejects.toThrow(/Live rule create in ENABLED status requires confirmHighImpact=true/);
    });

    it('should create rule successfully', async () => {
      mockMetaCreateRule.mockResolvedValue({ data: { id: 'rule_1' }, status: 200, requestId: 'req_1' });
      mockMetaGetRule.mockResolvedValue({ data: { id: 'rule_1', status: 'DISABLED' } });

      const result = await service.createRule({
        draft: {},
        reason: 'Create test rule',
        secret: 'secret123',
      });

      expect(result.ok).toBe(true);
      expect(result.action).toBe('create-rule');
      expect(result.ruleId).toBe('rule_1');
      expect(mockAssertAndConsumeApproval).toHaveBeenCalled();
      expect(mockMetaCreateRule).toHaveBeenCalled();
      expect(mockMetaGetRule).toHaveBeenCalledWith('rule_1');
      expect(mockRuleUpsert).toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'meta.rule.create',
          status: 'success',
        })
      );
    });
  });

  describe('updateRule', () => {
    it('should throw if snapshot not found', async () => {
      mockGetLatestByRuleId.mockResolvedValue(null);

      await expect(
        service.updateRule({
          ruleId: 'rule_1',
          draft: {},
          reason: 'Update rule',
          secret: 'secret123',
        })
      ).rejects.toThrow(/Rule snapshot not found/);
    });

    it('should update rule successfully', async () => {
      mockGetLatestByRuleId.mockResolvedValue({ rawPayload: {}, updatedAt: new Date(), syncedAt: new Date() });
      mockMetaUpdateRule.mockResolvedValue({ data: { id: 'rule_1' }, status: 200, requestId: 'req_2' });
      mockMetaGetRule.mockResolvedValue({ data: { id: 'rule_1', status: 'DISABLED' } });

      const result = await service.updateRule({
        ruleId: 'rule_1',
        draft: {},
        reason: 'Update rule',
        secret: 'secret123',
      });

      expect(result.ok).toBe(true);
      expect(result.action).toBe('update-rule');
      expect(mockAssertAndConsumeApproval).toHaveBeenCalled();
      expect(mockMetaUpdateRule).toHaveBeenCalledWith('rule_1', expect.any(Object));
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'meta.rule.update',
          status: 'success',
        })
      );
    });
  });

  describe('changeStatus', () => {
    it('should reject if already in the requested status', async () => {
      mockGetLatestByRuleId.mockResolvedValue({ status: 'ENABLED', rawPayload: {} });

      await expect(
        service.changeStatus({
          ruleId: 'rule_1',
          nextStatus: 'ENABLED',
          reason: 'Enable rule',
          secret: 'secret123',
        })
      ).rejects.toThrow(/Rule is already in the requested status/);
    });

    it('should change status successfully', async () => {
      mockGetLatestByRuleId.mockResolvedValue({ status: 'DISABLED', rawPayload: {} });
      mockMetaUpdateRuleStatus.mockResolvedValue({ data: { success: true }, status: 200, requestId: 'req_3' });
      mockMetaGetRule.mockResolvedValue({ data: { id: 'rule_1', status: 'ENABLED' } });

      const result = await service.enableRule('rule_1', 'Enable rule', { secret: 'secret123' });

      expect(result.ok).toBe(true);
      expect(result.nextStatus).toBe('ENABLED');
      expect(mockMetaUpdateRuleStatus).toHaveBeenCalledWith('rule_1', 'ENABLED');
    });
  });

  describe('deleteRule', () => {
    it('should throw if rule snapshot not found', async () => {
      mockGetLatestByRuleId.mockResolvedValue(null);

      await expect(
        service.deleteRule({
          ruleId: 'rule_1',
          reason: 'Delete rule',
          secret: 'secret123',
        })
      ).rejects.toThrow(/Rule snapshot not found/);
    });

    it('should delete rule successfully', async () => {
      mockGetLatestByRuleId.mockResolvedValue({ status: 'DISABLED', name: 'Test', rawPayload: {} });
      mockMetaDeleteRule.mockResolvedValue({ data: { success: true }, status: 200, requestId: 'req_4' });

      const result = await service.deleteRule({
        ruleId: 'rule_1',
        reason: 'Delete rule',
        secret: 'secret123',
      });

      expect(result.ok).toBe(true);
      expect(result.action).toBe('delete-rule');
      expect(mockMetaDeleteRule).toHaveBeenCalledWith('rule_1');
      expect(mockDeleteByRuleId).toHaveBeenCalledWith('rule_1');
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'meta.rule.delete',
          status: 'success',
        })
      );
    });

    it('should require confirmHighImpact if deleting ENABLED rule', async () => {
      mockGetLatestByRuleId.mockResolvedValue({ status: 'ENABLED', name: 'Test', rawPayload: {} });

      await expect(
        service.deleteRule({
          ruleId: 'rule_1',
          reason: 'Delete rule',
          secret: 'secret123',
        })
      ).rejects.toThrow(/Live rule delete requires confirmHighImpact=true/);
    });
  });
});
