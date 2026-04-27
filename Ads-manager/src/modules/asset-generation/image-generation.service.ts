import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { AssetLibraryRepository } from './asset.repository.js';
import { AssetGenerationTaskRepository } from './task.repository.js';
import { KieClient } from '../providers/kie/kie.client.js';
import { fetchImageAssetMetadata } from './image-asset-metadata.js';

interface KieTaskDetailLike {
  taskId: string;
  status?: string | undefined;
  successFlag?: number | undefined;
  progress?: string | undefined;
  errorCode?: number | null | undefined;
  errorMessage?: string | null | undefined;
  response?: {
    resultUrls?: string[];
    result_urls?: string[];
  } | null | undefined;
}

interface CreateImageGenerationRequest {
  providerPayload: Record<string, unknown>;
  templateVersion?: string | undefined;
  callbackUrl?: string | undefined;
  enqueuePolling?: boolean | undefined;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  reason: string;
}

interface RefreshImageTaskRequest {
  taskId: string;
  actor?: string | undefined;
}

interface RefreshAssetMetadataRequest {
  assetId: string;
  actor?: string | undefined;
}

function ensureReason(reason: string) {
  if (!reason || reason.trim().length < 5) {
    throw new AppError('Reason is required and must be at least 5 characters', 'VALIDATION_ERROR', 400);
  }
}

function normalizeKieImagePayload(input: CreateImageGenerationRequest) {
  const payload = { ...input.providerPayload } as Record<string, unknown>;
  const callbackUrl = input.callbackUrl ?? env.KIE_CALLBACK_URL ?? null;

  if (callbackUrl && payload.callBackUrl === undefined && payload.callbackUrl === undefined) {
    payload.callBackUrl = callbackUrl;
  }

  return {
    payload,
    callbackUrl,
    enqueuePolling: input.enqueuePolling ?? true,
    templateVersion: input.templateVersion ?? null
  };
}

function normalizeRemoteImageTaskStatus(detail: KieTaskDetailLike | undefined) {
  const status = detail?.status?.toLowerCase() ?? '';

  if (detail?.successFlag === 1 || ['success', 'succeeded', 'completed', 'done'].includes(status)) {
    return 'succeeded' as const;
  }

  if (detail?.successFlag === 2 || detail?.errorCode || ['failed', 'error', 'cancelled'].includes(status)) {
    return 'failed' as const;
  }

  if (['queued', 'submitted', 'waiting', 'pending'].includes(status)) {
    return 'submitted' as const;
  }

  return 'processing' as const;
}

