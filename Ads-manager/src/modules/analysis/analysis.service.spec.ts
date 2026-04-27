import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalysisService } from './analysis.service.js';

vi.mock('../../config/env.js', () => ({
  env: {
    META_AD_ACCOUNT_ID: 'act_123',
  },
}));

const mockWhere = vi.fn();
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockDb = {
  query: {
    metaAdAccountSnapshots: { findFirst: vi.fn() },
    metaCampaignSnapshots: { findFirst: vi.fn(), findMany: vi.fn() },
    metaAdSetSnapshots: { findMany: vi.fn() },
    metaAdSnapshots: { findMany: vi.fn() },
  },
  select: mockSelect,
};

vi.mock('../foundation/db/client.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

describe('AnalysisService', () => {
  let service: AnalysisService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalysisService();
  });

  describe('getOverview', () => {
    it('should return error if accountId is not configured', async () => {
      const result = await service.getOverview('');
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty('reason');
    });

    it('should return valid overview data', async () => {
      mockDb.query.metaAdAccountSnapshots.findFirst.mockResolvedValue({
        accountId: 'act_123',
        name: 'Test Account',
        currency: 'USD',
        accountStatus: 1,
        syncedAt: '2023-10-01T00:00:00Z',
        updatedAt: '2023-10-01T00:00:00Z',
      });

      mockDb.query.metaCampaignSnapshots.findMany.mockResolvedValue([
        { campaignId: 'c1', name: 'C1', effectiveStatus: 'ACTIVE', objective: 'OUTCOME_SALES', dailyBudget: '1000' },
      ]);

      mockDb.query.metaAdSetSnapshots.findMany.mockResolvedValue([
        { adSetId: 'as1', campaignId: 'c1', effectiveStatus: 'ACTIVE', dailyBudget: '1000' },
      ]);

      mockDb.query.metaAdSnapshots.findMany.mockResolvedValue([
        { adId: 'a1', adSetId: 'as1', campaignId: 'c1', effectiveStatus: 'ACTIVE', creativeId: 'cr1' },
      ]);

      mockWhere.mockResolvedValue([{ latestCampaignSyncAt: '2023-10-01T00:00:00Z' }]);

      const result = await service.getOverview('act_123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.account?.accountId).toBe('act_123');
        expect(result.totals.campaigns).toBe(1);
        expect(result.totals.adSets).toBe(1);
        expect(result.totals.ads).toBe(1);
        expect(result.totals.activeCampaigns).toBe(1);
        expect(result.budgets.campaignDailyBudgetTotal).toBe(1000);
      }
    });
  });

  describe('getCampaignInsights', () => {
    it('should return error if campaign not found', async () => {
      mockDb.query.metaCampaignSnapshots.findFirst.mockResolvedValue(null);

      const result = await service.getCampaignInsights('c_invalid');
      expect(result.ok).toBe(false);
    });

    it('should return campaign insights data', async () => {
      mockDb.query.metaCampaignSnapshots.findFirst.mockResolvedValue({
        campaignId: 'c1',
        accountId: 'act_123',
        name: 'Campaign 1',
        objective: 'OUTCOME_SALES',
        effectiveStatus: 'ACTIVE',
        dailyBudget: '1000',
        rawPayload: {
          insights: {
            data: [{
              spend: '500',
              impressions: '1000',
              actions: [{ action_type: 'purchase', value: '10' }],
            }],
          },
        },
        syncedAt: '2023-10-01T00:00:00Z',
      });

      mockDb.query.metaAdAccountSnapshots.findFirst.mockResolvedValue({
        currency: 'USD',
      });

      const result = await service.getCampaignInsights('c1');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.campaignId).toBe('c1');
        expect(result.metrics.spend).toBe(500);
        expect(result.metrics.budgetAmount).toBe(10); // 1000 / 100
      }
    });
  });

  describe('getCampaignHierarchy', () => {
    it('should return error if accountId is not configured', async () => {
      const result = await service.getCampaignHierarchy('');
      expect(result.ok).toBe(false);
    });

    it('should return campaign hierarchy data', async () => {
      mockDb.query.metaAdAccountSnapshots.findFirst.mockResolvedValue({
        currency: 'USD',
      });

      mockDb.query.metaCampaignSnapshots.findMany.mockResolvedValue([
        { campaignId: 'c1', name: 'C1' },
      ]);

      mockDb.query.metaAdSetSnapshots.findMany.mockResolvedValue([
        { adSetId: 'as1', campaignId: 'c1', name: 'AS1' },
      ]);

      mockDb.query.metaAdSnapshots.findMany.mockResolvedValue([
        { adId: 'a1', adSetId: 'as1', campaignId: 'c1', name: 'A1' },
      ]);

      mockWhere.mockResolvedValue([{ latestCampaignSyncAt: '2023-10-01T00:00:00Z' }]);

      const result = await service.getCampaignHierarchy('act_123');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.count).toBe(1);
        expect(result.items[0].adSets).toHaveLength(1);
        expect(result.items[0].adSets[0].ads).toHaveLength(1);
      }
    });
  });
});
