import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { KieClient } from '../providers/kie/kie.client.js';
import type { KieRunwayVideoDetailResponse } from '../providers/kie/kie.types.js';
import { AssetLibraryRepository } from './asset.repository.js';
import { AssetGenerationTaskRepository } from './task.repository.js';

interface VideoGenerationPlanRequest {
  brief: string;
  templateVersion?: string | undefined;
  aspectRatio?: string | undefined;
  durationSeconds?: number | undefined;
  outputStyle?: string | undefined;
  storyboard?: Array<Record<string, unknown>> | undefined;
  referenceAssetIds?: string[] | undefined;
  actor?: string | undefined;
  reason: string;
}

interface CreateRunwayVideoGenerationRequest {
  prompt: string;
  imageAssetId?: string | undefined;
  imageUrl?: string | undefined;
  durationSeconds?: 5 | 10 | undefined;
  quality?: '720p' | '1080p' | undefined;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | undefined;
  watermark?: string | undefined;
  templateVersion?: string | undefined;
  callbackUrl?: string | undefined;
  enqueuePolling?: boolean | undefined;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  reason: string;
}

interface RefreshRunwayVideoTaskRequest {
  taskId: string;
  actor?: string | undefined;
}

type RunwayVideoTaskDetail = NonNullable<KieRunwayVideoDetailResponse['data']>;