function extractResultUrls(detail: KieTaskDetailLike | undefined) {
  const raw = detail?.response?.resultUrls ?? detail?.response?.result_urls ?? [];
  return Array.from(new Set(raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export class ImageGenerationService {
  private readonly auditRepository = new AuditRepository();
  private readonly taskRepository = new AssetGenerationTaskRepository();
  private readonly assetRepository = new AssetLibraryRepository();
  private readonly kieClient = new KieClient();

  private async enrichImageAsset(input: {
    assetId: string;
    actor: string;
    sourceTaskId?: string | null;
    providerTaskId?: string | null;
    remoteStatus?: string | null;
    remoteProgress?: string | null;
    sourceIndex?: number | null;
    callback?: boolean | undefined;
  }) {
    const existingAsset = await this.assetRepository.findById(input.assetId);

    if (!existingAsset) {
      throw new AppError('Asset not found for metadata enrichment', 'RESOURCE_NOT_FOUND', 404, {
        assetId: input.assetId
      });
    }

    if (existingAsset.assetType !== 'image' || !existingAsset.originalUrl) {
      throw new AppError('Only image assets with originalUrl can be enriched', 'VALIDATION_ERROR', 400, {
        assetId: existingAsset.id,
        assetType: existingAsset.assetType,
        originalUrl: existingAsset.originalUrl
      });
    }

    const metadata = await fetchImageAssetMetadata(existingAsset.originalUrl);
    const currentMetadata = (existingAsset.metadata ?? {}) as Record<string, unknown>;

    const updatedAsset = await this.assetRepository.updateById(existingAsset.id, {
      mimeType: metadata.mimeType,
      width: metadata.width,
      height: metadata.height,
      thumbnailUrl: metadata.thumbnailUrl,
      metadata: {
        ...currentMetadata,
        byteSize: metadata.byteSize,
        filename: metadata.filename,
        sourceUrl: metadata.sourceUrl,
        providerTaskId: input.providerTaskId ?? currentMetadata.providerTaskId ?? null,
        remoteStatus: input.remoteStatus ?? currentMetadata.remoteStatus ?? null,
        remoteProgress: input.remoteProgress ?? currentMetadata.remoteProgress ?? null,
        sourceIndex: input.sourceIndex ?? currentMetadata.sourceIndex ?? null,
        enrichedAt: new Date().toISOString(),
        ...(input.callback ? { callback: true } : {})
      }
    });

    if (!updatedAsset) {
      throw new AppError('Failed to update enriched image asset metadata', 'REMOTE_TEMPORARY_FAILURE', 500, {
        assetId: existingAsset.id
      });
    }

    await this.auditRepository.create({
      operationType: 'asset.image.enrich-metadata',
      actor: input.actor,
      targetType: 'asset-library',
      targetId: updatedAsset.id,
      status: 'success',
      ...(existingAsset.sourceTaskId ? { reason: `Metadata enrichment for image asset from task ${existingAsset.sourceTaskId}` } : {}),
      afterState: {
        mimeType: updatedAsset.mimeType,
        width: updatedAsset.width,
        height: updatedAsset.height,
        thumbnailUrl: updatedAsset.thumbnailUrl,
        byteSize: metadata.byteSize,
        filename: metadata.filename
      },
      metadata: {
        sourceTaskId: input.sourceTaskId ?? existingAsset.sourceTaskId ?? null,
        providerTaskId: input.providerTaskId ?? null,
        remoteStatus: input.remoteStatus ?? null,
        remoteProgress: input.remoteProgress ?? null,
        sourceIndex: input.sourceIndex ?? null,
        callback: input.callback ?? false
      }
    });

    return updatedAsset;
  }

  async createImageGenerationTask(input: CreateImageGenerationRequest) {
    ensureReason(input.reason);

    if (!input.providerPayload || typeof input.providerPayload !== 'object' || Array.isArray(input.providerPayload)) {
      throw new AppError('providerPayload must be an object', 'VALIDATION_ERROR', 400);
    }

    const actor = input.actor ?? 'internal-api';
    const normalized = normalizeKieImagePayload(input);

    if (input.dryRun ?? false) {
      await this.auditRepository.create({
        operationType: 'asset.image.generate-preview',
        actor,
        targetType: 'asset-generation-task',
        targetId: 'draft:image',
        status: 'pending',
        reason: input.reason,
        afterState: normalized.payload,
        metadata: {
          callbackUrl: normalized.callbackUrl,
          enqueuePolling: normalized.enqueuePolling,
          templateVersion: normalized.templateVersion,
          provider: 'kie'
        }
      });

      return {
        ok: true,
        mode: 'dry-run',
        provider: 'kie',
        normalizedPayload: normalized.payload,
        callbackUrl: normalized.callbackUrl,
        enqueuePolling: normalized.enqueuePolling,
        templateVersion: normalized.templateVersion
      };
    }

    const response = await this.kieClient.createImageTask(normalized.payload);
    const providerTaskId = response.data.data?.taskId;

    if (!providerTaskId) {
      throw new AppError('KIE image task creation did not return taskId', 'REMOTE_TEMPORARY_FAILURE', 502, {
        providerResponse: response.data
      });
    }

    const task = await this.taskRepository.create({
      assetType: 'image',
      taskType: 'image-generate',
      provider: 'kie',
      providerTaskId,
      status: 'submitted',
      actor,
      reason: input.reason,
      callbackUrl: normalized.callbackUrl,
      inputPayload: input.providerPayload,
      normalizedInput: {
        payload: normalized.payload,
        templateVersion: normalized.templateVersion,
        enqueuePolling: normalized.enqueuePolling
      },
      providerResponse: response.data,
      startedAt: new Date(),
      expiresAt: addDays(new Date(), 14)
    });

    if (!task) {
      throw new AppError('Failed to persist KIE image generation task', 'REMOTE_TEMPORARY_FAILURE', 500);
    }

    const queueSuggestion = normalized.enqueuePolling
      ? {
          taskId: task.id,
          providerTaskId,
          requestedBy: actor,
          requestedAt: new Date().toISOString()
        }
      : null;

    await this.auditRepository.create({
      operationType: 'asset.image.generate',
      actor,
      targetType: 'asset-generation-task',
      targetId: task.id,
      status: 'success',
      reason: input.reason,
      afterState: {
        providerTaskId,
        payload: normalized.payload
      },
      metadata: {
        provider: 'kie',
        requestId: response.requestId,
        statusCode: response.status,
        callbackUrl: normalized.callbackUrl,
        enqueuePolling: normalized.enqueuePolling,
        queueSuggestion
      }
    });

    return {
      ok: true,
      mode: 'live',
      provider: 'kie',
      task,
      queueSuggestion
    };
  }

  async refreshKieImageTask(input: RefreshImageTaskRequest) {
    const actor = input.actor ?? 'internal-api';
    const existingTask = await this.taskRepository.findById(input.taskId);

    if (!existingTask) {
      throw new AppError('Asset generation task not found', 'RESOURCE_NOT_FOUND', 404);
    }

    const providerTaskId = existingTask.providerTaskId;

    if (existingTask.provider !== 'kie' || !providerTaskId) {
      throw new AppError('Task is not a KIE image task', 'VALIDATION_ERROR', 400);
    }

    const response = await this.kieClient.getTask(providerTaskId);
    const detail = response.data.data;
    const status = normalizeRemoteImageTaskStatus(detail);
    const resultUrls = extractResultUrls(detail);
    const expiresAt = resultUrls.length > 0 ? addDays(new Date(), 14) : null;

    const task = await this.taskRepository.updateById(existingTask.id, {
      status,
      providerResponse: response.data,
      outputPayload: {
        resultUrls,
        remoteStatus: detail?.status ?? null,
        successFlag: detail?.successFlag ?? null,
        progress: detail?.progress ?? null
      },
      errorCode: detail?.errorCode != null ? String(detail.errorCode) : null,
      errorMessage: detail?.errorMessage ?? null,
      finishedAt: status === 'succeeded' || status === 'failed' ? new Date() : undefined,
      expiresAt: expiresAt ?? undefined
    });

    if (!task) {
      throw new AppError('Failed to update asset generation task', 'REMOTE_TEMPORARY_FAILURE', 500);
    }

    const assets = [];
    const normalizedInput = (task.normalizedInput ?? {}) as {
      payload?: Record<string, unknown>;
      templateVersion?: string | null;
    };

    if (status === 'succeeded') {
      for (const [index, url] of resultUrls.entries()) {
        const asset = await this.assetRepository.upsert({
          assetType: 'image',
          provider: 'kie',
          status: 'ready',
          sourceTaskId: task.id,
          providerAssetId: `${providerTaskId}:${index + 1}`,
          title: typeof normalizedInput.payload?.prompt === 'string' ? normalizedInput.payload.prompt : task.taskType,
          originalUrl: url,
          promptVersion: normalizedInput.templateVersion ?? null,
          metadata: {
            providerTaskId,
            remoteStatus: detail?.status ?? null,
            remoteProgress: detail?.progress ?? null,
            sourceIndex: index
          },
          expiresAt
        });

        if (!asset) {
          throw new AppError('Failed to persist image asset after successful KIE poll', 'REMOTE_TEMPORARY_FAILURE', 500, {
            taskId: task.id,
            providerTaskId,
            sourceIndex: index,
            url
          });
        }

        const enrichedAsset = await this.enrichImageAsset({
          assetId: asset.id,
          actor,
          sourceTaskId: task.id,
          providerTaskId,
          remoteStatus: detail?.status ?? null,
          remoteProgress: detail?.progress ?? null,
          sourceIndex: index
        });

        assets.push(enrichedAsset);
      }
    }

    await this.auditRepository.create({
      operationType: 'asset.image.poll',
      actor,
      targetType: 'asset-generation-task',
      targetId: task.id,
      status: status === 'failed' ? 'failed' : 'success',
      ...(task.reason ? { reason: task.reason } : {}),
      afterState: {
        status,
        resultUrls,
        assetCount: assets.length
      },
      metadata: {
        provider: 'kie',
        requestId: response.requestId,
        statusCode: response.status,
        providerTaskId,
        remoteStatus: detail?.status ?? null
      }
    });

    return {
      ok: true,
      provider: 'kie',
      task,
      assets,
      remote: {
        status: detail?.status ?? null,
        successFlag: detail?.successFlag ?? null,
        progress: detail?.progress ?? null,
        resultUrls
      }
    };
  }

  async ingestKieCallback(payload: unknown, actor = 'kie-callback') {
    const body = payload as {
      taskId?: string;
      data?: {
        taskId?: string;
        status?: string;
        successFlag?: number;
        progress?: string;
        errorCode?: number | null;
        errorMessage?: string | null;
        response?: {
          resultUrls?: string[];
          result_urls?: string[];
        } | null;
      };
      status?: string;
      successFlag?: number;
      progress?: string;
      errorCode?: number | null;
      errorMessage?: string | null;
      response?: {
        resultUrls?: string[];
        result_urls?: string[];
      } | null;
    };

    const providerTaskId = body.taskId ?? body.data?.taskId;

    if (!providerTaskId) {
      throw new AppError('KIE callback taskId is required', 'VALIDATION_ERROR', 400);
    }

    const existingTask = await this.taskRepository.findByProviderTaskId('kie', providerTaskId);

    if (!existingTask) {
      await this.auditRepository.create({
        operationType: 'asset.image.callback',
        actor,
        targetType: 'asset-generation-task',
        targetId: providerTaskId,
        status: 'failed',
        reason: 'KIE callback arrived for unknown task',
        metadata: {
          provider: 'kie',
          payload
        }
      });

      return {
        ok: false,
        provider: 'kie',
        providerTaskId,
        status: 'ignored',
        reason: 'unknown-task'
      };
    }

    const normalizedDetail: KieTaskDetailLike = {
      taskId: providerTaskId,
      ...(body.data?.status ?? body.status ? { status: body.data?.status ?? body.status } : {}),
      ...(body.data?.successFlag ?? body.successFlag ? { successFlag: body.data?.successFlag ?? body.successFlag } : {}),
      ...(body.data?.progress ?? body.progress ? { progress: body.data?.progress ?? body.progress } : {}),
      errorCode: body.data?.errorCode ?? body.errorCode ?? null,
      errorMessage: body.data?.errorMessage ?? body.errorMessage ?? null,
      response: body.data?.response ?? body.response ?? null
    };

    const status = normalizeRemoteImageTaskStatus(normalizedDetail);
    const resultUrls = extractResultUrls(normalizedDetail);
    const expiresAt = resultUrls.length > 0 ? addDays(new Date(), 14) : null;

    const task = await this.taskRepository.updateById(existingTask.id, {
      status,
      providerResponse: payload,
      outputPayload: {
        resultUrls,
        remoteStatus: normalizedDetail.status ?? null,
        successFlag: normalizedDetail.successFlag ?? null,
        progress: normalizedDetail.progress ?? null,
        callback: true
      },
      errorCode: normalizedDetail.errorCode != null ? String(normalizedDetail.errorCode) : null,
      errorMessage: normalizedDetail.errorMessage ?? null,
      finishedAt: status === 'succeeded' || status === 'failed' ? new Date() : undefined,
      expiresAt: expiresAt ?? undefined
    });

    if (!task) {
      throw new AppError('Failed to update asset generation task from callback', 'REMOTE_TEMPORARY_FAILURE', 500);
    }

    const assets = [];
    const normalizedInput = (task.normalizedInput ?? {}) as {
      payload?: Record<string, unknown>;
      templateVersion?: string | null;
    };

    if (status === 'succeeded') {
      for (const [index, url] of resultUrls.entries()) {
        const asset = await this.assetRepository.upsert({
          assetType: 'image',
          provider: 'kie',
          status: 'ready',
          sourceTaskId: task.id,
          providerAssetId: `${providerTaskId}:${index + 1}`,
          title: typeof normalizedInput.payload?.prompt === 'string' ? normalizedInput.payload.prompt : task.taskType,
          originalUrl: url,
          promptVersion: normalizedInput.templateVersion ?? null,
          metadata: {
            providerTaskId,
            remoteStatus: normalizedDetail.status ?? null,
            remoteProgress: normalizedDetail.progress ?? null,
            sourceIndex: index,
            callback: true
          },
          expiresAt
        });

        if (!asset) {
          throw new AppError('Failed to persist image asset after successful KIE callback', 'REMOTE_TEMPORARY_FAILURE', 500, {
            taskId: task.id,
            providerTaskId,
            sourceIndex: index,
            url
          });
        }

        const enrichedAsset = await this.enrichImageAsset({
          assetId: asset.id,
          actor,
          sourceTaskId: task.id,
          providerTaskId,
          remoteStatus: normalizedDetail.status ?? null,
          remoteProgress: normalizedDetail.progress ?? null,
          sourceIndex: index,
          callback: true
        });

        assets.push(enrichedAsset);
      }
    }

    await this.auditRepository.create({
      operationType: 'asset.image.callback',
      actor,
      targetType: 'asset-generation-task',
      targetId: task.id,
      status: status === 'failed' ? 'failed' : 'success',
      ...(task.reason ? { reason: task.reason } : {}),
      afterState: {
        status,
        resultUrls,
        assetCount: assets.length
      },
      metadata: {
        provider: 'kie',
        providerTaskId,
        remoteStatus: normalizedDetail.status ?? null,
        callback: true
      }
    });

    return {
      ok: true,
      provider: 'kie',
      task,
      assets,
      remote: {
        status: normalizedDetail.status ?? null,
        successFlag: normalizedDetail.successFlag ?? null,
        progress: normalizedDetail.progress ?? null,
        resultUrls
      }
    };
  }

  async refreshStoredImageAssetMetadata(input: RefreshAssetMetadataRequest) {
    const actor = input.actor ?? 'internal-api';
    const asset = await this.assetRepository.findById(input.assetId);

    if (!asset) {
      throw new AppError('Asset not found', 'RESOURCE_NOT_FOUND', 404, {
        assetId: input.assetId
      });
    }

    if (asset.assetType !== 'image') {
      throw new AppError('Only image assets support metadata refresh', 'VALIDATION_ERROR', 400, {
        assetId: asset.id,
        assetType: asset.assetType
      });
    }

    const metadata = (asset.metadata ?? {}) as Record<string, unknown>;

    const refreshed = await this.enrichImageAsset({
      assetId: asset.id,
      actor,
      sourceTaskId: asset.sourceTaskId,
      providerTaskId: typeof metadata.providerTaskId === 'string' ? metadata.providerTaskId : null,
      remoteStatus: typeof metadata.remoteStatus === 'string' ? metadata.remoteStatus : null,
      remoteProgress: typeof metadata.remoteProgress === 'string' ? metadata.remoteProgress : null,
      sourceIndex: typeof metadata.sourceIndex === 'number' ? metadata.sourceIndex : null,
      callback: metadata.callback === true
    });

    return {
      ok: true,
      provider: asset.provider,
      asset: refreshed
    };
  }
}
