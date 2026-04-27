import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BudgetControlService } from './budget-control.service.js';
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

const mockGetCampaign = vi.fn();
const mockUpsertCampaign = vi.fn();
vi.mock('../meta-sync/repositories/meta-campaign.repository.js', () => ({
  MetaCampaignSnapshotRepository: vi.fn().mockImplementation(() => ({
    getLatestByCampaignId: mockGetCampaign,
    upsert: mockUpsertCampaign,
  })),
}));

const mockGetAdSet = vi.fn();
const mockUpsertAdSet = vi.fn();
vi.mock('../meta-sync/repositories/meta-adset.repository.js', () => ({
  MetaAdSetSnapshotRepository: vi.fn().mockImplementation(() => ({
    getLatestByAdSetId: mockGetAdSet,
    upsert: mockUpsertAdSet,
  })),
}));

const mockMetaClient = {
  updateCampaignDailyBudget: vi.fn(),
  getCampaign: vi.fn(),
  updateAdSetDailyBudget: vi.fn(),
  getAdSet: vi.fn(),
};
vi.mock('../providers/meta/meta.client.js', () => ({
  MetaClient: vi.fn().mockImplementation(() => mockMetaClient),
}));

const mockAssertAndConsumeApproval = vi.fn();
vi.mock('../meta-write/meta-approval.service.js', () => ({
  MetaApprovalService: vi.fn().mockImplementation(() => ({
    assertAndConsumeApproval: mockAssertAndConsumeApproval,
  })),
}));

describe('BudgetControlService', () => {
  let service: BudgetControlService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BudgetControlService();
  });

  describe('Validation & Authorization', () => {
    it('should throw if reason is too short', async () => {
      await expect(
        service.adjustBudget({
          targetType: 'campaign',
          targetId: 'camp_1',
          mutationType: 'increase_amount',
          value: 1000,
          reason: 'abc', // < 5 chars
          secret: 'secret123',
        })
      ).rejects.toThrow(AppError);
    });

    it('should throw if secret is invalid and not dry run', async () => {
      await expect(
        service.adjustBudget({
          targetType: 'campaign',
          targetId: 'camp_1',
          mutationType: 'increase_amount',
          value: 1000,
          reason: 'Valid reason',
          secret: 'wrong_secret',
        })
      ).rejects.toThrow(/Invalid write secret/);
    });
  });

  describe('Campaign Budget Adjustment', () => {
    it('should fail if campaign has no daily budget (CBO off)', async () => {
      mockGetCampaign.mockResolvedValue({ id: 'snap_1', dailyBudget: null });

      await expect(
        service.adjustBudget({
          targetType: 'campaign',
          targetId: 'camp_1',
          mutationType: 'increase_amount',
          value: 1000,
          reason: 'Increase budget test',
          secret: 'secret123',
        })
      ).rejects.toThrow(/Campaign does not have a daily budget/);
    });

    it('should calculate new budget correctly and call approval service', async () => {
      mockGetCampaign.mockResolvedValue({ id: 'snap_1', dailyBudget: '10000' });
      mockMetaClient.updateCampaignDailyBudget.mockResolvedValue({ data: { success: true } });
      mockMetaClient.getCampaign.mockResolvedValue({ data: { id: 'camp_1', dailyBudget: '12000' } });

      const result = await service.adjustBudget({
        targetType: 'campaign',
        targetId: 'camp_1',
        mutationType: 'increase_percent',
        value: 20, // 20% increase
        reason: 'Increase budget 20%',
        secret: 'secret123',
      });

      expect(result.ok).toBe(true);
      expect(result.currentDailyBudget).toBe(10000);
      expect(result.nextDailyBudget).toBe(12000);
      expect(result.delta).toBe(2000);

      expect(mockAssertAndConsumeApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'campaign',
          targetId: 'camp_1',
          payload: { nextDailyBudget: 12000, mutationType: 'increase_percent' },
        })
      );

      expect(mockMetaClient.updateCampaignDailyBudget).toHaveBeenCalledWith('camp_1', 12000);
    });
  });

  describe('AdSet Budget Adjustment', () => {
    it('should reject if parent Campaign uses CBO', async () => {
      mockGetAdSet.mockResolvedValue({ id: 'snap_adset_1', dailyBudget: null, campaignId: 'camp_1' });
      mockGetCampaign.mockResolvedValue({ id: 'snap_camp_1', dailyBudget: '50000' }); // Campaign has budget

      await expect(
        service.adjustBudget({
          targetType: 'adset',
          targetId: 'adset_1',
          mutationType: 'set_amount',
          value: 10000,
          reason: 'Set adset budget',
          secret: 'secret123',
        })
      ).rejects.toThrow(/Cannot mutate Ad Set budget because parent Campaign uses Campaign Budget Optimization/);
    });

    it('should adjust AdSet budget if valid', async () => {
      mockGetAdSet.mockResolvedValue({ id: 'snap_adset_1', dailyBudget: '5000', campaignId: 'camp_1' });
      mockMetaClient.updateAdSetDailyBudget.mockResolvedValue({ data: { success: true } });
      mockMetaClient.getAdSet.mockResolvedValue({ data: { id: 'adset_1', dailyBudget: '4000' } });

      const result = await service.adjustBudget({
        targetType: 'adset',
        targetId: 'adset_1',
        mutationType: 'decrease_amount',
        value: 1000,
        reason: 'Decrease adset budget',
        secret: 'secret123',
      });

      expect(result.ok).toBe(true);
      expect(result.nextDailyBudget).toBe(4000);
      expect(mockMetaClient.updateAdSetDailyBudget).toHaveBeenCalledWith('adset_1', 4000);
    });
  });

  describe('Dry Run', () => {
    it('should not update Meta if dryRun is true', async () => {
      mockGetCampaign.mockResolvedValue({ id: 'snap_1', dailyBudget: '10000' });

      const result = await service.adjustBudget({
        targetType: 'campaign',
        targetId: 'camp_1',
        mutationType: 'set_amount',
        value: 15000,
        reason: 'Test dry run',
        dryRun: true,
      });

      expect(result.mode).toBe('dry-run');
      expect(result.nextDailyBudget).toBe(15000);
      expect(mockAssertAndConsumeApproval).not.toHaveBeenCalled();
      expect(mockMetaClient.updateCampaignDailyBudget).not.toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'budget.adjust.preview',
        })
      );
    });
  });
});
