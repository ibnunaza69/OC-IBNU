import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaSyncService } from './meta-sync.service';
import { MetaClient } from '../providers/meta/meta.client';
import { AuditRepository } from '../foundation/audit/audit.repository';
import { MetaAdAccountSnapshotRepository } from './repositories/meta-ad-account.repository';
import { MetaCampaignSnapshotRepository } from './repositories/meta-campaign.repository';
import { MetaAdSetSnapshotRepository } from './repositories/meta-adset.repository';
import { MetaAdSnapshotRepository } from './repositories/meta-ad.repository';
import { MetaRuleSnapshotRepository } from './repositories/meta-rule.repository';
import { MetaRuleHistorySnapshotRepository } from './repositories/meta-rule-history.repository';
import { env } from '../../config/env';

vi.mock('../../config/env', () => ({
  env: {
    META_AD_ACCOUNT_ID: 'act_123456789',
    LOG_LEVEL: 'info',
  },
}));

vi.mock('../providers/meta/meta.client');
vi.mock('../foundation/audit/audit.repository');
vi.mock('./repositories/meta-ad-account.repository');
vi.mock('./repositories/meta-campaign.repository');
vi.mock('./repositories/meta-adset.repository');
vi.mock('./repositories/meta-ad.repository');
vi.mock('./repositories/meta-rule.repository');
vi.mock('./repositories/meta-rule-history.repository');

