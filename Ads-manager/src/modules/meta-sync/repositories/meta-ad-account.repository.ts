import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../../foundation/db/client.js';
import { metaAdAccountSnapshots } from '../../foundation/db/schema.js';
import type { MetaAdAccountBasic } from '../../providers/meta/meta.types.js';

export class MetaAdAccountSnapshotRepository {
  private readonly db = getDb();

  async upsert(accountId: string, payload: MetaAdAccountBasic) {
    const [result] = await this.db.insert(metaAdAccountSnapshots)
      .values({
        accountId,
        name: payload.name ?? null,
        accountStatus: payload.account_status ?? null,
        currency: payload.currency ?? null,
        rawPayload: payload,
        syncedAt: new Date(),
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: metaAdAccountSnapshots.accountId,
        set: {
          name: sql`EXCLUDED.name`,
          accountStatus: sql`EXCLUDED.account_status`,
          currency: sql`EXCLUDED.currency`,
          rawPayload: sql`EXCLUDED.raw_payload`,
          syncedAt: sql`EXCLUDED.synced_at`,
          updatedAt: sql`EXCLUDED.updated_at`
        }
      })
      .returning();

    return result;
  }

  async getLatest(accountId: string) {
    return this.db.query.metaAdAccountSnapshots.findFirst({
      where: eq(metaAdAccountSnapshots.accountId, accountId)
    });
  }

  async listRecent(limit = 20) {
    return this.db.query.metaAdAccountSnapshots.findMany({
      orderBy: [desc(metaAdAccountSnapshots.updatedAt)],
      limit
    });
  }
}