function ensureReason(reason: string) {
  if (!reason || reason.trim().length < 5) {
    throw new AppError('Reason is required and must be at least 5 characters', 'VALIDATION_ERROR', 400);
  }
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeRunwayTaskStatus(detail: RunwayVideoTaskDetail | undefined) {
  const state = detail?.state?.toLowerCase() ?? '';
  if (state === 'success') {
    return 'succeeded' as const;
  }

  if (state === 'fail') {
    return 'failed' as const;
  }

  if (state === 'wait' || state === 'queueing') {
    return 'submitted' as const;
  }

  return 'processing' as const;
}

function inferVideoMimeType(videoUrl: string | null | undefined) {
  if (!videoUrl) {
    return null;
  }

  const lower = videoUrl.toLowerCase();
  if (lower.includes('.mp4')) {
    return 'video/mp4';
  }

  if (lower.includes('.mov')) {
    return 'video/quicktime';
  }

  if (lower.includes('.webm')) {
    return 'video/webm';
  }

  return null;
}

export class VideoGenerationService {
  private readonly auditRepository = new AuditRepository();
  private readonly taskRepository = new AssetGenerationTaskRepository();
  private readonly assetRepository = new AssetLibraryRepository();
  private readonly kieClient = new KieClient();

  private async resolveImageUrlFromAsset(assetId?: string) {
    if (!assetId) {
      return null;
    }

    const asset = await this.assetRepository.findById(assetId);
    if (!asset) {
      throw new AppError('Referenced image asset not found for video generation', 'RESOURCE_NOT_FOUND', 404, {
        assetId
      });
    }

    if (asset.assetType !== 'image' || !asset.originalUrl) {
      throw new AppError('Video generation imageAssetId must point to an image asset with originalUrl', 'VALIDATION_ERROR', 400, {
        assetId: asset.id,
        assetType: asset.assetType,
        originalUrl: asset.originalUrl
      });
    }

    return {
      assetId: asset.id,
      imageUrl: asset.originalUrl,
      thumbnailUrl: asset.thumbnailUrl ?? asset.originalUrl,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height
    };
  }

  async createPlan(input: VideoGenerationPlanRequest) {
    ensureReason(input.reason);

    if (!input.brief || input.brief.trim().length < 5) {
      throw new AppError('Video brief must be at least 5 characters', 'VALIDATION_ERROR', 400);
    }

    if (input.durationSeconds !== undefined && (!Number.isInteger(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 300)) {
      throw new AppError('durationSeconds must be an integer between 1 and 300', 'VALIDATION_ERROR', 400);
    }

    const actor = input.actor ?? 'internal-api';
    const normalizedPlan = {
      brief: input.brief.trim(),
      templateVersion: input.templateVersion ?? null,
      aspectRatio: input.aspectRatio ?? '9:16',
      durationSeconds: input.durationSeconds ?? 15,
      outputStyle: input.outputStyle ?? 'ads-performance',
      storyboard: input.storyboard ?? [],
      referenceAssetIds: input.referenceAssetIds ?? []
    };

    const task = await this.taskRepository.create({
      assetType: 'video',
      taskType: 'video-generate',
      provider: 'unconfigured',
      status: 'planned',
      actor,
      reason: input.reason,
      inputPayload: input,
      normalizedInput: normalizedPlan
    });

    if (!task) {
      throw new AppError('Failed to persist video generation plan', 'REMOTE_TEMPORARY_FAILURE', 500);
    }

    await this.auditRepository.create({
      operationType: 'asset.video.plan',
      actor,
      targetType: 'asset-generation-task',
      targetId: task.id,
      status: 'success',
      reason: input.reason,
      afterState: normalizedPlan,
      metadata: {
        provider: 'unconfigured',
        recommendation: 'Attach a concrete video provider implementation before switching this plan to live generation.',
        nextSteps: [
          'Choose provider abstraction and auth model',
          'Define submit/status/callback contract',
          'Wire thumbnails/previews into asset registry'
        ]
      }
    });

    return {
      ok: true,
      mode: 'planned',
      provider: 'unconfigured',
      task,
      normalizedPlan,
      providerStrategy: {
        status: 'planned-only',
        recommendation: 'Video provider not wired yet; this plan is stored so the phase can proceed without blocking image delivery.'
      }
    };
  }

  async createRunwayVideoTask(input: CreateRunwayVideoGenerationRequest) {
    ensureReason(input.reason);

    if (!input.prompt || input.prompt.trim().length < 5) {
      throw new AppError('Video prompt must be at least 5 characters', 'VALIDATION_ERROR', 400);
    }

    const actor = input.actor ?? 'internal-api';
    const resolvedAsset = await this.resolveImageUrlFromAsset(input.imageAssetId);
    const imageUrl = input.imageUrl?.trim() || resolvedAsset?.imageUrl;
    const callbackUrl = input.callbackUrl ?? env.KIE_CALLBACK_URL ?? null;
    const duration = input.durationSeconds ?? 5;
    const quality = input.quality ?? '720p';
    const aspectRatio = input.aspectRatio ?? '9:16';

    if (!callbackUrl && !(input.dryRun ?? false)) {
      throw new AppError('callbackUrl or KIE_CALLBACK_URL is required for live Runway video generation', 'VALIDATION_ERROR', 400);
    }

    if (duration === 10 && quality === '1080p') {
      throw new AppError('1080p quality is not allowed for 10-second Runway video generation', 'VALIDATION_ERROR', 400);
    }

    if (!imageUrl && !input.aspectRatio) {
      throw new AppError('aspectRatio is required for text-to-video generation when no imageUrl/imageAssetId is supplied', 'VALIDATION_ERROR', 400);
    }

    const normalizedPayload = {
      prompt: input.prompt.trim(),
      duration,
      quality,
      ...(imageUrl ? { imageUrl } : {}),
      ...(!imageUrl ? { aspectRatio } : {}),
      ...(input.watermark !== undefined ? { waterMark: input.watermark } : {}),
      ...(callbackUrl ? { callBackUrl: callbackUrl } : {})
    } satisfies Record<string, unknown>;

    if (input.dryRun ?? false) {
      await this.auditRepository.create({
        operationType: 'asset.video.generate-preview',
        actor,
        targetType: 'asset-generation-task',
        targetId: 'draft:video',
        status: 'pending',
        reason: input.reason,
        afterState: normalizedPayload,
        metadata: {
          provider: 'kie-runway',
          imageAsset: resolvedAsset,
          callbackUrl,
          enqueuePolling: input.enqueuePolling ?? true,
          templateVersion: input.templateVersion ?? null
        }
      });

      return {
        ok: true,
        mode: 'dry-run',
        provider: 'kie-runway',
        normalizedPayload,
        imageAsset: resolvedAsset,
        callbackUrl,
        enqueuePolling: input.enqueuePolling ?? true,
        templateVersion: input.templateVersion ?? null
      };
    }

    const response = await this.kieClient.createRunwayVideoTask(normalizedPayload);
    const providerTaskId = response.data.data?.taskId;

    if (!providerTaskId) {
      throw new AppError('KIE Runway video task creation did not return taskId', 'REMOTE_TEMPORARY_FAILURE', 502, {
        providerResponse: response.data
      });
    }

    const task = await this.taskRepository.create({
      assetType: 'video',
      taskType: 'video-generate',
      provider: 'kie-runway',
      providerTaskId,
      status: 'submitted',
      actor,
      reason: input.reason,
      callbackUrl,
      inputPayload: input,
      normalizedInput: {
        payload: normalizedPayload,
        templateVersion: input.templateVersion ?? null,
        enqueuePolling: input.enqueuePolling ?? true,
        imageAsset: resolvedAsset
      },
      providerResponse: response.data,
      startedAt: new Date(),
      expiresAt: addDays(new Date(), 14)
    });

    if (!task) {
      throw new AppError('Failed to persist KIE Runway video task', 'REMOTE_TEMPORARY_FAILURE', 500);
    }

    const queueSuggestion = (input.enqueuePolling ?? true)
      ? {
          taskId: task.id,
          providerTaskId,
          requestedBy: actor,
          requestedAt: new Date().toISOString()
        }
      : null;

    await this.auditRepository.create({
      operationType: 'asset.video.generate',
      actor,
      targetType: 'asset-generation-task',
      targetId: task.id,
      status: 'success',
      reason: input.reason,
      afterState: {
        providerTaskId,
        payload: normalizedPayload
      },
      metadata: {
        provider: 'kie-runway',
        requestId: response.requestId,
        statusCode: response.status,
        callbackUrl,
        enqueuePolling: input.enqueuePolling ?? true,
        queueSuggestion,
        imageAsset: resolvedAsset
      }
    });

    return {
      ok: true,
      mode: 'live',
      provider: 'kie-runway',
      task,
      queueSuggestion,
      imageAsset: resolvedAsset
    };
  }

  async refreshRunwayVideoTask(input: RefreshRunwayVideoTaskRequest) {
    const actor = input.actor ?? 'internal-api';
    const existingTask = await this.taskRepository.findById(input.taskId);

    if (!existingTask) {
      throw new AppError('Asset generation task not found', 'RESOURCE_NOT_FOUND', 404);
    }

    const providerTaskId = existingTask.providerTaskId;
    if (existingTask.provider !== 'kie-runway' || !providerTaskId) {
      throw new AppError('Task is not a KIE Runway video task', 'VALIDATION_ERROR', 400);
    }

    const response = await this.kieClient.getRunwayVideoTask(providerTaskId);
    const detail = response.data.data;
    const status = normalizeRunwayTaskStatus(detail);
    const videoUrl = detail?.videoInfo?.videoUrl ?? null;
    const thumbnailUrl = detail?.videoInfo?.imageUrl ?? null;
    const expiresAt = videoUrl ? addDays(new Date(), 14) : null;

    const task = await this.taskRepository.updateById(existingTask.id, {
      status,
      providerResponse: response.data,
      outputPayload: {
        state: detail?.state ?? null,
        videoUrl,
        thumbnailUrl,
        videoId: detail?.videoInfo?.videoId ?? null,
        expireFlag: detail?.expireFlag ?? null,
        generateTime: detail?.generateTime ?? null
      },
      errorCode: detail?.failCode != null ? String(detail.failCode) : null,
      errorMessage: detail?.failMsg ?? null,
      finishedAt: status === 'succeeded' || status === 'failed' ? new Date() : undefined,
      expiresAt: expiresAt ?? undefined
    });

    if (!task) {
      throw new AppError('Failed to update KIE Runway video task', 'REMOTE_TEMPORARY_FAILURE', 500);
    }

    const assets = [];
    const normalizedInput = (task.normalizedInput ?? {}) as Record<string, unknown>;

    if (status === 'succeeded' && videoUrl) {
      const asset = await this.assetRepository.upsert({
        assetType: 'video',
        provider: 'kie-runway',
        status: 'ready',
        sourceTaskId: task.id,
        providerAssetId: detail?.videoInfo?.videoId ?? providerTaskId,
        title: typeof normalizedInput.payload === 'object' && normalizedInput.payload && typeof (normalizedInput.payload as Record<string, unknown>).prompt === 'string'
          ? String((normalizedInput.payload as Record<string, unknown>).prompt)
          : task.taskType,
        mimeType: inferVideoMimeType(videoUrl),
        originalUrl: videoUrl,
        thumbnailUrl,
        durationSeconds: typeof (normalizedInput.payload as Record<string, unknown>)?.duration === 'number'
          ? Number((normalizedInput.payload as Record<string, unknown>).duration)
          : null,
        promptVersion: typeof normalizedInput.templateVersion === 'string' ? normalizedInput.templateVersion : null,
        metadata: {
          providerTaskId,
          state: detail?.state ?? null,
          imageAsset: normalizedInput.imageAsset ?? null,
          generateTime: detail?.generateTime ?? null,
          expireFlag: detail?.expireFlag ?? null
        },
        expiresAt
      });

      if (!asset) {
        throw new AppError('Failed to persist video asset after successful Runway poll', 'REMOTE_TEMPORARY_FAILURE', 500, {
          taskId: task.id,
          providerTaskId,
          videoUrl
        });
      }

      assets.push(asset);
    }

    await this.auditRepository.create({
      operationType: 'asset.video.poll',
      actor,
      targetType: 'asset-generation-task',
      targetId: task.id,
      status: status === 'failed' ? 'failed' : 'success',
      ...(task.reason ? { reason: task.reason } : {}),
      afterState: {
        status,
        videoUrl,
        thumbnailUrl,
        assetCount: assets.length
      },
      metadata: {
        provider: 'kie-runway',
        requestId: response.requestId,
        statusCode: response.status,
        providerTaskId,
        state: detail?.state ?? null
      }
    });

    return {
      ok: true,
      provider: 'kie-runway',
      task,
      assets,
      remote: {
        state: detail?.state ?? null,
        videoUrl,
        thumbnailUrl,
        videoId: detail?.videoInfo?.videoId ?? null,
        failCode: detail?.failCode ?? null,
        failMsg: detail?.failMsg ?? null
      }
    };
  }

  async ingestRunwayCallback(payload: unknown, actor = 'kie-runway-callback') {
    const body = payload as {
      taskId?: string;
      data?: RunwayVideoTaskDetail;
      state?: string;
      videoInfo?: {
        videoId?: string;
        taskId?: string;
        videoUrl?: string;
        imageUrl?: string;
      } | null;
      failCode?: number | null;
      failMsg?: string | null;
      expireFlag?: number | null;
      generateTime?: string | null;
    };

    const providerTaskId = body.taskId ?? body.data?.taskId;
    if (!providerTaskId) {
      throw new AppError('Runway callback taskId is required', 'VALIDATION_ERROR', 400);
    }

    const task = await this.taskRepository.findByProviderTaskId('kie-runway', providerTaskId);
    if (!task) {
      await this.auditRepository.create({
        operationType: 'asset.video.callback',
        actor,
        targetType: 'asset-generation-task',
        targetId: providerTaskId,
        status: 'failed',
        reason: 'KIE Runway callback arrived for unknown task',
        metadata: {
          provider: 'kie-runway',
          payload
        }
      });

      return {
        ok: false,
        provider: 'kie-runway',
        providerTaskId,
        status: 'ignored',
        reason: 'unknown-task'
      };
    }

    const detail: RunwayVideoTaskDetail = body.data ?? {
      taskId: providerTaskId,
      ...(body.state ? { state: body.state } : {}),
      ...(body.videoInfo ? { videoInfo: body.videoInfo } : {}),
      ...(body.failCode !== undefined && body.failCode !== null ? { failCode: body.failCode } : {}),
      ...(body.failMsg ? { failMsg: body.failMsg } : {}),
      ...(body.expireFlag !== undefined && body.expireFlag !== null ? { expireFlag: body.expireFlag } : {}),
      ...(body.generateTime ? { generateTime: body.generateTime } : {})
    };

    const status = normalizeRunwayTaskStatus(detail);
    const videoUrl = detail.videoInfo?.videoUrl ?? null;
    const thumbnailUrl = detail.videoInfo?.imageUrl ?? null;
    const expiresAt = videoUrl ? addDays(new Date(), 14) : null;

    const updatedTask = await this.taskRepository.updateById(task.id, {
      status,
      providerResponse: payload,
      outputPayload: {
        state: detail.state ?? null,
        videoUrl,
        thumbnailUrl,
        videoId: detail.videoInfo?.videoId ?? null,
        callback: true
      },
      errorCode: detail.failCode != null ? String(detail.failCode) : null,
      errorMessage: detail.failMsg ?? null,
      finishedAt: status === 'succeeded' || status === 'failed' ? new Date() : undefined,
      expiresAt: expiresAt ?? undefined
    });

    if (!updatedTask) {
      throw new AppError('Failed to update KIE Runway task from callback', 'REMOTE_TEMPORARY_FAILURE', 500);
    }

    const assets = [];
    const normalizedInput = (updatedTask.normalizedInput ?? {}) as Record<string, unknown>;

    if (status === 'succeeded' && videoUrl) {
      const asset = await this.assetRepository.upsert({
        assetType: 'video',
        provider: 'kie-runway',
        status: 'ready',
        sourceTaskId: updatedTask.id,
        providerAssetId: detail.videoInfo?.videoId ?? providerTaskId,
        title: typeof normalizedInput.payload === 'object' && normalizedInput.payload && typeof (normalizedInput.payload as Record<string, unknown>).prompt === 'string'
          ? String((normalizedInput.payload as Record<string, unknown>).prompt)
          : updatedTask.taskType,
        mimeType: inferVideoMimeType(videoUrl),
        originalUrl: videoUrl,
        thumbnailUrl,
        durationSeconds: typeof (normalizedInput.payload as Record<string, unknown>)?.duration === 'number'
          ? Number((normalizedInput.payload as Record<string, unknown>).duration)
          : null,
        promptVersion: typeof normalizedInput.templateVersion === 'string' ? normalizedInput.templateVersion : null,
        metadata: {
          providerTaskId,
          state: detail.state ?? null,
          imageAsset: normalizedInput.imageAsset ?? null,
          generateTime: detail.generateTime ?? null,
          expireFlag: detail.expireFlag ?? null,
          callback: true
        },
        expiresAt
      });

      if (!asset) {
        throw new AppError('Failed to persist video asset after successful Runway callback', 'REMOTE_TEMPORARY_FAILURE', 500, {
          taskId: updatedTask.id,
          providerTaskId,
          videoUrl
        });
      }

      assets.push(asset);
    }

    await this.auditRepository.create({
      operationType: 'asset.video.callback',
      actor,
      targetType: 'asset-generation-task',
      targetId: updatedTask.id,
      status: status === 'failed' ? 'failed' : 'success',
      ...(updatedTask.reason ? { reason: updatedTask.reason } : {}),
      afterState: {
        status,
        videoUrl,
        thumbnailUrl,
        assetCount: assets.length
      },
      metadata: {
        provider: 'kie-runway',
        providerTaskId,
        state: detail.state ?? null,
        callback: true
      }
    });

    return {
      ok: true,
      provider: 'kie-runway',
      task: updatedTask,
      assets,
      remote: {
        state: detail.state ?? null,
        videoUrl,
        thumbnailUrl,
        videoId: detail.videoInfo?.videoId ?? null,
        failCode: detail.failCode ?? null,
        failMsg: detail.failMsg ?? null
      }
    };
  }
}
