import { desc } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { providerRequestLogs } from '../db/schema.js';

export interface ProviderRequestLogInput {
  requestId: string;
  provider: string;
  endpoint: string;
  method: string;
  statusCode?: number | undefined;
  objectType?: string | undefined;
  objectId?: string | undefined;
  payload?: unknown;
  responseBody?: unknown;
}

export class ProviderRequestLogRepository {
  private readonly db = getDb();

  async create(input: ProviderRequestLogInput) {
    const [record] = await this.db.insert(providerRequestLogs).values({
      requestId: input.requestId,
      provider: input.provider,
      endpoint: input.endpoint,
      method: input.method,
      statusCode: input.statusCode,
      objectType: input.objectType,
      objectId: input.objectId,
      payload: input.payload,
      responseBody: input.responseBody
    }).returning();

    return record;
  }

  async listRecent(limit = 20) {
    return this.db.query.providerRequestLogs.findMany({
      orderBy: [desc(providerRequestLogs.createdAt)],
      limit
    });
  }
}
