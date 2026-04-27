import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { jobsState } from '../db/schema.js';

export interface UpsertJobStateInput {
  jobName: string;
  jobKey?: string | null;
  status: string;
  lastError?: string | null;
  payload?: unknown;
}

export class JobsStateRepository {
  private readonly db = getDb();

  async upsert(input: UpsertJobStateInput) {
    const existing = await this.db.query.jobsState.findFirst({
      where: input.jobKey == null
        ? and(eq(jobsState.jobName, input.jobName), isNull(jobsState.jobKey))
        : and(eq(jobsState.jobName, input.jobName), eq(jobsState.jobKey, input.jobKey)),
      orderBy: [desc(jobsState.updatedAt)]
    });

    if (existing) {
      const [updated] = await this.db.update(jobsState)
        .set({
          status: input.status,
          lastError: input.lastError ?? null,
          payload: input.payload ?? null,
          updatedAt: new Date()
        })
        .where(eq(jobsState.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await this.db.insert(jobsState).values({
      jobName: input.jobName,
      jobKey: input.jobKey ?? null,
      status: input.status,
      lastError: input.lastError ?? null,
      payload: input.payload ?? null
    }).returning();

    return created;
  }

  async listRecent(limit = 20) {
    return this.db.query.jobsState.findMany({
      orderBy: [desc(jobsState.updatedAt)],
      limit
    });
  }

  async findLatest(jobName: string, jobKey?: string | null) {
    return this.db.query.jobsState.findFirst({
      where: jobKey == null
        ? and(eq(jobsState.jobName, jobName), isNull(jobsState.jobKey))
        : and(eq(jobsState.jobName, jobName), eq(jobsState.jobKey, jobKey)),
      orderBy: [desc(jobsState.updatedAt)]
    });
  }
}
