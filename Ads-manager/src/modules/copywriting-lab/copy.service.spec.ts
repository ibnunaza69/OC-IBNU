import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopyService } from './copy.service.js';
import { AppError } from '../../lib/errors.js';

const mockAuditCreate = vi.fn();
vi.mock('../foundation/audit/audit.repository.js', () => ({
  AuditRepository: vi.fn().mockImplementation(() => ({
    create: mockAuditCreate,
  })),
}));

const mockGetNextVersionNumber = vi.fn();
const mockCreateVariant = vi.fn();
const mockFindVariantById = vi.fn();
const mockListVariants = vi.fn();
const mockCreateReview = vi.fn();
const mockListReviews = vi.fn();
vi.mock('./copy.repository.js', () => ({
  CopyRepository: vi.fn().mockImplementation(() => ({
    getNextVersionNumber: mockGetNextVersionNumber,
    createVariant: mockCreateVariant,
    findVariantById: mockFindVariantById,
    listVariants: mockListVariants,
    createReview: mockCreateReview,
    listReviews: mockListReviews,
  })),
}));

const mockGetCampaign = vi.fn();
vi.mock('../meta-sync/repositories/meta-campaign.repository.js', () => ({
  MetaCampaignSnapshotRepository: vi.fn().mockImplementation(() => ({
    getLatestByCampaignId: mockGetCampaign,
  })),
}));

const mockGetAdSet = vi.fn();
vi.mock('../meta-sync/repositories/meta-adset.repository.js', () => ({
  MetaAdSetSnapshotRepository: vi.fn().mockImplementation(() => ({
    getLatestByAdSetId: mockGetAdSet,
  })),
}));

const mockGetAd = vi.fn();
vi.mock('../meta-sync/repositories/meta-ad.repository.js', () => ({
  MetaAdSnapshotRepository: vi.fn().mockImplementation(() => ({
    getLatestByAdId: mockGetAd,
  })),
}));

describe('CopyService', () => {
  let service: CopyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CopyService();
  });

  describe('generateVariants', () => {
    it('should generate copy variants correctly', async () => {
      mockGetCampaign.mockResolvedValue({ campaignId: 'camp_1', name: 'Test Campaign' });
      mockGetNextVersionNumber.mockResolvedValue(1);
      mockCreateVariant.mockImplementation(async (data) => ({ id: 'var_1', ...data }));

      const result = await service.generateVariants({
        brief: 'Test brief',
        actor: 'user_1',
        reason: 'Testing generation',
        campaignId: 'camp_1',
        styles: ['benefit-led', 'promo'],
      });

      expect(result.ok).toBe(true);
      expect(result.items.length).toBe(2);
      expect(mockGetCampaign).toHaveBeenCalledWith('camp_1');
      expect(mockCreateVariant).toHaveBeenCalledTimes(2);
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'copy.variant.generate',
          status: 'success',
        })
      );
    });

    it('should handle error when createVariant fails', async () => {
      mockGetNextVersionNumber.mockResolvedValue(1);
      mockCreateVariant.mockResolvedValue(null);

      await expect(
        service.generateVariants({
          brief: 'Test brief',
          actor: 'user_1',
          reason: 'Testing generation',
        })
      ).rejects.toThrow(AppError);
    });
  });

  describe('reviseVariant', () => {
    it('should revise an existing variant', async () => {
      const sourceVariant = {
        id: 'var_1',
        lineageKey: 'lineage_1',
        primaryText: 'Original text',
        headline: 'Original headline',
        description: 'Original desc',
        style: 'promo',
        brief: 'Test brief',
      };
      mockFindVariantById.mockResolvedValue(sourceVariant);
      mockGetNextVersionNumber.mockResolvedValue(2);
      mockCreateVariant.mockImplementation(async (data) => ({ id: 'var_2', versionNumber: 2, ...data }));

      const result = await service.reviseVariant({
        variantId: 'var_1',
        instruction: 'Make it short',
        actor: 'user_1',
        reason: 'Revising',
      });

      expect(result.ok).toBe(true);
      expect(result.sourceVariantId).toBe('var_1');
      expect(result.item.id).toBe('var_2');
      expect(mockCreateVariant).toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'copy.variant.revise',
        })
      );
    });

    it('should throw if variant not found', async () => {
      mockFindVariantById.mockResolvedValue(null);

      await expect(
        service.reviseVariant({
          variantId: 'invalid_var',
          instruction: 'Make it short',
          actor: 'user_1',
          reason: 'Revising',
        })
      ).rejects.toThrow(/Copy variant not found/);
    });
  });

  describe('reviewCopy', () => {
    it('should review an existing variant', async () => {
      const variant = {
        id: 'var_1',
        primaryText: 'Buy this product now! It is very good.',
        headline: 'Great Product',
        description: 'Description',
      };
      mockFindVariantById.mockResolvedValue(variant);
      mockCreateReview.mockImplementation(async (data) => ({ id: 'rev_1', overallScore: 4, ...data }));

      const result = await service.reviewCopy({
        variantId: 'var_1',
        actor: 'user_1',
        reason: 'Reviewing',
      });

      expect(result.ok).toBe(true);
      expect(result.review.id).toBe('rev_1');
      expect(mockCreateReview).toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'copy.review.create',
          targetType: 'copy-variant',
          targetId: 'var_1',
        })
      );
    });

    it('should review ad-hoc copy', async () => {
      mockCreateReview.mockImplementation(async (data) => ({ id: 'rev_2', overallScore: 3, ...data }));

      const result = await service.reviewCopy({
        primaryText: 'Test primary text',
        headline: 'Test headline',
        actor: 'user_1',
        reason: 'Ad-hoc review',
      });

      expect(result.ok).toBe(true);
      expect(result.review.id).toBe('rev_2');
      expect(mockCreateReview).toHaveBeenCalledWith(
        expect.objectContaining({ reviewMode: 'ad-hoc' })
      );
    });

    it('should throw if ad-hoc review is missing required fields', async () => {
      await expect(
        service.reviewCopy({
          actor: 'user_1',
          reason: 'Ad-hoc review',
        })
      ).rejects.toThrow(/primaryText and headline are required/);
    });
  });

  describe('getVariant & listVariants & listReviews', () => {
    it('should get a variant with reviews', async () => {
      mockFindVariantById.mockResolvedValue({ id: 'var_1' });
      mockListReviews.mockResolvedValue([{ id: 'rev_1' }]);

      const result = await service.getVariant('var_1');
      expect(result.ok).toBe(true);
      expect(result.item.id).toBe('var_1');
      expect(result.reviews.length).toBe(1);
    });

    it('should list variants', async () => {
      mockListVariants.mockResolvedValue([{ id: 'var_1' }, { id: 'var_2' }]);

      const result = await service.listVariants({});
      expect(result.ok).toBe(true);
      expect(result.count).toBe(2);
      expect(result.items.length).toBe(2);
    });

    it('should list reviews', async () => {
      mockListReviews.mockResolvedValue([{ id: 'rev_1' }]);

      const result = await service.listReviews({});
      expect(result.ok).toBe(true);
      expect(result.count).toBe(1);
      expect(result.items.length).toBe(1);
    });
  });
});
