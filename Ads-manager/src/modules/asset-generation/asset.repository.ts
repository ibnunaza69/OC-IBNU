import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../foundation/db/client.js';
import { assetLibrary } from '../foundation/db/schema.js';

export interface UpsertAssetLibraryInput {
  assetType: 'image' | 'video';
  provider: string;
  status: string;
  sourceTaskId?: string | null;
  providerAssetId?: string | null;
  title?: string | null;
  mimeType?: string | null;
  originalUrl?: string | null;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  promptVersion?: string | null;
  metadata?: unknown;
  expiresAt?: Date | null;
}

export class AssetLibraryRepository {
  private readonly db = getDb();

  async findById(id: string) {
    return this.db.query.assetLibrary.findFirst({
      where: eq(assetLibrary.id, id)
    });
  }

  async upsert(input: UpsertAssetLibraryInput) {
    const existing = input.sourceTaskId && input.originalUrl
      ? await this.db.query.assetLibrary.findFirst({
          where: and(
            eq(assetLibrary.sourceTaskId, input.sourceTaskId),
            eq(assetLibrary.originalUrl, input.originalUrl)
          ),
          orderBy: [desc(assetLibrary.updatedAt)]
        })
      : null;

    if (existing) {
      const [updated] = await this.db.update(assetLibrary)
        .set({
          status: input.status,
          providerAssetId: input.providerAssetId ?? null,
          title: input.title ?? null,
          mimeType: input.mimeType ?? null,
          thumbnailUrl: input.thumbnailUrl ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          durationSeconds: input.durationSeconds ?? null,
          promptVersion: input.promptVersion ?? null,
          metadata: input.metadata ?? null,
          expiresAt: input.expiresAt ?? null,
          updatedAt: new Date()
        })
        .where(eq(assetLibrary.id, existing.id))
        .returning();

      return updated;
    }

    const [created] = await this.db.insert(assetLibrary).values({
      assetType: input.assetType,
      provider: input.provider,
      status: input.status,
      sourceTaskId: input.sourceTaskId ?? null,
      providerAssetId: input.providerAssetId ?? null,
      title: input.title ?? null,
      mimeType: input.mimeType ?? null,
      originalUrl: input.originalUrl ?? null,
      thumbnailUrl: input.thumbnailUrl ?? null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? null,
      promptVersion: input.promptVersion ?? null,
      metadata: input.metadata ?? null,
      expiresAt: input.expiresAt ?? null
    }).returning();

    return created;
  }

  async listRecent(limit = 20, assetType?: 'image' | 'video') {
    return this.db.query.assetLibrary.findMany({
      where: assetType ? eq(assetLibrary.assetType, assetType) : undefined,
      orderBy: [desc(assetLibrary.updatedAt)],
      limit
    });
  }

  async findManyByIds(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (!uniqueIds.length) {
      return [];
    }

    return this.db.query.assetLibrary.findMany({
      where: inArray(assetLibrary.id, uniqueIds)
    });
  }

  async updateById(id: string, input: Omit<UpsertAssetLibraryInput, 'assetType' | 'provider' | 'status'> & { status?: string | undefined }) {
    const [updated] = await this.db.update(assetLibrary)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.sourceTaskId !== undefined ? { sourceTaskId: input.sourceTaskId } : {}),
        ...(input.providerAssetId !== undefined ? { providerAssetId: input.providerAssetId } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.mimeType !== undefined ? { mimeType: input.mimeType } : {}),
        ...(input.originalUrl !== undefined ? { originalUrl: input.originalUrl } : {}),
        ...(input.thumbnailUrl !== undefined ? { thumbnailUrl: input.thumbnailUrl } : {}),
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
        ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
        ...(input.promptVersion !== undefined ? { promptVersion: input.promptVersion } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        updatedAt: new Date()
      })
      .where(eq(assetLibrary.id, id))
      .returning();

    return updated ?? null;
  }

  async deleteById(id: string) {
    const [deleted] = await this.db.delete(assetLibrary)
      .where(eq(assetLibrary.id, id))
      .returning();

    return deleted ?? null;
  }
}
