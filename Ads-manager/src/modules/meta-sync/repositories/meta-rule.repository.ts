import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../foundation/db/client.js';
import { metaRuleSnapshots } from '../../foundation/db/schema.js';
import type { MetaAdRuleSummary } from '../../providers/meta/meta.types.js';

function toDate(value?: string) {
  return value ? new Date(value) : null;
}

export class MetaRuleSnapshotRepository {
  private readonly db = getDb();

  async upsert(accountId: string, payload: MetaAdRuleSummary) {
    const [result] = await this.bulkUpsert(accountId, [payload]);
    return result;
  }

  async bulkUpsert(accountId: string, payloads: MetaAdRuleSummary[]) {
    if (payloads.length === 0) return [];

    const values = payloads.map((payload) => ({
      ruleId: payload.id,
      accountId,
      name: payload.name ?? null,
      status: payload.status ?? null,
      evaluationSpec: payload.evaluation_spec ?? null,
      executionSpec: payload.execution_spec ?? null,
      scheduleSpec: payload.schedule_spec ?? null,
      providerCreatedTime: toDate(payload.created_time),
      providerUpdatedTime: toDate(payload.updated_time),
      rawPayload: payload,
      syncedAt: new Date(),
      updatedAt: new Date()
    }));

    return this.db.insert(metaRuleSnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: metaRuleSnapshots.ruleId,
        set: {
          accountId: sql`EXCLUDED.account_id`,
          name: sql`EXCLUDED.name`,
          status: sql`EXCLUDED.status`,
          evaluationSpec: sql`EXCLUDED.evaluation_spec`,
          executionSpec: sql`EXCLUDED.execution_spec`,
          scheduleSpec: sql`EXCLUDED.schedule_spec`,
          providerCreatedTime: sql`EXCLUDED.provider_created_time`,
          providerUpdatedTime: sql`EXCLUDED.provider_updated_time`,
          rawPayload: sql`EXCLUDED.raw_payload`,
          syncedAt: sql`EXCLUDED.synced_at`,
          updatedAt: sql`EXCLUDED.updated_at`
        }
      })
      .returning();
  }

  async listByAccount(accountId: string, limit = 50) {
    return this.db.query.metaRuleSnapshots.findMany({
      where: eq(metaRuleSnapshots.accountId, accountId),
      orderBy: [desc(metaRuleSnapshots.updatedAt)],
      limit
    });
  }

  async getLatestByRuleId(ruleId: string) {
    return this.db.query.metaRuleSnapshots.findFirst({
      where: eq(metaRuleSnapshots.ruleId, ruleId),
      orderBy: [desc(metaRuleSnapshots.updatedAt)]
    });
  }

  async deleteByRuleId(ruleId: string) {
    return this.db.delete(metaRuleSnapshots)
      .where(eq(metaRuleSnapshots.ruleId, ruleId))
      .returning();
  }
}
