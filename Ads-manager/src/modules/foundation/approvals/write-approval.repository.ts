import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { writeApprovals } from '../db/schema.js';

export interface CreateWriteApprovalInput {
  operationType: string;
  targetType: string;
  targetId: string;
  actor: string;
  reason: string;
  requestFingerprint: string;
  approvalTokenHash: string;
  status: 'pending' | 'used' | 'expired' | 'revoked';
  payload?: unknown;
  expiresAt: Date;
}

export class WriteApprovalRepository {
  private readonly db = getDb();

  async create(input: CreateWriteApprovalInput) {
    const [created] = await this.db.insert(writeApprovals).values({
      operationType: input.operationType,
      targetType: input.targetType,
      targetId: input.targetId,
      actor: input.actor,
      reason: input.reason,
      requestFingerprint: input.requestFingerprint,
      approvalTokenHash: input.approvalTokenHash,
      status: input.status,
      payload: input.payload ?? null,
      expiresAt: input.expiresAt
    }).returning();

    return created;
  }

  async findById(id: string) {
    return this.db.query.writeApprovals.findFirst({
      where: eq(writeApprovals.id, id)
    });
  }

  async markUsed(id: string) {
    const [updated] = await this.db.update(writeApprovals)
      .set({
        status: 'used',
        usedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(writeApprovals.id, id))
      .returning();

    return updated;
  }

  async markExpired(id: string) {
    const [updated] = await this.db.update(writeApprovals)
      .set({
        status: 'expired',
        updatedAt: new Date()
      })
      .where(eq(writeApprovals.id, id))
      .returning();

    return updated;
  }

  async listRecent(limit = 20) {
    return this.db.query.writeApprovals.findMany({
      orderBy: [desc(writeApprovals.updatedAt)],
      limit
    });
  }
}
