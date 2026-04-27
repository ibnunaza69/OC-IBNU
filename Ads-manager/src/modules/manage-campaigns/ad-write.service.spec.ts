import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdWriteService } from './ad-write.service.js';
import { AppError } from '../../lib/errors.js';

vi.mock('../../config/env.js', () => ({
  env: {
    META_WRITE_ENABLED: true,
    META_WRITE_SECRET: 'test-secret',
    META_AD_ACCOUNT_ID: 'act_123',
  },
}));

const mockAuditCreate = vi.fn();
vi.mock('../foundation/audit/audit.repository.js', () => ({
  AuditRepository: vi.fn().mockImplementation(() => ({
    create: mockAuditCreate,
  })),
}));

const mockAssertAndConsumeApproval = vi.fn();
vi.mock('../meta-write/meta-approval.service.js', () => ({
  MetaApprovalService: vi.fn().mockImplementation(() => ({
    assertAndConsumeApproval: mockAssertAndConsumeApproval,
  })),
}));

const mockMetaClient = {
  getAdSet: vi.fn(),
  getAd: vi.fn(),
  createAdCreative: vi.fn(),
  createAd: vi.fn(),
};
vi.mock('../providers/meta/meta.client.js', () => ({
  MetaClient: vi.fn().mockImplementation(() => mockMetaClient),
}));

const mockBuildImageAssetCreativeDraft = vi.fn();
const mockBuildVideoAssetCreativeDraft = vi.fn();
vi.mock('../asset-generation/creative-draft.service.js', () => ({
  CreativeDraftService: vi.fn().mockImplementation(() => ({
    buildImageAssetCreativeDraft: mockBuildImageAssetCreativeDraft,
    buildVideoAssetCreativeDraft: mockBuildVideoAssetCreativeDraft,
  })),
}));

const mockGetAdSetSnapshot = vi.fn();
const mockUpsertAdSetSnapshot = vi.fn();
vi.mock('../meta-sync/repositories/meta-adset.repository.js', () => ({
  MetaAdSetSnapshotRepository: vi.fn().mockImplementation(() => ({
    getLatestByAdSetId: mockGetAdSetSnapshot,
    upsert: mockUpsertAdSetSnapshot,
  })),
}));

const mockUpsertAdSnapshot = vi.fn();
vi.mock('../meta-sync/repositories/meta-ad.repository.js', () => ({
  MetaAdSnapshotRepository: vi.fn().mockImplementation(() => ({
    upsert: mockUpsertAdSnapshot,
  })),
}));

