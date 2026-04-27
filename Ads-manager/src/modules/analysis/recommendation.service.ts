import { desc, eq } from 'drizzle-orm';
import { configService } from '../../config/settings.js';
import { getDb } from '../foundation/db/client.js';
import {
  metaAdAccountSnapshots,
  metaAdSetSnapshots,
  metaAdSnapshots,
  metaCampaignSnapshots
} from '../foundation/db/schema.js';
import { buildPerformanceMetrics, type PerformanceMetrics } from './analysis.service.js';
import type { PerformerLevel } from './performance-analysis.service.js';

export type RecommendationAction = 'hold' | 'pause' | 'inspect' | 'scale';

export interface RecommendationItem {
  level: PerformerLevel;
  objectId: string;
  name: string | null;
  campaignId: string | null;
  adSetId: string | null;
  effectiveStatus: string | null;
  action: RecommendationAction;
  reasons: string[];
  metrics: PerformanceMetrics;
}

const DEFAULT_THRESHOLDS = {
  minImpressionsForSignal: 1000,
  pauseSpendNoResult: 50,
  lowCtrPercent: 0.5,
  strongCtrPercent: 2,
  scaleCostRatioToMedian: 0.75
};

function median(values: number[]): number | null {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    const left = sorted[middle - 1] ?? 0;
    const right = sorted[middle] ?? 0;
    return (left + right) / 2;
  }

  return sorted[middle] ?? null;
}

function decide(
  metrics: PerformanceMetrics,
  context: { costPerResultMedian: number | null }
): { action: RecommendationAction; reasons: string[] } {
  const reasons: string[] = [];
  const impressions = metrics.impressions ?? 0;
  const spend = metrics.spend ?? 0;
  const ctr = metrics.ctr ?? 0;
  const resultCount = metrics.resultCount ?? 0;
  const costPerResult = metrics.costPerResult ?? null;

  if (
    impressions >= DEFAULT_THRESHOLDS.minImpressionsForSignal &&
    spend >= DEFAULT_THRESHOLDS.pauseSpendNoResult &&
    resultCount === 0
  ) {
    reasons.push(`Spent ${spend} with 0 results over ${impressions} impressions`);
    return { action: 'pause', reasons };
  }

  if (
    impressions >= DEFAULT_THRESHOLDS.minImpressionsForSignal &&
    ctr > 0 &&
    ctr < DEFAULT_THRESHOLDS.lowCtrPercent
  ) {
    reasons.push(`CTR ${ctr}% is below ${DEFAULT_THRESHOLDS.lowCtrPercent}% threshold at ${impressions} impressions`);
    return { action: 'inspect', reasons };
  }

  if (
    resultCount > 0 &&
    ctr >= DEFAULT_THRESHOLDS.strongCtrPercent &&
    costPerResult !== null &&
    context.costPerResultMedian !== null &&
    context.costPerResultMedian > 0 &&
    costPerResult <= context.costPerResultMedian * DEFAULT_THRESHOLDS.scaleCostRatioToMedian
  ) {
    reasons.push(
      `CTR ${ctr}% with ${resultCount} results and cost/result ${costPerResult} under ${Math.round(DEFAULT_THRESHOLDS.scaleCostRatioToMedian * 100)}% of median ${context.costPerResultMedian}`
    );
    return { action: 'scale', reasons };
  }

  if (impressions < DEFAULT_THRESHOLDS.minImpressionsForSignal) {
    reasons.push(`Only ${impressions} impressions — not enough signal to act`);
  } else {
    reasons.push('Metrics within nominal range — keep monitoring');
  }

  return { action: 'hold', reasons };
}

export class RecommendationService {
  private readonly db = getDb();

  async getRecommendations(options: { level: PerformerLevel; accountId?: string | null }) {
    const resolvedAccount = options.accountId ?? await configService.getMetaAccountId();
    if (!resolvedAccount) {
      return { ok: false as const, reason: 'META_AD_ACCOUNT_ID is not configured' };
    }

    const account = await this.db.query.metaAdAccountSnapshots.findFirst({
      where: eq(metaAdAccountSnapshots.accountId, resolvedAccount),
      orderBy: [desc(metaAdAccountSnapshots.updatedAt)]
    });

    const currency = account?.currency ?? null;
    const rows = await this.collectRows(resolvedAccount, options.level, currency);
    const costs = rows
      .map((row) => row.metrics.costPerResult)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const costPerResultMedian = median(costs);

    const items: RecommendationItem[] = rows.map((row) => {
      const { action, reasons } = decide(row.metrics, { costPerResultMedian });
      return {
        level: row.level,
        objectId: row.objectId,
        name: row.name,
        campaignId: row.campaignId,
        adSetId: row.adSetId,
        effectiveStatus: row.effectiveStatus,
        action,
        reasons,
        metrics: row.metrics
      };
    });

    const breakdown: Record<RecommendationAction, number> = { hold: 0, pause: 0, inspect: 0, scale: 0 };
    for (const item of items) {
      breakdown[item.action] += 1;
    }

    return {
      ok: true as const,
      accountId: resolvedAccount,
      level: options.level,
      currency,
      performanceWindow: 'last_30d',
      thresholds: DEFAULT_THRESHOLDS,
      breakdown,
      count: items.length,
      items
    };
  }

  private async collectRows(
    accountId: string,
    level: PerformerLevel,
    currency: string | null
  ) {
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
}
