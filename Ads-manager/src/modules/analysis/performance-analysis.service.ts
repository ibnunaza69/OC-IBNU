import { desc, eq } from 'drizzle-orm';
import { configService } from '../../config/settings.js';
import { getDb } from '../foundation/db/client.js';
import {
  metaAdAccountSnapshots,
  metaAdSetSnapshots,
  metaAdSnapshots,
  metaCampaignSnapshots
} from '../foundation/db/schema.js';
import { MetaClient } from '../providers/meta/meta.client.js';
import { buildPerformanceMetrics, type PerformanceMetrics } from './analysis.service.js';

export type PerformerLevel = 'campaign' | 'adset' | 'ad';
export type PerformerMetric = 'spend' | 'impressions' | 'reach' | 'clicks' | 'ctr' | 'cpc' | 'resultCount' | 'costPerResult';
export type PerformerDirection = 'top' | 'bottom';

export interface PerformerRow {
  level: PerformerLevel;
  objectId: string;
  name: string | null;
  campaignId: string | null;
  adSetId: string | null;
  effectiveStatus: string | null;
  metrics: PerformanceMetrics;
}

export interface ComparePeriodsRequest {
  objectId: string;
  windowA: { datePreset: string } | { since: string; until: string };
  windowB: { datePreset: string } | { since: string; until: string };
  currency?: string | null | undefined;
}

function metricValue(metrics: PerformanceMetrics, metric: PerformerMetric) {
  const value = metrics[metric];
  return typeof value === 'number' ? value : null;
}

function compareRows(a: PerformerRow, b: PerformerRow, metric: PerformerMetric, direction: PerformerDirection) {
  const av = metricValue(a.metrics, metric);
  const bv = metricValue(b.metrics, metric);

  const bothLower = metric === 'cpc' || metric === 'costPerResult';
  const wantAscending = direction === 'top' ? bothLower : !bothLower;

  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;

  return wantAscending ? av - bv : bv - av;
}

function diff(a: number | null, b: number | null) {
  if (a === null || b === null) {
    return { absolute: null, percent: null };
  }

  const absolute = Number((a - b).toFixed(6));
  const percent = b === 0 ? null : Number((((a - b) / b) * 100).toFixed(2));
  return { absolute, percent };
}

export class PerformanceAnalysisService {
  private readonly db = getDb();
  private readonly metaClient = new MetaClient();

  async getPerformers(options: {
    level: PerformerLevel;
    metric: PerformerMetric;
    direction: PerformerDirection;
    limit?: number;
    accountId?: string | null;
  }) {
    const resolvedAccount = options.accountId ?? await configService.getMetaAccountId();
    if (!resolvedAccount) {
      return { ok: false as const, reason: 'META_AD_ACCOUNT_ID is not configured' };
    }

    const limit = Math.min(Math.max(options.limit ?? 5, 1), 50);

    const account = await this.db.query.metaAdAccountSnapshots.findFirst({
      where: eq(metaAdAccountSnapshots.accountId, resolvedAccount),
      orderBy: [desc(metaAdAccountSnapshots.updatedAt)]
    });

    const currency = account?.currency ?? null;
    const rows = await this.collectRows(resolvedAccount, options.level, currency);
    const sorted = rows.sort((a, b) => compareRows(a, b, options.metric, options.direction)).slice(0, limit);

    return {
      ok: true as const,
      accountId: resolvedAccount,
      level: options.level,
      metric: options.metric,
      direction: options.direction,
      currency,
      performanceWindow: 'last_30d',
      count: sorted.length,
      items: sorted
    };
  }

  private async collectRows(accountId: string, level: PerformerLevel, currency: string | null): Promise<PerformerRow[]> {
    if (level === 'campaign') {
      const campaigns = await this.db.query.metaCampaignSnapshots.findMany({
        where: eq(metaCampaignSnapshots.accountId, accountId),
        orderBy: [desc(metaCampaignSnapshots.updatedAt)],
        limit: 500
      });

      return campaigns.map((c) => ({
        level: 'campaign' as const,
        objectId: c.campaignId,
        name: c.name ?? null,
        campaignId: c.campaignId,
        adSetId: null,
        effectiveStatus: c.effectiveStatus ?? null,
        metrics: buildPerformanceMetrics(c.rawPayload, {
          dailyBudget: c.dailyBudget,
          lifetimeBudget: c.lifetimeBudget,
          currency
        })
      }));
    }

    if (level === 'adset') {
      const adSets = await this.db.query.metaAdSetSnapshots.findMany({
        where: eq(metaAdSetSnapshots.accountId, accountId),
        orderBy: [desc(metaAdSetSnapshots.updatedAt)],
        limit: 2000
      });

      return adSets.map((a) => ({
        level: 'adset' as const,
        objectId: a.adSetId,
        name: a.name ?? null,
        campaignId: a.campaignId ?? null,
        adSetId: a.adSetId,
        effectiveStatus: a.effectiveStatus ?? null,
        metrics: buildPerformanceMetrics(a.rawPayload, {
          dailyBudget: a.dailyBudget,
          lifetimeBudget: a.lifetimeBudget,
          currency
        })
      }));
    }

    const ads = await this.db.query.metaAdSnapshots.findMany({
      where: eq(metaAdSnapshots.accountId, accountId),
      orderBy: [desc(metaAdSnapshots.updatedAt)],
      limit: 5000
    });

    return ads.map((ad) => ({
      level: 'ad' as const,
      objectId: ad.adId,
      name: ad.name ?? null,
      campaignId: ad.campaignId ?? null,
      adSetId: ad.adSetId ?? null,
      effectiveStatus: ad.effectiveStatus ?? null,
      metrics: buildPerformanceMetrics(ad.rawPayload, { currency })
    }));
  }

  async comparePeriods(request: ComparePeriodsRequest) {
    const [responseA, responseB] = await Promise.all([
      this.metaClient.fetchObjectInsights(request.objectId, request.windowA),
      this.metaClient.fetchObjectInsights(request.objectId, request.windowB)
    ]);

    const metricsA = buildPerformanceMetrics(
      { insights: { data: responseA.data.data ?? [] } },
      { currency: request.currency ?? null }
    );
    const metricsB = buildPerformanceMetrics(
      { insights: { data: responseB.data.data ?? [] } },
      { currency: request.currency ?? null }
    );

    return {
      ok: true as const,
      objectId: request.objectId,
      windowA: request.windowA,
      windowB: request.windowB,
      metricsA,
      metricsB,
      diff: {
        spend: diff(metricsA.spend, metricsB.spend),
        impressions: diff(metricsA.impressions, metricsB.impressions),
        reach: diff(metricsA.reach, metricsB.reach),
        clicks: diff(metricsA.clicks, metricsB.clicks),
        ctr: diff(metricsA.ctr, metricsB.ctr),
        cpc: diff(metricsA.cpc, metricsB.cpc),
        resultCount: diff(metricsA.resultCount, metricsB.resultCount),
        costPerResult: diff(metricsA.costPerResult, metricsB.costPerResult)
      }
    };
  }
}
