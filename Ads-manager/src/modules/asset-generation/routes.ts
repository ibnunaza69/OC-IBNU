import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { MetaApprovalService } from '../meta-write/meta-approval.service.js';
import { AssetLibraryRepository } from './asset.repository.js';
import { CreativeDraftService } from './creative-draft.service.js';
import { enqueueKieImagePollJob } from './image-generation.queue.js';
import { ImageGenerationService } from './image-generation.service.js';
import { MetaVideoPublishService } from './meta-video-publish.service.js';
import { AssetGenerationTaskRepository } from './task.repository.js';
import { enqueueKieRunwayVideoPollJob } from './video-generation.queue.js';
import { VideoGenerationService } from './video-generation.service.js';

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20).describe('Maximum number of items to return'),
  assetType: z.enum(['image', 'video']).optional().describe('Filter by asset type (image or video)')
});

const taskParamsSchema = z.object({
  taskId: z.string().uuid().describe('The unique identifier of the generation task')
});

const assetParamsSchema = z.object({
  assetId: z.string().uuid().describe('The unique identifier of the asset')
});

const imageGenerationSchema = z.object({
  providerPayload: z.record(z.string(), z.unknown()).describe('Payload to send to the image provider'),
  templateVersion: z.string().trim().min(1).max(128).optional().describe('Version of the image generation template'),
  callbackUrl: z.string().url().optional().describe('Webhook URL to receive generation updates'),
  enqueuePolling: z.boolean().optional().default(true).describe('Whether to enqueue background polling'),
  dryRun: z.boolean().optional().default(true).describe('If true, validates without making changes'),
  reason: z.string().min(5).describe('Reason provided by AI Agent for this generation')
});

const imageCreativeDraftSchema = z.object({
  pageId: z.string().min(1),
  linkUrl: z.string().url(),
  message: z.string().trim().min(1).max(2000),
  headline: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(255).optional(),
  callToActionType: z.string().trim().min(1).max(64).optional(),
  instagramActorId: z.string().min(1).optional(),
  reason: z.string().min(5).optional()
});

const videoCreativeDraftSchema = z.object({
  pageId: z.string().min(1),
  linkUrl: z.string().url(),
  message: z.string().trim().min(1).max(2000),
  headline: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(255).optional(),
  callToActionType: z.string().trim().min(1).max(64).optional(),
  metaVideoId: z.string().min(1).optional(),
  instagramActorId: z.string().min(1).optional(),
  reason: z.string().min(5).optional()
});

const metaVideoPublishSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  reason: z.string().min(5),
  dryRun: z.boolean().optional().default(true),
  reuseExisting: z.boolean().optional().default(true),
  waitForReady: z.boolean().optional().default(true),
  timeoutSeconds: z.coerce.number().int().positive().max(900).optional().default(180)
});

const videoGenerationPlanSchema = z.object({
  brief: z.string().trim().min(5),
  templateVersion: z.string().trim().min(1).max(128).optional(),
  aspectRatio: z.string().trim().min(1).max(32).optional(),
  durationSeconds: z.coerce.number().int().positive().max(300).optional(),
  outputStyle: z.string().trim().min(1).max(64).optional(),
  storyboard: z.array(z.record(z.string(), z.unknown())).optional(),
  referenceAssetIds: z.array(z.string().uuid()).optional(),
  reason: z.string().min(5)
});

const runwayVideoGenerationSchema = z.object({
  prompt: z.string().trim().min(5).max(1800),
  imageAssetId: z.string().uuid().optional(),
  imageUrl: z.string().url().optional(),
  durationSeconds: z.union([z.literal(5), z.literal(10)]).optional().default(5),
  quality: z.enum(['720p', '1080p']).optional().default('720p'),
  aspectRatio: z.enum(['16:9', '4:3', '1:1', '3:4', '9:16']).optional(),
  watermark: z.string().max(255).optional(),
  templateVersion: z.string().trim().min(1).max(128).optional(),
  callbackUrl: z.string().url().optional(),
  enqueuePolling: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(true),
  reason: z.string().min(5)
}).superRefine((value, ctx) => {
  const hasImageAsset = typeof value.imageAssetId === 'string' && value.imageAssetId.trim().length > 0;
  const hasImageUrl = typeof value.imageUrl === 'string' && value.imageUrl.trim().length > 0;

  if (hasImageAsset && hasImageUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Use either imageAssetId or imageUrl, not both',
      path: ['imageAssetId']
    });
  }

  if (!hasImageAsset && !hasImageUrl && !value.aspectRatio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'aspectRatio is required for text-to-video generation without imageAssetId/imageUrl',
      path: ['aspectRatio']
    });
  }
});

function getActorHeader(headers: Record<string, unknown>) {
  const header = headers['x-actor'];
  return typeof header === 'string' && header.trim().length > 0 ? header.trim() : 'internal-api';
}

function getWriteSecretHeader(headers: Record<string, unknown>) {
  const header = headers['x-meta-write-secret'];
  return typeof header === 'string' ? header : undefined;
}

