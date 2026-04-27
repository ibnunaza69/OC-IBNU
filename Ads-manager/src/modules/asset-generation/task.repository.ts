import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../foundation/db/client.js';
import { assetGenerationTasks } from '../foundation/db/schema.js';

export interface CreateAssetGenerationTaskInput {
  assetType: 'image' | 'video';
  taskType: string;
  provider: string;
  providerTaskId?: string | null;
  status: string;
  actor: string;
  reason?: string | null;
  sourceAssetId?: string | null;
  callbackUrl?: string | null;
  inputPayload?: unknown;
  normalizedInput?: unknown;
  providerResponse?: unknown;
  outputPayload?: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  expiresAt?: Date | null;
}

export interface UpdateAssetGenerationTaskInput {
  status?: string | undefined;
  providerTaskId?: string | null | undefined;
  callbackUrl?: string | null | undefined;
  normalizedInput?: unknown;
  providerResponse?: unknown;
  outputPayload?: unknown;
  errorCode?: string | null | undefined;
  errorMessage?: string | null | undefined;
  startedAt?: Date | null | undefined;
  finishedAt?: Date | null | undefined;
  expiresAt?: Date | null | undefined;
}

export class AssetGenerationTaskRepository {
  private readonly db = getDb();

  async create(input: CreateAssetGenerationTaskInput) {
    const [record] = await this.db.insert(assetGenerationTasks).values({
      assetType: input.assetType,
      taskType: input.taskType,
      provider: input.provider,
      providerTaskId: input.providerTaskId ?? null,
      status: input.status,
      actor: input.actor,
      reason: input.reason ?? null,
      sourceAssetId: input.sourceAssetId ?? null,
      callbackUrl: input.callbackUrl ?? null,
      inputPayload: input.inputPayload ?? null,
      normalizedInput: input.normalizedInput ?? null,
      providerResponse: input.providerResponse ?? null,
      outputPayload: input.outputPayload ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
      expiresAt: input.expiresAt ?? null
    }).returning();

    return record;
  }

  async updateById(id: string, input: UpdateAssetGenerationTaskInput) {
    const [record] = await this.db.update(assetGenerationTasks)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.providerTaskId !== undefined ? { providerTaskId: input.providerTaskId } : {}),
        ...(input.callbackUrl !== undefined ? { callbackUrl: input.callbackUrl } : {}),
        ...(input.normalizedInput !== undefined ? { normalizedInput: input.normalizedInput } : {}),
        ...(input.providerResponse !== undefined ? { providerResponse: input.providerResponse } : {}),
        ...(input.outputPayload !== undefined ? { outputPayload: input.outputPayload } : {}),
        ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
        ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {}),
        ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
        ...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        updatedAt: new Date()
      })
      .where(eq(assetGenerationTasks.id, id))
      .returning();

    return record ?? null;
  }

  async updateByProviderTaskId(provider: string, providerTaskId: string, input: UpdateAssetGenerationTaskInput) {
    const existing = await this.findByProviderTaskId(provider, providerTaskId);
    if (!existing) {
      return null;
    }

    return this.updateById(existing.id, input);
  }

  async findById(id: string) {
    return this.db.query.assetGenerationTasks.findFirst({
      where: eq(assetGenerationTasks.id, id)
    });
  }

  async findByProviderTaskId(provider: string, providerTaskId: string) {
    return this.db.query.assetGenerationTasks.findFirst({
      where: and(
        eq(assetGenerationTasks.provider, provider),
        eq(assetGenerationTasks.providerTaskId, providerTaskId)
      ),
      orderBy: [desc(assetGenerationTasks.updatedAt)]
    });
  }

  async listRecent(limit = 20, assetType?: 'image' | 'video') {
    return this.db.query.assetGenerationTasks.findMany({
      where: assetType ? eq(assetGenerationTasks.assetType, assetType) : undefined,
      orderBy: [desc(assetGenerationTasks.updatedAt)],
      limit
    });
  }
}
