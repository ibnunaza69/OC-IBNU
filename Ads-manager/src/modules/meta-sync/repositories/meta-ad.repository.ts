import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../foundation/db/client.js';
import { metaAdSnapshots } from '../../foundation/db/schema.js';
import type { MetaAdSummary } from '../../providers/meta/meta.types.js';

function toDate(value?: string) {
  return value ? new Date(value) : null;
}

export class MetaAdSnapshotRepository {
  private readonly db = getDb();

  async upsert(accountId: string, payload: MetaAdSummary) {
    const [result] = await this.bulkUpsert(accountId, [payload]);
    return result;
  }

  async bulkUpsert(accountId: string, payloads: MetaAdSummary[]) {
    if (payloads.length === 0) return [];

    const values = payloads.map((payload) => ({
      adId: payload.id,
      accountId,
      campaignId: payload.campaign_id ?? null,
      adSetId: payload.adset_id ?? null,
      name: payload.name ?? null,
      status: payload.status ?? null,
      effectiveStatus: payload.effective_status ?? null,
      creativeId: payload.creative?.id ?? null,
      creativeName: payload.creative?.name ?? null,
      providerUpdatedTime: toDate(payload.updated_time),
      rawPayload: payload,
      syncedAt: new Date(),
      updatedAt: new Date()
    }));

    return this.db.insert(metaAdSnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: metaAdSnapshots.adId,
        set: {
          accountId: sql`EXCLUDED.account_id`,
          campaignId: sql`EXCLUDED.campaign_id`,
          adSetId: sql`EXCLUDED.adset_id`,
          name: sql`EXCLUDED.name`,
          status: sql`EXCLUDED.status`,
          effectiveStatus: sql`EXCLUDED.effective_status`,
          creativeId: sql`EXCLUDED.creative_id`,
          creativeName: sql`EXCLUDED.creative_name`,
          providerUpdatedTime: sql`EXCLUDED.provider_updated_time`,
          rawPayload: sql`EXCLUDED.raw_payload`,
          syncedAt: sql`EXCLUDED.synced_at`,
          updatedAt: sql`EXCLUDED.updated_at`
        }
      })
      .returning();
  }

  async getLatestByAdId(adId: string) {
    return this.db.query.metaAdSnapshots.findFirst({
      where: eq(metaAdSnapshots.adId, adId),
      orderBy: [desc(metaAdSnapshots.updatedAt)]
    });
  }

  async listByAccount(accountId: string, limit = 50) {
    return this.db.query.metaAdSnapshots.findMany({
      where: eq(metaAdSnapshots.accountId, accountId),
      orderBy: [desc(metaAdSnapshots.updatedAt)],
      limit
    });
  }

  async listByAdSetId(adSetId: string, accountId?: string) {
    return this.db.query.metaAdSnapshots.findMany({
      where: accountId
        ? and(eq(metaAdSnapshots.adSetId, adSetId), eq(metaAdSnapshots.accountId, accountId))
        : eq(metaAdSnapshots.adSetId, adSetId),
      orderBy: [desc(metaAdSnapshots.updatedAt)]
    });
  }

  async listByCampaignId(campaignId: string, accountId?: string) {
    return this.db.query.metaAdSnapshots.findMany({
      where: accountId
        ? and(eq(metaAdSnapshots.campaignId, campaignId), eq(metaAdSnapshots.accountId, accountId))
        : eq(metaAdSnapshots.campaignId, campaignId),
      orderBy: [desc(metaAdSnapshots.updatedAt)]
    });
  }

  async deleteByAdId(adId: string) {
    return this.db.delete(metaAdSnapshots)
      .where(eq(metaAdSnapshots.adId, adId))
      .returning();
  }

  async deleteByAdSetId(adSetId: string) {
    return this.db.delete(metaAdSnapshots)
      .where(eq(metaAdSnapshots.adSetId, adSetId))
      .returning();
  }

  async deleteByCampaignId(campaignId: string) {
    return this.db.delete(metaAdSnapshots)
      .where(eq(metaAdSnapshots.campaignId, campaignId))
      .returning();
  }
}
