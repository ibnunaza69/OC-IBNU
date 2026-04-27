import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { credentialsState } from '../db/schema.js';

export interface SetCredentialStateInput {
  provider: string;
  subject: string;
  isValid: boolean;
  invalidReason?: string | null;
}

export class CredentialsStateRepository {
  private readonly db = getDb();

  async findOne(provider: string, subject: string) {
    return this.db.query.credentialsState.findFirst({
      where: and(
        eq(credentialsState.provider, provider),
        eq(credentialsState.subject, subject)
      )
    });
  }

  async setState(input: SetCredentialStateInput) {
    const existing = await this.findOne(input.provider, input.subject);

    if (existing) {
      const [updated] = await this.db.update(credentialsState)
        .set({
          isValid: input.isValid,
          invalidReason: input.invalidReason ?? null,
          lastCheckedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(credentialsState.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await this.db.insert(credentialsState).values({
      provider: input.provider,
      subject: input.subject,
      isValid: input.isValid,
      invalidReason: input.invalidReason ?? null,
      lastCheckedAt: new Date()
    }).returning();

    return created;
  }

  async listAll(limit = 50) {
    return this.db.query.credentialsState.findMany({
      limit,
      orderBy: (table, { desc }) => [desc(table.updatedAt)]
    });
  }
}