describe('MetaSyncService', () => {
  let service: MetaSyncService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MetaSyncService();
  });

  describe('syncAccountAndCampaigns', () => {
    it('should throw an error if accountId is not provided and env is empty', async () => {
      await expect(service.syncAccountAndCampaigns(25, '')).rejects.toThrow('META_AD_ACCOUNT_ID is not configured');
    });

    it('should sync account and campaigns successfully', async () => {
      const mockAccountData = { id: 'act_123', name: 'Test Account' };
      const mockCampaignData = [{ id: 'camp_1', name: 'Campaign 1' }];
      const mockPaging = { next: 'url' };

      const metaClientInstance = vi.mocked(MetaClient).prototype;
      metaClientInstance.getAdAccountBasic.mockResolvedValue({ data: mockAccountData });
      metaClientInstance.listCampaigns.mockResolvedValue({ data: mockCampaignData, paging: mockPaging });

      const adAccountRepoInstance = vi.mocked(MetaAdAccountSnapshotRepository).prototype;
      adAccountRepoInstance.upsert.mockResolvedValue({ ...mockAccountData, _snapshotId: 1 } as any);

      const campaignRepoInstance = vi.mocked(MetaCampaignSnapshotRepository).prototype;
      campaignRepoInstance.bulkUpsert.mockResolvedValue([{ ...mockCampaignData[0], _snapshotId: 1 }] as any);

      const auditRepoInstance = vi.mocked(AuditRepository).prototype;

      const result = await service.syncAccountAndCampaigns(10, 'act_123');

      expect(metaClientInstance.getAdAccountBasic).toHaveBeenCalledWith('act_123');
      expect(metaClientInstance.listCampaigns).toHaveBeenCalledWith(10, 'act_123');
      
      expect(adAccountRepoInstance.upsert).toHaveBeenCalledWith('act_123', mockAccountData);
      expect(campaignRepoInstance.bulkUpsert).toHaveBeenCalledWith('act_123', mockCampaignData);

      expect(auditRepoInstance.create).toHaveBeenCalledWith(expect.objectContaining({
        operationType: 'meta.sync',
        targetType: 'ad-account',
        targetId: 'act_123',
        status: 'success',
      }));

      expect(result.account).toBeDefined();
      expect(result.campaigns).toHaveLength(1);
      expect(result.paging).toEqual(mockPaging);
    });
  });

  describe('syncAdSets', () => {
    it('should throw an error if accountId is missing', async () => {
      await expect(service.syncAdSets(25, '')).rejects.toThrow('META_AD_ACCOUNT_ID is not configured');
    });

    it('should sync ad sets successfully', async () => {
      const mockAdSets = [{ id: 'adset_1', name: 'AdSet 1' }];
      
      const metaClientInstance = vi.mocked(MetaClient).prototype;
      metaClientInstance.listAdSets.mockResolvedValue({ data: mockAdSets });

      const adSetRepoInstance = vi.mocked(MetaAdSetSnapshotRepository).prototype;
      adSetRepoInstance.bulkUpsert.mockResolvedValue([{ ...mockAdSets[0], _snapshotId: 1 }] as any);

      const auditRepoInstance = vi.mocked(AuditRepository).prototype;

      const result = await service.syncAdSets(15, 'act_123');

      expect(metaClientInstance.listAdSets).toHaveBeenCalledWith(15, 'act_123');
      expect(adSetRepoInstance.bulkUpsert).toHaveBeenCalledWith('act_123', mockAdSets);
      expect(auditRepoInstance.create).toHaveBeenCalledWith(expect.objectContaining({
        targetType: 'adset-list',
        status: 'success',
      }));

      expect(result.adSets).toHaveLength(1);
      expect(result.paging).toBeNull();
    });
  });

  describe('syncAds', () => {
    it('should throw an error if accountId is missing', async () => {
      await expect(service.syncAds(25, '')).rejects.toThrow('META_AD_ACCOUNT_ID is not configured');
    });

    it('should sync ads successfully', async () => {
      const mockAds = [{ id: 'ad_1', name: 'Ad 1' }];
      
      const metaClientInstance = vi.mocked(MetaClient).prototype;
      metaClientInstance.listAds.mockResolvedValue({ data: mockAds });

      const adRepoInstance = vi.mocked(MetaAdSnapshotRepository).prototype;
      adRepoInstance.bulkUpsert.mockResolvedValue([{ ...mockAds[0], _snapshotId: 1 }] as any);

      const auditRepoInstance = vi.mocked(AuditRepository).prototype;

      const result = await service.syncAds(20, 'act_123');

      expect(metaClientInstance.listAds).toHaveBeenCalledWith(20, 'act_123');
      expect(adRepoInstance.bulkUpsert).toHaveBeenCalledWith('act_123', mockAds);
      expect(auditRepoInstance.create).toHaveBeenCalledWith(expect.objectContaining({
        targetType: 'ad-list',
        status: 'success',
      }));

      expect(result.ads).toHaveLength(1);
      expect(result.paging).toBeNull();
    });
  });

  describe('syncAccountHierarchy', () => {
    it('should call account, adset, and ad sync methods with correct limits', async () => {
      // We will mock the individual methods on the service itself for this test
      const syncAccountSpy = vi.spyOn(service, 'syncAccountAndCampaigns').mockResolvedValue({
        account: { id: 'act_123' } as any,
        campaigns: [{ id: 'camp_1' }] as any,
        paging: null,
      });
      const syncAdSetsSpy = vi.spyOn(service, 'syncAdSets').mockResolvedValue({
        adSets: [{ id: 'adset_1' }] as any,
        paging: null,
      });
      const syncAdsSpy = vi.spyOn(service, 'syncAds').mockResolvedValue({
        ads: [{ id: 'ad_1' }] as any,
        paging: null,
      });

      const result = await service.syncAccountHierarchy(10, 'act_123');

      expect(syncAccountSpy).toHaveBeenCalledWith(10, 'act_123');
      expect(syncAdSetsSpy).toHaveBeenCalledWith(100, 'act_123'); // Math.max(10 * 10, 50)
      expect(syncAdsSpy).toHaveBeenCalledWith(250, 'act_123'); // Math.max(10 * 25, 100)

      expect(result.account).toBeDefined();
      expect(result.campaigns).toBeDefined();
      expect(result.adSets).toBeDefined();
      expect(result.ads).toBeDefined();
      expect(result.limits).toEqual({
        campaigns: 10,
        adSets: 100,
        ads: 250,
      });
    });
  });

  describe('syncRules', () => {
    it('should throw an error if accountId is missing', async () => {
      await expect(service.syncRules(25, '')).rejects.toThrow('META_AD_ACCOUNT_ID is not configured');
    });

    it('should sync rules successfully', async () => {
      const mockRules = [{ id: 'rule_1', name: 'Rule 1' }];
      
      const metaClientInstance = vi.mocked(MetaClient).prototype;
      metaClientInstance.listRules.mockResolvedValue({ data: mockRules });

      const ruleRepoInstance = vi.mocked(MetaRuleSnapshotRepository).prototype;
      ruleRepoInstance.bulkUpsert.mockResolvedValue([{ ...mockRules[0], _snapshotId: 1 }] as any);

      const auditRepoInstance = vi.mocked(AuditRepository).prototype;

      const result = await service.syncRules(25, 'act_123');

      expect(metaClientInstance.listRules).toHaveBeenCalledWith(25, 'act_123');
      expect(ruleRepoInstance.bulkUpsert).toHaveBeenCalledWith('act_123', mockRules);
      expect(auditRepoInstance.create).toHaveBeenCalledWith(expect.objectContaining({
        targetType: 'rule-list',
        status: 'success',
      }));

      expect(result.rules).toHaveLength(1);
    });
  });

  describe('syncRuleHistory', () => {
    it('should throw an error if accountId is missing', async () => {
      await expect(service.syncRuleHistory(25, '')).rejects.toThrow('META_AD_ACCOUNT_ID is not configured');
    });

    it('should sync rule history successfully', async () => {
      const mockHistory = [{ id: 'hist_1', rule_id: 'rule_1' }];
      
      const metaClientInstance = vi.mocked(MetaClient).prototype;
      metaClientInstance.listRuleHistory.mockResolvedValue({ data: mockHistory });

      const historyRepoInstance = vi.mocked(MetaRuleHistorySnapshotRepository).prototype;
      historyRepoInstance.bulkUpsert.mockResolvedValue([{ ...mockHistory[0], _snapshotId: 1 }] as any);

      const auditRepoInstance = vi.mocked(AuditRepository).prototype;

      const result = await service.syncRuleHistory(30, 'act_123');

      expect(metaClientInstance.listRuleHistory).toHaveBeenCalledWith(30, 'act_123');
      expect(historyRepoInstance.bulkUpsert).toHaveBeenCalledWith('act_123', mockHistory);
      expect(auditRepoInstance.create).toHaveBeenCalledWith(expect.objectContaining({
        targetType: 'rule-history-list',
        status: 'success',
      }));

      expect(result.history).toHaveLength(1);
    });
  });
});
