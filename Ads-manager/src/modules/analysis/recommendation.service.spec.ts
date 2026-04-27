import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecommendationService } from './recommendation.service.js';

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

function buildCampaign(id: string, payload: {
  spend?: string;
  impressions?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
}) {
  return {
    campaignId: id,
    name: `Campaign ${id}`,
    effectiveStatus: 'ACTIVE',
    dailyBudget: null,
    lifetimeBudget: null,
    rawPayload: { insights: { data: [payload] } },
  };
}

describe('RecommendationService', () => {
  let service: RecommendationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.query.metaAdAccountSnapshots.findFirst.mockResolvedValue({ currency: 'USD' });
    service = new RecommendationService();
  });

  it('recommends pause when spend > 50 with 0 results over 1000+ impressions', async () => {
    mockDb.query.metaCampaignSnapshots.findMany.mockResolvedValue([
      buildCampaign('c-pause', {
        spend: '120',
        impressions: '5000',
        ctr: '0.1',
      }),
    ]);

    const result = await service.getRecommendations({ level: 'campaign', accountId: 'act_123' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0]?.action).toBe('pause');
    }
  });

  it('recommends inspect when CTR is below 0.5% at 1000+ impressions', async () => {
    mockDb.query.metaCampaignSnapshots.findMany.mockResolvedValue([
      buildCampaign('c-inspect', {
        spend: '10',
        impressions: '2000',
        ctr: '0.2',
        actions: [{ action_type: 'link_click', value: '4' }],
      }),
    ]);

    const result = await service.getRecommendations({ level: 'campaign', accountId: 'act_123' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0]?.action).toBe('inspect');
    }
  });

  it('recommends hold when impressions are below threshold', async () => {
    mockDb.query.metaCampaignSnapshots.findMany.mockResolvedValue([
      buildCampaign('c-hold', {
        spend: '5',
        impressions: '100',
        ctr: '0.3',
      }),
    ]);

    const result = await service.getRecommendations({ level: 'campaign', accountId: 'act_123' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items[0]?.action).toBe('hold');
    }
  });

  it('returns breakdown counts across items', async () => {
    mockDb.query.metaCampaignSnapshots.findMany.mockResolvedValue([
      buildCampaign('c1', { spend: '120', impressions: '5000', ctr: '0.1' }),
      buildCampaign('c2', { spend: '5', impressions: '100', ctr: '0.3' }),
    ]);

    const result = await service.getRecommendations({ level: 'campaign', accountId: 'act_123' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.count).toBe(2);
      expect(result.breakdown.pause).toBe(1);
      expect(result.breakdown.hold).toBe(1);
    }
  });
});
