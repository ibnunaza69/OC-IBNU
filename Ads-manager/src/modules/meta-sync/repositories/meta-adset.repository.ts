import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../foundation/db/client.js';
import { metaAdSetSnapshots } from '../../foundation/db/schema.js';
import type { MetaAdSetSummary } from '../../providers/meta/meta.types.js';

function toDate(value?: string) {
  return value ? new Date(value) : null;
}

export class MetaAdSetSnapshotRepository {
  private readonly db = getDb();

  async upsert(accountId: string, payload: MetaAdSetSummary) {
    const [result] = await this.bulkUpsert(accountId, [payload]);
    return result;
  }

  async bulkUpsert(accountId: string, payloads: MetaAdSetSummary[]) {
    if (payloads.length === 0) return [];

    const values = payloads.map((payload) => ({
      adSetId: payload.id,
      accountId,
      campaignId: payload.campaign_id ?? null,
      name: payload.name ?? null,
      status: payload.status ?? null,
      effectiveStatus: payload.effective_status ?? null,
      dailyBudget: payload.daily_budget ?? null,
      lifetimeBudget: payload.lifetime_budget ?? null,
      billingEvent: payload.billing_event ?? null,
      optimizationGoal: payload.optimization_goal ?? null,
      bidStrategy: payload.bid_strategy ?? null,
      startTime: toDate(payload.start_time),
      endTime: toDate(payload.end_time),
      providerUpdatedTime: toDate(payload.updated_time),
      rawPayload: payload,
      syncedAt: new Date(),
      updatedAt: new Date()
    }));

    return this.db.insert(metaAdSetSnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: metaAdSetSnapshots.adSetId,
        set: {
          accountId: sql`EXCLUDED.account_id`,
          campaignId: sql`EXCLUDED.campaign_id`,
          name: sql`EXCLUDED.name`,
          status: sql`EXCLUDED.status`,
          effectiveStatus: sql`EXCLUDED.effective_status`,
          dailyBudget: sql`EXCLUDED.daily_budget`,
          lifetimeBudget: sql`EXCLUDED.lifetime_budget`,
          billingEvent: sql`EXCLUDED.billing_event`,
          optimizationGoal: sql`EXCLUDED.optimization_goal`,
          bidStrategy: sql`EXCLUDED.bid_strategy`,
          startTime: sql`EXCLUDED.start_time`,
          endTime: sql`EXCLUDED.end_time`,
          providerUpdatedTime: sql`EXCLUDED.provider_updated_time`,
          rawPayload: sql`EXCLUDED.raw_payload`,
          syncedAt: sql`EXCLUDED.synced_at`,
          updatedAt: sql`EXCLUDED.updated_at`
        }
      })
      .returning();
  }

  async listByAccount(accountId: string, limit = 50) {
    return this.db.query.metaAdSetSnapshots.findMany({
      where: eq(metaAdSetSnapshots.accountId, accountId),
      orderBy: [desc(metaAdSetSnapshots.updatedAt)],
      limit
    });
  }

  async getLatestByAdSetId(adSetId: string) {
    return this.db.query.metaAdSetSnapshots.findFirst({
      where: eq(metaAdSetSnapshots.adSetId, adSetId),
      orderBy: [desc(metaAdSetSnapshots.updatedAt)]
    });
  }

  async listByCampaignId(campaignId: string, accountId?: string) {
    return this.db.query.metaAdSetSnapshots.findMany({
      where: accountId
        ? and(eq(metaAdSetSnapshots.campaignId, campaignId), eq(metaAdSetSnapshots.accountId, accountId))
        : eq(metaAdSetSnapshots.campaignId, campaignId),
      orderBy: [desc(metaAdSetSnapshots.updatedAt)]
    });
  }

  async deleteByAdSetId(adSetId: string) {
    return this.db.delete(metaAdSetSnapshots)
      .where(eq(metaAdSetSnapshots.adSetId, adSetId))
      .returning();
  }

  async deleteByCampaignId(campaignId: string) {
    return this.db.delete(metaAdSetSnapshots)
      .where(eq(metaAdSetSnapshots.campaignId, campaignId))
      .returning();
  }
}
