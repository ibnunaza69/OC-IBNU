import { createHash } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../foundation/db/client.js';
import { metaRuleHistorySnapshots } from '../../foundation/db/schema.js';
import type { MetaAdRuleHistoryEntry } from '../../providers/meta/meta.types.js';

function toDate(value?: string) {
  return value ? new Date(value) : null;
}

function buildHistoryKey(accountId: string, payload: MetaAdRuleHistoryEntry) {
  const stable = JSON.stringify({
    accountId,
    providerEntryId: payload.id ?? null,
    ruleId: payload.rule_id ?? payload.ad_rule_id ?? null,
    createdTime: payload.created_time ?? null,
    updatedTime: payload.updated_time ?? null,
    payload
  });

  return createHash('sha256').update(stable).digest('hex');
}

export class MetaRuleHistorySnapshotRepository {
  private readonly db = getDb();

  async upsert(accountId: string, payload: MetaAdRuleHistoryEntry) {
    const [result] = await this.bulkUpsert(accountId, [payload]);
    return result;
  }

  async bulkUpsert(accountId: string, payloads: MetaAdRuleHistoryEntry[]) {
    if (payloads.length === 0) return [];

    const values = payloads.map((payload) => ({
      historyKey: buildHistoryKey(accountId, payload),
      accountId,
      ruleId: payload.rule_id ?? payload.ad_rule_id ?? null,
      providerEntryId: payload.id ?? null,
      evaluationSpec: payload.evaluation_spec ?? null,
      executionSpec: payload.execution_spec ?? null,
      scheduleSpec: payload.schedule_spec ?? null,
      providerCreatedTime: toDate(payload.created_time),
      providerUpdatedTime: toDate(payload.updated_time),
      rawPayload: payload,
      syncedAt: new Date(),
      updatedAt: new Date()
    }));

    return this.db.insert(metaRuleHistorySnapshots)
      .values(values)
      .onConflictDoUpdate({
        target: metaRuleHistorySnapshots.historyKey,
        set: {
          accountId: sql`EXCLUDED.account_id`,
          ruleId: sql`EXCLUDED.rule_id`,
          providerEntryId: sql`EXCLUDED.provider_entry_id`,
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
    return this.db.query.metaRuleHistorySnapshots.findMany({
      where: eq(metaRuleHistorySnapshots.accountId, accountId),
      orderBy: [desc(metaRuleHistorySnapshots.updatedAt)],
      limit
    });
  }
}
