import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PerformanceAnalysisService } from './performance-analysis.service.js';

vi.mock('../../config/env.js', () => ({
  env: {
    META_AD_ACCOUNT_ID: 'act_123',
  },
}));

const mockDb = {
  query: {
    metaAdAccountSnapshots: { findFirst: vi.fn() },
    metaCampaignSnapshots: { findMany: vi.fn() },
    metaAdSetSnapshots: { findMany: vi.fn() },
    metaAdSnapshots: { findMany: vi.fn() },
  },
};

vi.mock('../foundation/db/client.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

const fetchObjectInsights = vi.fn();
vi.mock('../providers/meta/meta.client.js', () => ({
  MetaClient: vi.fn(() => ({ fetchObjectInsights })),
}));

function campaign(id: string, spend: string) {
  return {
    campaignId: id,
    name: id,
    effectiveStatus: 'ACTIVE',
    dailyBudget: null,
    lifetimeBudget: null,
    rawPayload: { insights: { data: [{ spend, impressions: '2000' }] } },
  };
}

describe('PerformanceAnalysisService', () => {
  let service: PerformanceAnalysisService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.query.metaAdAccountSnapshots.findFirst.mockResolvedValue({ currency: 'USD' });
    service = new PerformanceAnalysisService();
  });

  it('returns top campaigns sorted by spend desc', async () => {
    mockDb.query.metaCampaignSnapshots.findMany.mockResolvedValue([
      campaign('low', '10'),
      campaign('mid', '50'),
      campaign('high', '200'),
    ]);

    const result = await service.getPerformers({
      level: 'campaign',
      metric: 'spend',
      direction: 'top',
      limit: 2,
      accountId: 'act_123',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items.map((i) => i.objectId)).toEqual(['high', 'mid']);
    }
  });

  it('returns bottom campaigns (cheapest cpc first) when asking top cpc', async () => {
    // For cpc, lower is better — "top" means ascending.
    mockDb.query.metaCampaignSnapshots.findMany.mockResolvedValue([
      { ...campaign('c-cheap', '100'), rawPayload: { insights: { data: [{ cpc: '0.5' }] } } },
      { ...campaign('c-mid', '100'), rawPayload: { insights: { data: [{ cpc: '1.5' }] } } },
      { ...campaign('c-expensive', '100'), rawPayload: { insights: { data: [{ cpc: '3.0' }] } } },
    ]);

    const result = await service.getPerformers({
      level: 'campaign',
      metric: 'cpc',
      direction: 'top',
      limit: 1,
      accountId: 'act_123',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0]?.objectId).toBe('c-cheap');
    }
  });

  it('comparePeriods returns diff between two windows', async () => {
    fetchObjectInsights
      .mockResolvedValueOnce({
        data: { data: [{ spend: '100', impressions: '1000', clicks: '50' }] },
      })
      .mockResolvedValueOnce({
        data: { data: [{ spend: '50', impressions: '500', clicks: '10' }] },
      });

    const result = await service.comparePeriods({
      objectId: '123',
      windowA: { datePreset: 'last_7d' },
      windowB: { datePreset: 'previous_7d' },
    });

    expect(result.ok).toBe(true);
    expect(result.metricsA.spend).toBe(100);
    expect(result.metricsB.spend).toBe(50);
    expect(result.diff.spend.absolute).toBe(50);
    expect(result.diff.spend.percent).toBe(100);
    expect(result.diff.clicks.absolute).toBe(40);
  });
});
