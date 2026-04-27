import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { configService } from '../../config/settings.js';
import { MetaClient } from '../providers/meta/meta.client.js';
import { MetaAdAccountSnapshotRepository } from './repositories/meta-ad-account.repository.js';
import { MetaAdSetSnapshotRepository } from './repositories/meta-adset.repository.js';
import { MetaAdSnapshotRepository } from './repositories/meta-ad.repository.js';
import { MetaCampaignSnapshotRepository } from './repositories/meta-campaign.repository.js';
import { MetaRuleHistorySnapshotRepository } from './repositories/meta-rule-history.repository.js';
import { MetaRuleSnapshotRepository } from './repositories/meta-rule.repository.js';

export class MetaSyncService {
  private readonly metaClient = new MetaClient();
  private readonly adAccountRepository = new MetaAdAccountSnapshotRepository();
  private readonly campaignRepository = new MetaCampaignSnapshotRepository();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();
  private readonly adRepository = new MetaAdSnapshotRepository();
  private readonly ruleRepository = new MetaRuleSnapshotRepository();
  private readonly ruleHistoryRepository = new MetaRuleHistorySnapshotRepository();
  private readonly auditRepository = new AuditRepository();

  async syncAccountAndCampaigns(limit = 25, accountId?: string | null) {
    accountId = accountId ?? await configService.getMetaAccountId();
    if (!accountId) {
      throw new Error('META_AD_ACCOUNT_ID is not configured');
    }

    const accountResponse = await this.metaClient.getAdAccountBasic(accountId);
    const campaignsResponse = await this.metaClient.listCampaigns(limit, accountId);

    const accountSnapshot = await this.adAccountRepository.upsert(accountId, accountResponse.data);
    const campaignSnapshots = await this.campaignRepository.bulkUpsert(accountId, campaignsResponse.data);

    await this.auditRepository.create({
      operationType: 'meta.sync',
      actor: 'system',
      targetType: 'ad-account',
      targetId: accountId,
      status: 'success',
      metadata: {
        syncedAccountId: accountId,
        campaignCount: campaignSnapshots.length,
        limit
      }
    });

    return {
      account: accountSnapshot,
      campaigns: campaignSnapshots,
      paging: campaignsResponse.paging ?? null
    };
  }

  async syncAdSets(limit = 25, accountId?: string | null) {
    accountId = accountId ?? await configService.getMetaAccountId();
    if (!accountId) {
      throw new Error('META_AD_ACCOUNT_ID is not configured');
    }

    const adSetsResponse = await this.metaClient.listAdSets(limit, accountId);
    const adSetSnapshots = await this.adSetRepository.bulkUpsert(accountId, adSetsResponse.data);

    await this.auditRepository.create({
      operationType: 'meta.sync',
      actor: 'system',
      targetType: 'adset-list',
      targetId: accountId,
      status: 'success',
      metadata: {
        syncedAccountId: accountId,
        adSetCount: adSetSnapshots.length,
        limit
      }
    });

    return {
      adSets: adSetSnapshots,
      paging: adSetsResponse.paging ?? null
    };
  }

  async syncAds(limit = 25, accountId?: string | null) {
    accountId = accountId ?? await configService.getMetaAccountId();
    if (!accountId) {
      throw new Error('META_AD_ACCOUNT_ID is not configured');
    }

    const adsResponse = await this.metaClient.listAds(limit, accountId);
    const adSnapshots = await this.adRepository.bulkUpsert(accountId, adsResponse.data);

    await this.auditRepository.create({
      operationType: 'meta.sync',
      actor: 'system',
      targetType: 'ad-list',
      targetId: accountId,
      status: 'success',
      metadata: {
        syncedAccountId: accountId,
        adCount: adSnapshots.length,
        limit
      }
    });

    return {
      ads: adSnapshots,
      paging: adsResponse.paging ?? null
    };
  }

  async syncAccountHierarchy(limit = 25, accountId?: string | null) {
    accountId = accountId ?? await configService.getMetaAccountId();
    if (!accountId) {
      throw new Error('META_AD_ACCOUNT_ID is not configured');
    }

    const campaignLimit = limit;
    const adSetLimit = Math.max(limit * 10, 50);
    const adLimit = Math.max(limit * 25, 100);

    const accountResult = await this.syncAccountAndCampaigns(campaignLimit, accountId);
    const adSetResult = await this.syncAdSets(adSetLimit, accountId);
    const adResult = await this.syncAds(adLimit, accountId);

    return {
      ...accountResult,
      adSets: adSetResult.adSets,
      ads: adResult.ads,
      adSetPaging: adSetResult.paging,
      adPaging: adResult.paging,
      limits: {
        campaigns: campaignLimit,
        adSets: adSetLimit,
        ads: adLimit
      }
    };
  }

  async syncRules(limit = 25, accountId?: string | null) {
    accountId = accountId ?? await configService.getMetaAccountId();
    if (!accountId) {
      throw new Error('META_AD_ACCOUNT_ID is not configured');
    }

    const rulesResponse = await this.metaClient.listRules(limit, accountId);
    const ruleSnapshots = await this.ruleRepository.bulkUpsert(accountId, rulesResponse.data);

    await this.auditRepository.create({
      operationType: 'meta.rule.sync',
      actor: 'system',
      targetType: 'rule-list',
      targetId: accountId,
      status: 'success',
      metadata: {
        syncedAccountId: accountId,
        ruleCount: ruleSnapshots.length,
        limit
      }
    });

    return {
      rules: ruleSnapshots,
      paging: rulesResponse.paging ?? null
    };
  }

  async syncRuleHistory(limit = 25, accountId?: string | null) {
    accountId = accountId ?? await configService.getMetaAccountId();
    if (!accountId) {
      throw new Error('META_AD_ACCOUNT_ID is not configured');
    }

    const historyResponse = await this.metaClient.listRuleHistory(limit, accountId);
    const historySnapshots = await this.ruleHistoryRepository.bulkUpsert(accountId, historyResponse.data);

    await this.auditRepository.create({
      operationType: 'meta.rule-history.sync',
      actor: 'system',
      targetType: 'rule-history-list',
      targetId: accountId,
      status: 'success',
      metadata: {
        syncedAccountId: accountId,
        historyCount: historySnapshots.length,
        limit
      }
    });

    return {
      history: historySnapshots,
      paging: historyResponse.paging ?? null
    };
  }
}