function getApprovalIdHeader(headers: Record<string, unknown>) {
  const header = headers['x-meta-write-approval-id'];
  return typeof header === 'string' ? header : undefined;
}

function getApprovalTokenHeader(headers: Record<string, unknown>) {
  const header = headers['x-meta-write-approval-token'];
  return typeof header === 'string' ? header : undefined;
}

function ensureMetaPublishAllowed(request: { dryRun?: boolean | undefined; secret?: string | undefined; reason: string }) {
  if (!request.reason || request.reason.trim().length < 5) {
    throw new AppError('Write reason is required and must be at least 5 characters', 'VALIDATION_ERROR', 400);
  }

  if (request.dryRun) {
    return {
      ok: true,
      mode: 'dry-run' as const,
      writeEnabled: env.META_WRITE_ENABLED,
      secretRequired: Boolean(env.META_WRITE_SECRET)
    };
  }

  if (!env.META_WRITE_ENABLED) {
    throw new AppError('Meta write gate is disabled', 'POLICY_REJECTED', 403);
  }

  if (env.META_WRITE_SECRET && request.secret !== env.META_WRITE_SECRET) {
    throw new AppError('Invalid write secret', 'PERMISSION_DENIED', 403);
  }

  return {
    ok: true,
    mode: 'live' as const,
    writeEnabled: env.META_WRITE_ENABLED,
    secretRequired: Boolean(env.META_WRITE_SECRET)
  };
}

/**
 * Registers asset generation routes.
 * Provides endpoints for generating, managing, and polling image and video assets.
 */
