import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { operationAudits } from '../db/schema.js';
import type { AuditEvent } from './audit.types.js';

interface AssetBindingMetadata {
  assetBinding?: {
    assetId?: string;
    sourceUrl?: string | null;
    thumbnailUrl?: string | null;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
    provider?: string | null;
    creativeType?: string | null;
  } | null;
}

export class AuditRepository {
  private readonly db = getDb();

  async create(event: AuditEvent) {
    const [record] = await this.db.insert(operationAudits).values({
      operationType: event.operationType,
      actor: event.actor,
      targetType: event.targetType,
      targetId: event.targetId,
      status: event.status,
      reason: event.reason,
      beforeState: event.beforeState,
      afterState: event.afterState,
      metadata: event.metadata
    }).returning();

    return record;
  }

  async listRecent(limit = 20) {
    return this.db.query.operationAudits.findMany({
      orderBy: [desc(operationAudits.createdAt)],
      limit
    });
  }

  async findRecentByOperation(operationTypes: string[], limit = 20) {
    const normalized = Array.from(new Set(operationTypes.filter(Boolean)));
    if (!normalized.length) {
      return [];
    }

    return this.db.query.operationAudits.findMany({
      where: inArray(operationAudits.operationType, normalized),
      orderBy: [desc(operationAudits.createdAt)],
      limit
    });
  }

  async findRecentByTarget(targetType: string, targetId: string, operationTypes?: string[], limit = 20) {
    const operationFilter = operationTypes && operationTypes.length
      ? inArray(operationAudits.operationType, Array.from(new Set(operationTypes.filter(Boolean))))
      : undefined;

    return this.db.query.operationAudits.findMany({
      where: operationFilter
        ? and(
            eq(operationAudits.targetType, targetType),
            eq(operationAudits.targetId, targetId),
            operationFilter
          )
        : and(
            eq(operationAudits.targetType, targetType),
            eq(operationAudits.targetId, targetId)
          ),
      orderBy: [desc(operationAudits.createdAt)],
      limit
    });
  }

  async findLatestAdAssetBindings(adIds: string[]) {
    const uniqueAdIds = Array.from(new Set(adIds.filter(Boolean)));
    if (!uniqueAdIds.length) {
      return new Map<string, NonNullable<AssetBindingMetadata['assetBinding']>>();
    }

    const rows = await this.db.query.operationAudits.findMany({
      where: and(
        eq(operationAudits.operationType, 'meta.ad.create'),
        eq(operationAudits.targetType, 'ad'),
        eq(operationAudits.status, 'success'),
        inArray(operationAudits.targetId, uniqueAdIds)
      ),
      orderBy: [desc(operationAudits.createdAt)]
    });

    const bindings = new Map<string, NonNullable<AssetBindingMetadata['assetBinding']>>();

    for (const row of rows) {
      if (bindings.has(row.targetId)) {
        continue;
      }

      const metadata = (row.metadata ?? {}) as AssetBindingMetadata;
      const assetBinding = metadata.assetBinding;
      if (!assetBinding || typeof assetBinding !== 'object') {
        continue;
      }

      bindings.set(row.targetId, assetBinding);
    }

    return bindings;
  }
}
