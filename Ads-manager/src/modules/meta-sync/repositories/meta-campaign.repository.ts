import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../foundation/db/client.js';
import { metaCampaignSnapshots } from '../../foundation/db/schema.js';
import type { MetaCampaignSummary } from '../../providers/meta/meta.types.js';

function toDate(value?: string) {
  return value ? new Date(value) : null;
}

export class MetaCampaignSnapshotRepository {
  private readonly db = getDb();

  async upsert(accountId: string, payload: MetaCampaignSummary) {
    const [result] = await this.bulkUpsert(accountId, [payload]);
    return result;
  }

  async bulkUpsert(accountId: string, payloads: MetaCampaignSummary[]) {
    if (payloads.length === 0) return [];

    const values = payloads.map((payload) => ({
      campaignId: payload.id,
      accountId,
      name: payload.name ?? null,
      objective: payload.objective ?? null,
      status: payload.status ?? null,
      effectiveStatus: payload.effective_status ?? null,
      buyingType: payload.buying_type ?? null,
      dailyBudget: payload.daily_budget ?? null,
      lifetimeBudget: payload.lifetime_budget ?? null,
      startTime: toDate(payload.start_time),
      stopTime: toDate(payload.stop_time),
      providerUpdatedTime: toDate(payload.updated_time),
      rawPayload: payload,
      syncedAt: new Date(),
      updatedAt: new Date()
    }));

    return this.db.insert(metaCampaignSnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: metaCampaignSnapshots.campaignId,
        set: {
          accountId: sql`EXCLUDED.account_id`,
          name: sql`EXCLUDED.name`,
          objective: sql`EXCLUDED.objective`,
          status: sql`EXCLUDED.status`,
          effectiveStatus: sql`EXCLUDED.effective_status`,
          buyingType: sql`EXCLUDED.buying_type`,
          dailyBudget: sql`EXCLUDED.daily_budget`,
          lifetimeBudget: sql`EXCLUDED.lifetime_budget`,
          startTime: sql`EXCLUDED.start_time`,
          stopTime: sql`EXCLUDED.stop_time`,
          providerUpdatedTime: sql`EXCLUDED.provider_updated_time`,
          rawPayload: sql`EXCLUDED.raw_payload`,
          syncedAt: sql`EXCLUDED.synced_at`,
          updatedAt: sql`EXCLUDED.updated_at`
        }
      })
      .returning();
  }

  async getLatestByCampaignId(campaignId: string) {
    return this.db.query.metaCampaignSnapshots.findFirst({
      where: eq(metaCampaignSnapshots.campaignId, campaignId),
      orderBy: [desc(metaCampaignSnapshots.updatedAt)]
    });
  }

  async listByAccount(accountId: string, limit = 50) {
    return this.db.query.metaCampaignSnapshots.findMany({
      where: eq(metaCampaignSnapshots.accountId, accountId),
      orderBy: [desc(metaCampaignSnapshots.updatedAt)],
      limit
    });
  }

  async deleteByCampaignId(campaignId: string) {
    return this.db.delete(metaCampaignSnapshots)
      .where(eq(metaCampaignSnapshots.campaignId, campaignId))
      .returning();
  }
}