describe('AdWriteService', () => {
  let service: AdWriteService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AdWriteService();
  });

  describe('Validation & Permissions', () => {
    it('should throw if reason is missing or too short', async () => {
      await expect(
        service.createAd({
          draft: { adSetId: 'adset_1', name: 'Test Ad', creativeId: 'creative_1' },
          reason: 'abc', // < 5 chars
          secret: 'test-secret',
        })
      ).rejects.toThrow(/Write reason is required/);
    });

    it('should throw if secret is invalid', async () => {
      await expect(
        service.createAd({
          draft: { adSetId: 'adset_1', name: 'Test Ad', creativeId: 'creative_1' },
          reason: 'Valid reason',
          secret: 'wrong-secret',
        })
      ).rejects.toThrow(/Invalid write secret/);
    });
  });

  describe('createAd', () => {
    it('should successfully create an ad with existing creative', async () => {
      mockGetAdSetSnapshot.mockResolvedValue({
        id: 'snap_adset',
        adSetId: 'adset_1',
        campaignId: 'camp_1',
        name: 'AdSet 1',
        status: 'ACTIVE',
      });

      mockMetaClient.createAd.mockResolvedValue({
        data: { id: 'new_ad_1' },
        requestId: 'req_1',
        status: 200,
      });

      mockMetaClient.getAd.mockResolvedValue({
        data: { id: 'new_ad_1', status: 'PAUSED' },
      });

      mockUpsertAdSnapshot.mockResolvedValue({});

      const result = await service.createAd({
        draft: {
          adSetId: 'adset_1',
          name: 'New Ad',
          creativeId: 'creative_1',
          status: 'PAUSED',
        },
        reason: 'Testing ad creation',
        secret: 'test-secret',
      });

      expect(result.ok).toBe(true);
      expect(result.adId).toBe('new_ad_1');
      expect(mockAssertAndConsumeApproval).toHaveBeenCalled();
      expect(mockMetaClient.createAd).toHaveBeenCalledWith(
        expect.objectContaining({
          adset_id: 'adset_1',
          name: 'New Ad',
          creative: { creative_id: 'creative_1' },
        })
      );
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'meta.ad.create',
          status: 'success',
          targetId: 'new_ad_1',
        })
      );
    });

    it('should throw if ACTIVE status without confirmHighImpact', async () => {
      mockGetAdSetSnapshot.mockResolvedValue({
        id: 'snap_adset',
        adSetId: 'adset_1',
        campaignId: 'camp_1',
        name: 'AdSet 1',
        status: 'ACTIVE',
      });

      await expect(
        service.createAd({
          draft: {
            adSetId: 'adset_1',
            name: 'New Ad',
            creativeId: 'creative_1',
            status: 'ACTIVE',
          },
          reason: 'Testing high impact',
          secret: 'test-secret',
        })
      ).rejects.toThrow(/requires confirmHighImpact=true/);
    });

    it('should successfully create an ad with inline object story spec', async () => {
      mockGetAdSetSnapshot.mockResolvedValue({
        id: 'snap_adset',
        adSetId: 'adset_1',
        campaignId: 'camp_1',
        name: 'AdSet 1',
        status: 'ACTIVE',
      });

      mockMetaClient.createAdCreative.mockResolvedValue({
        data: { id: 'new_creative_1' },
        requestId: 'req_c1',
        status: 200,
      });

      mockMetaClient.createAd.mockResolvedValue({
        data: { id: 'new_ad_1' },
        requestId: 'req_1',
        status: 200,
      });

      mockMetaClient.getAd.mockResolvedValue({
        data: { id: 'new_ad_1', status: 'PAUSED' },
      });

      const result = await service.createAd({
        draft: {
          adSetId: 'adset_1',
          name: 'New Ad Inline',
          pageId: 'page_1',
          objectStorySpec: {
            page_id: 'page_1',
            link_data: { link: 'https://example.com' },
          },
          status: 'PAUSED',
        },
        reason: 'Testing inline creative ad',
        secret: 'test-secret',
      });

      expect(result.ok).toBe(true);
      expect(mockMetaClient.createAdCreative).toHaveBeenCalledWith(
        expect.objectContaining({
          object_story_spec: expect.objectContaining({ page_id: 'page_1' }),
        })
      );
      expect(mockMetaClient.createAd).toHaveBeenCalledWith(
        expect.objectContaining({
          adset_id: 'adset_1',
          creative: { creative_id: 'new_creative_1' },
        })
      );
    });

    it('should successfully preview an ad (dryRun)', async () => {
      mockGetAdSetSnapshot.mockResolvedValue({
        id: 'snap_adset',
        adSetId: 'adset_1',
        campaignId: 'camp_1',
        name: 'AdSet 1',
        status: 'ACTIVE',
      });

      const result = await service.previewCreateAd({
        draft: {
          adSetId: 'adset_1',
          name: 'Preview Ad',
          creativeId: 'creative_1',
          status: 'PAUSED',
        },
        reason: 'Testing ad preview',
        dryRun: true,
      });

      expect(result.ok).toBe(true);
      expect(result.mode).toBe('dry-run');
      expect(mockMetaClient.createAd).not.toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'meta.ad.preview',
          status: 'pending',
        })
      );
    });
  });
});
