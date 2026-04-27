import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartStopService } from './start-stop.service.js';
import { AppError } from '../../lib/errors.js';

vi.mock('../../config/env.js', () => ({
  env: {
    META_WRITE_ENABLED: true,
    META_AD_ACCOUNT_ID: 'act_123',
  },
}));

vi.mock('../../config/settings.js', () => ({
  configService: {
    getMetaAccountId: vi.fn().mockResolvedValue('act_123')
  }
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

const mockGetAd = vi.fn();
const mockUpsertAd = vi.fn();
vi.mock('../meta-sync/repositories/meta-ad.repository.js', () => ({
  MetaAdSnapshotRepository: vi.fn().mockImplementation(() => ({
    getLatestByAdId: mockGetAd,
    upsert: mockUpsertAd,
  })),
}));

const mockMetaClient = {
  updateCampaignStatus: vi.fn(),
  getCampaign: vi.fn(),
  updateAdSetStatus: vi.fn(),
  getAdSet: vi.fn(),
  updateAdStatus: vi.fn(),
  getAd: vi.fn(),
};

vi.mock('../providers/meta/meta.client.js', () => ({
  MetaClient: vi.fn().mockImplementation(() => mockMetaClient),
}));

describe('StartStopService', () => {
  let service: StartStopService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StartStopService();
  });

  describe('Validation', () => {
    it('should throw if reason is missing or too short', async () => {
      await expect(
        service.changeStatus({
          targetType: 'campaign',
          targetId: 'camp_1',
          action: 'START',
          reason: 'abc', // < 5 chars
        })
      ).rejects.toThrow(AppError);
    });
  });

  describe('Campaign Status Change', () => {
    it('should pause a campaign successfully', async () => {
      mockGetCampaign.mockResolvedValue({ id: 'snap_1', rawPayload: { status: 'ACTIVE' } });
      mockMetaClient.updateCampaignStatus.mockResolvedValue({ data: { success: true } });
      mockMetaClient.getCampaign.mockResolvedValue({ data: { id: 'camp_1', status: 'PAUSED' } });

      const result = await service.changeStatus({
        targetType: 'campaign',
        targetId: 'camp_1',
        action: 'STOP',
        reason: 'Pause campaign test',
      });

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.targetStatus).toBe('PAUSED');
      expect(mockMetaClient.updateCampaignStatus).toHaveBeenCalledWith('camp_1', 'PAUSED');
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          operationType: 'meta.campaign.status_change',
        })
      );
    });

    it('should return changed:false if status is already PAUSED', async () => {
      mockGetCampaign.mockResolvedValue({ id: 'snap_1', rawPayload: { status: 'PAUSED' } });

      const result = await service.changeStatus({
        targetType: 'campaign',
        targetId: 'camp_1',
        action: 'STOP',
        reason: 'Pause campaign test',
      });

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(false);
      expect(mockMetaClient.updateCampaignStatus).not.toHaveBeenCalled();
    });
  });

  describe('Parent State Blockers', () => {
    it('should prevent unpausing Ad if parent Campaign is PAUSED', async () => {
      mockGetAd.mockResolvedValue({
        id: 'snap_ad',
        campaignId: 'camp_1',
        adSetId: 'adset_1',
        rawPayload: { status: 'PAUSED' },
      });

      mockGetCampaign.mockResolvedValue({ status: 'PAUSED' });

      await expect(
        service.changeStatus({
          targetType: 'ad',
          targetId: 'ad_1',
          action: 'START',
          reason: 'Unpause ad test',
        })
      ).rejects.toThrow(/Parent Campaign camp_1 is not ACTIVE/);
      
      expect(mockAuditCreate).not.toHaveBeenCalled();
    });

    it('should prevent unpausing Ad if parent AdSet is PAUSED', async () => {
      mockGetAd.mockResolvedValue({
        id: 'snap_ad',
        campaignId: 'camp_1',
        adSetId: 'adset_1',
        rawPayload: { status: 'PAUSED' },
      });

      mockGetCampaign.mockResolvedValue({ status: 'ACTIVE' });
      mockGetAdSet.mockResolvedValue({ status: 'PAUSED' });

      await expect(
        service.changeStatus({
          targetType: 'ad',
          targetId: 'ad_1',
          action: 'START',
          reason: 'Unpause ad test',
        })
      ).rejects.toThrow(/Parent AdSet adset_1 is not ACTIVE/);
    });

    it('should prevent unpausing AdSet if parent Campaign is PAUSED', async () => {
      mockGetAdSet.mockResolvedValue({
        id: 'snap_adset',
        campaignId: 'camp_1',
        rawPayload: { status: 'PAUSED' },
      });

      mockGetCampaign.mockResolvedValue({ status: 'PAUSED' });

      await expect(
        service.changeStatus({
          targetType: 'adset',
          targetId: 'adset_1',
          action: 'START',
          reason: 'Unpause adset test',
        })
      ).rejects.toThrow(/Parent Campaign camp_1 is not ACTIVE/);
    });

    it('should allow unpausing Ad if parents are ACTIVE', async () => {
      mockGetAd.mockResolvedValue({
        id: 'snap_ad',
        campaignId: 'camp_1',
        adSetId: 'adset_1',
        rawPayload: { status: 'PAUSED' },
      });

      mockGetCampaign.mockResolvedValue({ status: 'ACTIVE' });
      mockGetAdSet.mockResolvedValue({ status: 'ACTIVE' });

      mockMetaClient.updateAdStatus.mockResolvedValue({ data: { success: true } });
      mockMetaClient.getAd.mockResolvedValue({ data: { id: 'ad_1', status: 'ACTIVE' } });

      const result = await service.changeStatus({
        targetType: 'ad',
        targetId: 'ad_1',
        action: 'START',
        reason: 'Unpause ad test',
      });

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(true);
      expect(mockMetaClient.updateAdStatus).toHaveBeenCalledWith('ad_1', 'ACTIVE');
    });
  });
});
