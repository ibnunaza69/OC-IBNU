import { desc, eq, max } from 'drizzle-orm';
import { configService } from '../../config/settings.js';
import { getDb } from '../foundation/db/client.js';
import {
  metaAdAccountSnapshots,
  metaAdSetSnapshots,
  metaAdSnapshots,
  metaCampaignSnapshots
} from '../foundation/db/schema.js';

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'IDR', 'ISK', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'
]);

const PRIMARY_RESULT_ACTION_TYPES = [
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_web_purchase',
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
  'omni_lead',
  'messaging_conversation_started_7d',
  'landing_page_view',
  'link_click',
  'post_engagement'
];

function toNumber(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function incrementCounter(counter: Record<string, number>, key: string | null | undefined) {
  const normalized = key ?? 'UNKNOWN';
  counter[normalized] = (counter[normalized] ?? 0) + 1;
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeBudget(value: string | null | undefined, currency?: string | null) {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    return null;
  }

  return ZERO_DECIMAL_CURRENCIES.has((currency ?? '').toUpperCase())
    ? parsed
    : parsed / 100;
}

function extractInsight(rawPayload: unknown) {
  const payload = asRecord(rawPayload);
  const insights = asRecord(payload?.insights);
  const data = Array.isArray(insights?.data) ? insights.data : [];
  const first = data[0];
  return asRecord(first);
}

function extractActionValueMap(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  const metrics = new Map<string, number>();

  for (const item of items) {
    const record = asRecord(item);
    const actionType = typeof record?.action_type === 'string' ? record.action_type : null;
    const metricValue = toNullableNumber(record?.value);

    if (!actionType || metricValue === null) {
      continue;
    }

    metrics.set(actionType, metricValue);
  }

  return metrics;
}

function formatActionLabel(actionType?: string | null) {
  if (!actionType) {
    return null;
  }

  const normalized = actionType
    .replace(/^offsite_conversion\.fb_pixel_/i, '')
    .replace(/^onsite_conversion\./i, '')
    .replace(/^onsite_web_/i, '')
    .replace(/^omni_/i, '')
    .replace(/^onsite_/i, '')
    .replace(/_grouped$/i, '')
    .replace(/_/g, ' ')
    .replace(/\./g, ' ')
    .trim();

  return normalized
    ? normalized.replace(/\b\w/g, (char) => char.toUpperCase())
    : actionType;
}

function pickPrimaryResultMetric(actions: Map<string, number>, costs: Map<string, number>) {
  const candidateTypes = Array.from(new Set([
    ...PRIMARY_RESULT_ACTION_TYPES,
    ...actions.keys(),
    ...costs.keys()
  ]));

  for (const actionType of candidateTypes) {
    const count = actions.get(actionType) ?? null;
    const cost = costs.get(actionType) ?? null;

    if (count === null && cost === null) {
      continue;
    }

    return {
      resultActionType: actionType,
      resultLabel: formatActionLabel(actionType),
      resultCount: count,
      costPerResult: cost
    };
  }

  return {
    resultActionType: null,
    resultLabel: null,
    resultCount: null,
    costPerResult: null
  };
}

export type PerformanceMetrics = {
  source: 'meta-insights-last-30d' | 'snapshot-only';
  budgetAmount: number | null;
  budgetType: 'daily' | 'lifetime' | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  resultCount: number | null;
  costPerResult: number | null;
  resultLabel: string | null;
  resultActionType: string | null;
};

export function buildPerformanceMetrics(
  rawPayload: unknown,
  options: { dailyBudget?: string | null; lifetimeBudget?: string | null; currency?: string | null } = {}
): PerformanceMetrics {
  const insight = extractInsight(rawPayload);
  const actions = extractActionValueMap(insight?.actions);
  const costs = extractActionValueMap(insight?.cost_per_action_type);
  const primaryResult = pickPrimaryResultMetric(actions, costs);
  const budgetAmount = normalizeBudget(options.dailyBudget ?? options.lifetimeBudget ?? null, options.currency);

  return {
    source: insight ? 'meta-insights-last-30d' as const : 'snapshot-only' as const,
    budgetAmount,
    budgetType: options.dailyBudget ? 'daily' as const : options.lifetimeBudget ? 'lifetime' as const : null,
    spend: toNullableNumber(insight?.spend),
    impressions: toNullableNumber(insight?.impressions),
    reach: toNullableNumber(insight?.reach),
    clicks: toNullableNumber(insight?.clicks),
    ctr: toNullableNumber(insight?.ctr),
    cpc: toNullableNumber(insight?.cpc),
    resultCount: primaryResult.resultCount,
    costPerResult: primaryResult.costPerResult ?? (
      primaryResult.resultCount && toNullableNumber(insight?.spend) !== null
        ? Number((Number(insight?.spend) / primaryResult.resultCount).toFixed(2))
        : null
    ),
    resultLabel: primaryResult.resultLabel,
    resultActionType: primaryResult.resultActionType
  };
}

export class AnalysisService {
  private readonly db = getDb();

  async getOverview(accountId?: string | null) {
    accountId = accountId ?? await configService.getMetaAccountId();
    if (!accountId) {
      return {
        ok: false,
        reason: 'META_AD_ACCOUNT_ID is not configured'
      };
    }

    const account = await this.db.query.metaAdAccountSnapshots.findFirst({
      where: eq(metaAdAccountSnapshots.accountId, accountId),
      orderBy: [desc(metaAdAccountSnapshots.updatedAt)]
    });

    const campaigns = await this.db.query.metaCampaignSnapshots.findMany({
      where: eq(metaCampaignSnapshots.accountId, accountId),
      orderBy: [desc(metaCampaignSnapshots.updatedAt)],
      limit: 500
    });

    const adSets = await this.db.query.metaAdSetSnapshots.findMany({
      where: eq(metaAdSetSnapshots.accountId, accountId),
      orderBy: [desc(metaAdSetSnapshots.updatedAt)],
      limit: 2000
    });

    const ads = await this.db.query.metaAdSnapshots.findMany({
      where: eq(metaAdSnapshots.accountId, accountId),
      orderBy: [desc(metaAdSnapshots.updatedAt)],
      limit: 5000
    });

    const campaignStatusBreakdown: Record<string, number> = {};
    const campaignObjectiveBreakdown: Record<string, number> = {};
    const adSetStatusBreakdown: Record<string, number> = {};
    const adStatusBreakdown: Record<string, number> = {};

    let campaignDailyBudgetTotal = 0;
    let adSetDailyBudgetTotal = 0;
    let adsWithoutCreative = 0;

    for (const campaign of campaigns) {
      incrementCounter(campaignStatusBreakdown, campaign.effectiveStatus ?? campaign.status);
      incrementCounter(campaignObjectiveBreakdown, campaign.objective);
      campaignDailyBudgetTotal += toNumber(campaign.dailyBudget);
    }

    for (const adSet of adSets) {
      incrementCounter(adSetStatusBreakdown, adSet.effectiveStatus ?? adSet.status);
      adSetDailyBudgetTotal += toNumber(adSet.dailyBudget);
    }

    for (const ad of ads) {
      incrementCounter(adStatusBreakdown, ad.effectiveStatus ?? ad.status);
      if (!ad.creativeId) {
        adsWithoutCreative += 1;
      }
    }

    const adSetIds = new Set(adSets.map((item) => item.adSetId));
    const campaignIds = new Set(campaigns.map((item) => item.campaignId));

    const campaignsWithoutAdSets = campaigns.filter((campaign) =>
      !adSets.some((adSet) => adSet.campaignId === campaign.campaignId)
    ).length;

    const adSetsWithoutAds = adSets.filter((adSet) =>
      !ads.some((ad) => ad.adSetId === adSet.adSetId)
    ).length;

    const adsWithMissingAdSet = ads.filter((ad) => ad.adSetId && !adSetIds.has(ad.adSetId)).length;
    const adSetsWithMissingCampaign = adSets.filter((adSet) => adSet.campaignId && !campaignIds.has(adSet.campaignId)).length;

    const latestCampaignSyncRow = (await this.db
      .select({ latestCampaignSyncAt: max(metaCampaignSnapshots.syncedAt) })
      .from(metaCampaignSnapshots)
      .where(eq(metaCampaignSnapshots.accountId, accountId)))[0];

    const latestAdSetSyncRow = (await this.db
      .select({ latestAdSetSyncAt: max(metaAdSetSnapshots.syncedAt) })
      .from(metaAdSetSnapshots)
      .where(eq(metaAdSetSnapshots.accountId, accountId)))[0];

    const latestAdSyncRow = (await this.db
      .select({ latestAdSyncAt: max(metaAdSnapshots.syncedAt) })
      .from(metaAdSnapshots)
      .where(eq(metaAdSnapshots.accountId, accountId)))[0];

    return {
      ok: true,
      account: account
        ? {
            accountId: account.accountId,
            name: account.name,
            currency: account.currency,
            accountStatus: account.accountStatus,
            syncedAt: account.syncedAt,
            updatedAt: account.updatedAt
          }
        : null,
      totals: {
        campaigns: campaigns.length,
        adSets: adSets.length,
        ads: ads.length,
        activeCampaigns: campaignStatusBreakdown.ACTIVE ?? 0,
        activeAdSets: adSetStatusBreakdown.ACTIVE ?? 0,
        activeAds: adStatusBreakdown.ACTIVE ?? 0,
        pausedCampaigns: campaignStatusBreakdown.PAUSED ?? 0,
        pausedAdSets: adSetStatusBreakdown.PAUSED ?? 0,
        pausedAds: adStatusBreakdown.PAUSED ?? 0
      },
      breakdowns: {
        campaignStatus: campaignStatusBreakdown,
        campaignObjective: campaignObjectiveBreakdown,
        adSetStatus: adSetStatusBreakdown,
        adStatus: adStatusBreakdown
      },
      budgets: {
        campaignDailyBudgetTotal,
        adSetDailyBudgetTotal,
        currency: account?.currency ?? null
      },
      integrity: {
        campaignsWithoutAdSets,
        adSetsWithoutAds,
        adsWithoutCreative,
        adsWithMissingAdSet,
        adSetsWithMissingCampaign
      },
      freshness: {
        accountSyncedAt: account?.syncedAt ?? null,
        campaignsSyncedAt: latestCampaignSyncRow?.latestCampaignSyncAt ?? null,
        adSetsSyncedAt: latestAdSetSyncRow?.latestAdSetSyncAt ?? null,
        adsSyncedAt: latestAdSyncRow?.latestAdSyncAt ?? null
      },
      samples: {
        recentCampaigns: campaigns.slice(0, 5).map((item) => ({
          campaignId: item.campaignId,
          name: item.name,
          effectiveStatus: item.effectiveStatus,
          objective: item.objective,
          dailyBudget: item.dailyBudget,
          providerUpdatedTime: item.providerUpdatedTime
        })),
        recentAdSets: adSets.slice(0, 5).map((item) => ({
          adSetId: item.adSetId,
          campaignId: item.campaignId,
          name: item.name,
          effectiveStatus: item.effectiveStatus,
          providerUpdatedTime: item.providerUpdatedTime
        })),
        recentAds: ads.slice(0, 5).map((item) => ({
          adId: item.adId,
          campaignId: item.campaignId,
          adSetId: item.adSetId,
          name: item.name,
          effectiveStatus: item.effectiveStatus,
          creativeId: item.creativeId,
          creativeName: item.creativeName,
          providerUpdatedTime: item.providerUpdatedTime
        }))
      }
    };
  }

  async getCampaignInsights(campaignId: string) {
    const campaign = await this.db.query.metaCampaignSnapshots.findFirst({
      where: eq(metaCampaignSnapshots.campaignId, campaignId),
      orderBy: [desc(metaCampaignSnapshots.updatedAt)]
    });

    if (!campaign || !campaign.accountId) {
      return { ok: false, reason: 'Campaign not found or missing account ID' };
    }

    const account = await this.db.query.metaAdAccountSnapshots.findFirst({
      where: eq(metaAdAccountSnapshots.accountId, campaign.accountId),
      orderBy: [desc(metaAdAccountSnapshots.updatedAt)]
    });

    const currency = account?.currency ?? null;

    return {
      ok: true,
      campaignId: campaign.campaignId,
      name: campaign.name,
      objective: campaign.objective,
      effectiveStatus: campaign.effectiveStatus,
      metrics: buildPerformanceMetrics(campaign.rawPayload, {
        dailyBudget: campaign.dailyBudget,
        lifetimeBudget: campaign.lifetimeBudget,
        currency
      }),
      syncedAt: campaign.syncedAt
    };
  }

  async getCampaignHierarchy(accountId?: string | null, limit = 25) {
    accountId = accountId ?? await configService.getMetaAccountId();
    if (!accountId) {
      return {
        ok: false,
        reason: 'META_AD_ACCOUNT_ID is not configured'
      };
    }

    const [
      account,
      campaigns,
      adSets,
      ads,
      latestCampaignSyncRow,
      latestAdSetSyncRow,
      latestAdSyncRow
    ] = await Promise.all([
      this.db.query.metaAdAccountSnapshots.findFirst({
        where: eq(metaAdAccountSnapshots.accountId, accountId),
        orderBy: [desc(metaAdAccountSnapshots.updatedAt)]
      }),
      this.db.query.metaCampaignSnapshots.findMany({
        where: eq(metaCampaignSnapshots.accountId, accountId),
        orderBy: [desc(metaCampaignSnapshots.updatedAt)],
        limit
      }),
      this.db.query.metaAdSetSnapshots.findMany({
        where: eq(metaAdSetSnapshots.accountId, accountId),
        orderBy: [desc(metaAdSetSnapshots.updatedAt)],
        limit: Math.max(limit * 10, 50)
      }),
      this.db.query.metaAdSnapshots.findMany({
        where: eq(metaAdSnapshots.accountId, accountId),
        orderBy: [desc(metaAdSnapshots.updatedAt)],
        limit: Math.max(limit * 25, 100)
      }),
      this.db
        .select({ latestCampaignSyncAt: max(metaCampaignSnapshots.syncedAt) })
        .from(metaCampaignSnapshots)
        .where(eq(metaCampaignSnapshots.accountId, accountId))
        .then((rows) => rows[0]),
      this.db
        .select({ latestAdSetSyncAt: max(metaAdSetSnapshots.syncedAt) })
        .from(metaAdSetSnapshots)
        .where(eq(metaAdSetSnapshots.accountId, accountId))
        .then((rows) => rows[0]),
      this.db
        .select({ latestAdSyncAt: max(metaAdSnapshots.syncedAt) })
        .from(metaAdSnapshots)
        .where(eq(metaAdSnapshots.accountId, accountId))
        .then((rows) => rows[0])
    ]);

    const campaignIds = new Set(campaigns.map((item) => item.campaignId));
    const filteredAdSets = adSets.filter((item) => item.campaignId && campaignIds.has(item.campaignId));
    const adSetIds = new Set(filteredAdSets.map((item) => item.adSetId));
    const filteredAds = ads.filter((item) => item.adSetId && adSetIds.has(item.adSetId));
    const currency = account?.currency ?? null;

    const adCountByCampaign = new Map<string, number>();
    const adSetCountByCampaign = new Map<string, number>();

    for (const adSet of filteredAdSets) {
      if (!adSet.campaignId) {
        continue;
      }

      adSetCountByCampaign.set(adSet.campaignId, (adSetCountByCampaign.get(adSet.campaignId) ?? 0) + 1);
    }

    for (const ad of filteredAds) {
      if (!ad.campaignId) {
        continue;
      }

      adCountByCampaign.set(ad.campaignId, (adCountByCampaign.get(ad.campaignId) ?? 0) + 1);
    }

    return {
      ok: true,
      accountId,
      currency,
      performanceWindow: 'last_30d',
      freshness: {
        accountSyncedAt: account?.syncedAt ?? null,
        campaignsSyncedAt: latestCampaignSyncRow?.latestCampaignSyncAt ?? null,
        adSetsSyncedAt: latestAdSetSyncRow?.latestAdSetSyncAt ?? null,
        adsSyncedAt: latestAdSyncRow?.latestAdSyncAt ?? null
      },
      count: campaigns.length,
      items: campaigns.map((campaign) => {
        const campaignAdSets = filteredAdSets.filter((item) => item.campaignId === campaign.campaignId);

        return {
          campaignId: campaign.campaignId,
          name: campaign.name,
          objective: campaign.objective,
          effectiveStatus: campaign.effectiveStatus,
          dailyBudget: campaign.dailyBudget,
          syncedAt: campaign.syncedAt,
          providerUpdatedTime: campaign.providerUpdatedTime,
          metrics: buildPerformanceMetrics(campaign.rawPayload, {
            dailyBudget: campaign.dailyBudget,
            lifetimeBudget: campaign.lifetimeBudget,
            currency
          }),
          adSetCount: adSetCountByCampaign.get(campaign.campaignId) ?? 0,
          adCount: adCountByCampaign.get(campaign.campaignId) ?? 0,
          adSets: campaignAdSets.map((adSet) => ({
            adSetId: adSet.adSetId,
            name: adSet.name,
            effectiveStatus: adSet.effectiveStatus,
            optimizationGoal: adSet.optimizationGoal,
            dailyBudget: adSet.dailyBudget,
            syncedAt: adSet.syncedAt,
            providerUpdatedTime: adSet.providerUpdatedTime,
            metrics: buildPerformanceMetrics(adSet.rawPayload, {
              dailyBudget: adSet.dailyBudget,
              lifetimeBudget: adSet.lifetimeBudget,
              currency
            }),
            ads: filteredAds
              .filter((ad) => ad.adSetId === adSet.adSetId)
              .map((ad) => ({
                adId: ad.adId,
                name: ad.name,
                effectiveStatus: ad.effectiveStatus,
                creativeId: ad.creativeId,
                creativeName: ad.creativeName,
                syncedAt: ad.syncedAt,
                providerUpdatedTime: ad.providerUpdatedTime,
                metrics: buildPerformanceMetrics(ad.rawPayload, {
                  currency
                })
              }))
          }))
        };
      })
    };
  }
}
