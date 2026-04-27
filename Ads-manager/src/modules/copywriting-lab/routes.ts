import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { CopyService } from './copy.service.js';

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20).describe('Maximum number of variants to return'),
  campaignId: z.string().min(1).optional().describe('Filter by campaign ID'),
  adSetId: z.string().min(1).optional().describe('Filter by ad set ID'),
  adId: z.string().min(1).optional().describe('Filter by ad ID'),
  lineageKey: z.string().min(1).optional().describe('Filter by lineage key to trace revisions')
});

const reviewQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20).describe('Maximum number of reviews to return'),
  variantId: z.string().uuid().optional().describe('Filter reviews by specific copy variant ID')
});

const variantParamsSchema = z.object({
  variantId: z.string().uuid().describe('The unique identifier of the copy variant')
});

const generateVariantsSchema = z.object({
  brief: z.string().trim().min(5).max(3000).describe('Core brief or instruction for copy generation'),
  productName: z.string().trim().min(1).max(255).optional().describe('Name of the product or service'),
  targetAudience: z.string().trim().min(1).max(255).optional().describe('Description of the target audience'),
  desiredOutcome: z.string().trim().min(1).max(255).optional().describe('What the user should achieve or feel'),
  campaignId: z.string().min(1).optional().describe('Context campaign ID'),
  adSetId: z.string().min(1).optional().describe('Context ad set ID'),
  adId: z.string().min(1).optional().describe('Context ad ID'),
  styles: z.array(z.string().trim().min(1).max(64)).max(8).optional().describe('List of desired copy styles (e.g. benefit-driven, scarcity)'),
  toneKeywords: z.array(z.string().trim().min(1).max(64)).max(8).optional().describe('List of tone keywords (e.g. urgent, elegant)'),
  callToActionType: z.string().trim().min(1).max(64).optional().describe('CTA type (e.g. SHOP_NOW)'),
  reason: z.string().min(5).describe('Reason for generating this copy variant')
});

const reviseVariantSchema = z.object({
  instruction: z.string().trim().min(3).max(500),
  primaryText: z.string().trim().min(1).max(3000).optional(),
  headline: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().min(1).max(255).optional(),
  reason: z.string().min(5)
});

const reviewCopySchema = z.object({
  variantId: z.string().uuid().optional(),
  primaryText: z.string().trim().min(1).max(3000).optional(),
  headline: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().min(1).max(255).optional(),
  productName: z.string().trim().min(1).max(255).optional(),
  targetAudience: z.string().trim().min(1).max(255).optional(),
  desiredOutcome: z.string().trim().min(1).max(255).optional(),
  callToActionType: z.string().trim().min(1).max(64).optional(),
  reason: z.string().min(5).optional()
}).superRefine((value, ctx) => {
  if (!value.variantId && (!value.primaryText || !value.headline)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide variantId or provide both primaryText and headline for ad-hoc review',
      path: ['variantId']
    });
  }
});

function getActorHeader(headers: Record<string, unknown>) {
  const actor = headers['x-actor'];
  return typeof actor === 'string' && actor.trim().length > 0 ? actor.trim() : 'internal-api';
}

/**
 * Registers copywriting lab routes.
 * Provides endpoints for generating, revising, and reviewing ad copy variants.
 */
export async function registerCopywritingRoutes(app: FastifyInstance) {
  const copyService = new CopyService();

  /**
   * GET /internal/copy/variants
   * Lists generated copy variants with optional filtering.
   */
  app.get('/internal/copy/variants', async (request) => {
    const query = limitQuerySchema.parse(request.query);
    return copyService.listVariants(query);
  });

  /**
   * GET /internal/copy/variants/:variantId
   * Retrieves details of a specific copy variant by ID.
   */
  app.get('/internal/copy/variants/:variantId', async (request, reply) => {
    const params = variantParamsSchema.parse(request.params);

    try {
      return await copyService.getVariant(params.variantId);
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Copy variant fetch failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/copy/variants/generate', async (request, reply) => {
    const body = generateVariantsSchema.parse(request.body ?? {});

    try {
      const result = await copyService.generateVariants({
        ...body,
        actor: getActorHeader(request.headers)
      });

      reply.code(201);
      return {
        action: 'generate-copy-variants',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Copy variant generation failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        action: 'generate-copy-variants',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/copy/variants/:variantId/revise', async (request, reply) => {
    const params = variantParamsSchema.parse(request.params);
    const body = reviseVariantSchema.parse(request.body ?? {});

    try {
      const result = await copyService.reviseVariant({
        variantId: params.variantId,
        instruction: body.instruction,
        primaryText: body.primaryText,
        headline: body.headline,
        description: body.description,
        actor: getActorHeader(request.headers),
        reason: body.reason
      });

      reply.code(201);
      return {
        action: 'revise-copy-variant',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Copy variant revision failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        action: 'revise-copy-variant',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.get('/internal/copy/reviews', async (request) => {
    const query = reviewQuerySchema.parse(request.query);
    return copyService.listReviews(query);
  });

  app.post('/internal/copy/reviews', async (request, reply) => {
    const body = reviewCopySchema.parse(request.body ?? {});

    try {
      const result = await copyService.reviewCopy({
        ...body,
        actor: getActorHeader(request.headers)
      });

      reply.code(201);
      return {
        action: 'review-copy',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Copy review failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        action: 'review-copy',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });
}
