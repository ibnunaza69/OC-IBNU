import { and, desc, eq, max } from 'drizzle-orm';
import { getDb } from '../foundation/db/client.js';
import { copyReviews, copyVariants } from '../foundation/db/schema.js';

export type CopyVariantCreateInput = {
  lineageKey: string;
  batchId: string;
  parentVariantId?: string | null;
  versionNumber: number;
  sourceType: 'generated' | 'revision' | 'imported';
  style: string;
  actor: string;
  reason?: string | null;
  brief: string;
  productName?: string | null | undefined;
  targetAudience?: string | null | undefined;
  desiredOutcome?: string | null | undefined;
  campaignId?: string | null | undefined;
  adSetId?: string | null | undefined;
  adId?: string | null | undefined;
  contextSummary?: unknown;
  toneKeywords?: string[] | null;
  callToActionType?: string | null | undefined;
  primaryText: string;
  headline: string;
  description?: string | null | undefined;
  metadata?: unknown;
};

export type CopyReviewCreateInput = {
  variantId?: string | null;
  actor: string;
  reviewMode: 'variant' | 'ad-hoc';
  reviewInput?: unknown;
  overallScore: number;
  rubric: unknown;
  summary: string;
  strengths: string[];
  risks: string[];
  suggestions: string[];
};

export class CopyRepository {
  private readonly db = getDb();

  async getNextVersionNumber(lineageKey: string) {
    const [row] = await this.db
      .select({ maxVersion: max(copyVariants.versionNumber) })
      .from(copyVariants)
      .where(eq(copyVariants.lineageKey, lineageKey));

    return (row?.maxVersion ?? 0) + 1;
  }

  async createVariant(input: CopyVariantCreateInput) {
    const [created] = await this.db.insert(copyVariants).values({
      lineageKey: input.lineageKey,
      batchId: input.batchId,
      parentVariantId: input.parentVariantId ?? null,
      versionNumber: input.versionNumber,
      sourceType: input.sourceType,
      style: input.style,
      actor: input.actor,
      reason: input.reason ?? null,
      brief: input.brief,
      productName: input.productName ?? null,
      targetAudience: input.targetAudience ?? null,
      desiredOutcome: input.desiredOutcome ?? null,
      campaignId: input.campaignId ?? null,
      adSetId: input.adSetId ?? null,
      adId: input.adId ?? null,
      contextSummary: input.contextSummary ?? null,
      toneKeywords: input.toneKeywords ?? null,
      callToActionType: input.callToActionType ?? null,
      primaryText: input.primaryText,
      headline: input.headline,
      description: input.description ?? null,
      metadata: input.metadata ?? null,
      updatedAt: new Date()
    }).returning();

    return created;
  }

  async findVariantById(id: string) {
    return this.db.query.copyVariants.findFirst({
      where: eq(copyVariants.id, id)
    });
  }

  async listVariants(filters: {
    limit?: number;
    campaignId?: string | undefined;
    adSetId?: string | undefined;
    adId?: string | undefined;
    lineageKey?: string | undefined;
  }) {
    const conditions = [];

    if (filters.campaignId) {
      conditions.push(eq(copyVariants.campaignId, filters.campaignId));
    }

    if (filters.adSetId) {
      conditions.push(eq(copyVariants.adSetId, filters.adSetId));
    }

    if (filters.adId) {
      conditions.push(eq(copyVariants.adId, filters.adId));
    }

    if (filters.lineageKey) {
      conditions.push(eq(copyVariants.lineageKey, filters.lineageKey));
    }

    return this.db.query.copyVariants.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(copyVariants.createdAt)],
      limit: filters.limit ?? 20
    });
  }

  async createReview(input: CopyReviewCreateInput) {
    const [created] = await this.db.insert(copyReviews).values({
      variantId: input.variantId ?? null,
      actor: input.actor,
      reviewMode: input.reviewMode,
      reviewInput: input.reviewInput ?? null,
      overallScore: input.overallScore,
      rubric: input.rubric,
      summary: input.summary,
      strengths: input.strengths,
      risks: input.risks,
      suggestions: input.suggestions
    }).returning();

    return created;
  }

  async listReviews(filters: { limit?: number; variantId?: string | undefined }) {
    const conditions = [];

    if (filters.variantId) {
      conditions.push(eq(copyReviews.variantId, filters.variantId));
    }

    return this.db.query.copyReviews.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(copyReviews.createdAt)],
      limit: filters.limit ?? 20
    });
  }
}