export async function registerAssetGenerationRoutes(app: FastifyInstance) {
  const taskRepository = new AssetGenerationTaskRepository();
  const assetRepository = new AssetLibraryRepository();
  const creativeDraftService = new CreativeDraftService();
  const imageGenerationService = new ImageGenerationService();
  const metaApprovalService = new MetaApprovalService();
  const metaVideoPublishService = new MetaVideoPublishService();
  const videoGenerationService = new VideoGenerationService();

  /**
   * GET /internal/assets/generation-tasks
   * Lists recent generation tasks with optional filtering by asset type.
   */
  app.get('/internal/assets/generation-tasks', async (request) => {
    const query = limitQuerySchema.parse(request.query);
    const items = await taskRepository.listRecent(query.limit, query.assetType);

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/assets/generation-tasks/:taskId', async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);
    const item = await taskRepository.findById(params.taskId);

    if (!item) {
      reply.code(404);
      return {
        ok: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Asset generation task not found'
        }
      };
    }

    return {
      ok: true,
      item
    };
  });

  app.get('/internal/assets/library', async (request) => {
    const query = limitQuerySchema.parse(request.query);
    const items = await assetRepository.listRecent(query.limit, query.assetType);

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/assets/library/:assetId', async (request, reply) => {
    const params = assetParamsSchema.parse(request.params);
    const item = await assetRepository.findById(params.assetId);

    if (!item) {
      reply.code(404);
      return {
        ok: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'Asset not found'
        }
      };
    }

    return {
      ok: true,
      item
    };
  });

  app.post('/internal/assets/images/:assetId/creative-draft', async (request, reply) => {
    const params = assetParamsSchema.parse(request.params);
    const body = imageCreativeDraftSchema.parse(request.body ?? {});

    try {
      const result = await creativeDraftService.buildImageAssetCreativeDraft({
        assetId: params.assetId,
        pageId: body.pageId,
        linkUrl: body.linkUrl,
        message: body.message,
        headline: body.headline,
        description: body.description,
        callToActionType: body.callToActionType,
        instagramActorId: body.instagramActorId,
        actor: getActorHeader(request.headers),
        reason: body.reason
      });

      return {
        action: 'build-image-creative-draft',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Image creative draft build failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        action: 'build-image-creative-draft',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/assets/videos/:assetId/creative-draft', async (request, reply) => {
    const params = assetParamsSchema.parse(request.params);
    const body = videoCreativeDraftSchema.parse(request.body ?? {});

    try {
      const result = await creativeDraftService.buildVideoAssetCreativeDraft({
        assetId: params.assetId,
        pageId: body.pageId,
        linkUrl: body.linkUrl,
        message: body.message,
        headline: body.headline,
        description: body.description,
        callToActionType: body.callToActionType,
        metaVideoId: body.metaVideoId,
        instagramActorId: body.instagramActorId,
        actor: getActorHeader(request.headers),
        reason: body.reason
      });

      return {
        action: 'build-video-creative-draft',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Video creative draft build failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        action: 'build-video-creative-draft',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/assets/videos/:assetId/publish/meta', async (request, reply) => {
    const params = assetParamsSchema.parse(request.params);
    const body = metaVideoPublishSchema.parse(request.body ?? {});
    const actor = getActorHeader(request.headers);

    try {
      const writeGate = ensureMetaPublishAllowed({
        dryRun: body.dryRun,
        reason: body.reason,
        secret: getWriteSecretHeader(request.headers)
      });

      if (!body.dryRun) {
        await metaApprovalService.assertAndConsumeApproval({
          operationType: 'meta.video.publish',
          targetType: 'asset-library',
          targetId: params.assetId,
          actor,
          reason: body.reason,
          payload: {
            assetId: params.assetId,
            title: body.title ?? null,
            reuseExisting: body.reuseExisting,
            waitForReady: body.waitForReady,
            timeoutSeconds: body.timeoutSeconds
          },
          approvalId: getApprovalIdHeader(request.headers),
          approvalToken: getApprovalTokenHeader(request.headers)
        });
      }

      const result = await metaVideoPublishService.publishVideoAssetToMeta({
        assetId: params.assetId,
        title: body.title,
        actor,
        reason: body.reason,
        dryRun: body.dryRun,
        reuseExisting: body.reuseExisting,
        waitForReady: body.waitForReady,
        timeoutSeconds: body.timeoutSeconds
      });

      reply.code(body.dryRun ? 200 : 201);
      return {
        action: 'publish-video-to-meta',
        writeGate,
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta video publish failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        action: 'publish-video-to-meta',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/assets/images/generations', async (request, reply) => {
    const body = imageGenerationSchema.parse(request.body ?? {});

    try {
      const result = await imageGenerationService.createImageGenerationTask({
        providerPayload: body.providerPayload,
        templateVersion: body.templateVersion,
        callbackUrl: body.callbackUrl,
        enqueuePolling: body.enqueuePolling,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        reason: body.reason
      });

      const pollJob = !body.dryRun && result.mode === 'live' && result.queueSuggestion
        ? await enqueueKieImagePollJob(result.queueSuggestion)
        : null;

      reply.code(body.dryRun ? 200 : 202);
      return {
        action: 'generate-image',
        ...result,
        pollJob
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Image generation request failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'kie',
        action: 'generate-image',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/assets/generation-tasks/:taskId/poll', async (request, reply) => {
    const params = taskParamsSchema.parse(request.params);

    try {
      const task = await taskRepository.findById(params.taskId);

      if (!task) {
        reply.code(404);
        return {
          ok: false,
          action: 'poll-generation-task',
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: 'Asset generation task not found',
            details: null
          }
        };
      }

      const actor = getActorHeader(request.headers);
      const result = task.assetType === 'video'
        ? await videoGenerationService.refreshRunwayVideoTask({ taskId: params.taskId, actor })
        : await imageGenerationService.refreshKieImageTask({ taskId: params.taskId, actor });

      return {
        action: 'poll-generation-task',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Generation task poll failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        action: 'poll-generation-task',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/assets/library/:assetId/refresh-metadata', async (request, reply) => {
    const params = assetParamsSchema.parse(request.params);

    try {
      const result = await imageGenerationService.refreshStoredImageAssetMetadata({
        assetId: params.assetId,
        actor: getActorHeader(request.headers)
      });

      return {
        action: 'refresh-asset-metadata',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Asset metadata refresh failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        action: 'refresh-asset-metadata',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/assets/kie/callback', async (request, reply) => {
    try {
      const result = await imageGenerationService.ingestKieCallback(request.body ?? {}, 'kie-callback');
      reply.code(result.ok ? 202 : 200);
      return result;
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('KIE callback ingest failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'kie',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/assets/kie/runway/callback', async (request, reply) => {
    try {
      const result = await videoGenerationService.ingestRunwayCallback(request.body ?? {}, 'kie-runway-callback');
      reply.code(result.ok ? 202 : 200);
      return result;
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('KIE Runway callback ingest failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'kie-runway',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/assets/videos/generations/plan', async (request, reply) => {
    const body = videoGenerationPlanSchema.parse(request.body ?? {});

    try {
      const result = await videoGenerationService.createPlan({
        brief: body.brief,
        templateVersion: body.templateVersion,
        aspectRatio: body.aspectRatio,
        durationSeconds: body.durationSeconds,
        outputStyle: body.outputStyle,
        storyboard: body.storyboard,
        referenceAssetIds: body.referenceAssetIds,
        actor: getActorHeader(request.headers),
        reason: body.reason
      });

      reply.code(201);
      return {
        action: 'plan-video-generation',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Video generation plan failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'unconfigured',
        action: 'plan-video-generation',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/assets/videos/generations', async (request, reply) => {
    const body = runwayVideoGenerationSchema.parse(request.body ?? {});

    try {
      const result = await videoGenerationService.createRunwayVideoTask({
        prompt: body.prompt,
        imageAssetId: body.imageAssetId,
        imageUrl: body.imageUrl,
        durationSeconds: body.durationSeconds,
        quality: body.quality,
        aspectRatio: body.aspectRatio,
        watermark: body.watermark,
        templateVersion: body.templateVersion,
        callbackUrl: body.callbackUrl,
        enqueuePolling: body.enqueuePolling,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        reason: body.reason
      });

      const pollJob = !body.dryRun && result.mode === 'live' && result.queueSuggestion
        ? await enqueueKieRunwayVideoPollJob(result.queueSuggestion)
        : null;

      reply.code(body.dryRun ? 200 : 202);
      return {
        action: 'generate-video',
        ...result,
        pollJob
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Video generation request failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'kie-runway',
        action: 'generate-video',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });
}
