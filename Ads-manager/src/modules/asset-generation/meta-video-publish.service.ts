import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { AssetLibraryRepository } from './asset.repository.js';
import { getMetaVideoBindingForAccount, mergeMetaVideoBinding, type StoredMetaVideoBinding } from './meta-video-binding.js';
import { MetaClient } from '../providers/meta/meta.client.js';

interface PublishVideoAssetToMetaInput {
  assetId: string;
  title?: string | undefined;
  actor?: string | undefined;
  reason: string;
  dryRun?: boolean | undefined;
  reuseExisting?: boolean | undefined;
  waitForReady?: boolean | undefined;
  timeoutSeconds?: number | undefined;
}

export class MetaVideoPublishService {
  private readonly assetRepository = new AssetLibraryRepository();
  private readonly auditRepository = new AuditRepository();
  private readonly metaClient = new MetaClient();

  private assertConfiguredAccountId() {
    if (!env.META_AD_ACCOUNT_ID) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    return env.META_AD_ACCOUNT_ID;
  }

  private async resolveVideoAsset(assetId: string) {
    const asset = await this.assetRepository.findById(assetId);

    if (!asset) {
      throw new AppError('Video asset not found', 'RESOURCE_NOT_FOUND', 404, {
        assetId
      });
    }

    if (asset.assetType !== 'video' || !asset.originalUrl) {
      throw new AppError('Meta publish requires a video asset with originalUrl', 'VALIDATION_ERROR', 400, {
        assetId: asset.id,
        assetType: asset.assetType,
        originalUrl: asset.originalUrl
      });
    }

    return asset;
  }

  private async downloadToTempFile(sourceUrl: string) {
    const response = await fetch(sourceUrl);

    if (!response.ok || !response.body) {
      throw new AppError('Failed to download source video asset for Meta publish', 'REMOTE_TEMPORARY_FAILURE', 502, {
        sourceUrl,
        status: response.status
      });
    }

    const extension = extname(new URL(sourceUrl).pathname) || '.mp4';
    const filePath = `${tmpdir()}/meta-video-upload-${randomUUID()}${extension}`;
    const fileWriteStream = createWriteStream(filePath);
    const bodyStream = Readable.fromWeb(response.body as any);

    await pipeline(bodyStream, fileWriteStream);

    return {
      filePath,
      contentType: response.headers.get('content-type')
    };
  }

  private buildStoredBinding(input: {
    accountId: string;
    metaVideoId: string;
    uploadSessionId: string | null;
    title: string | null;
    status: string | null;
    thumbnailUrl: string | null;
    sourceUrl: string | null;
    durationSeconds: number | null;
  }): StoredMetaVideoBinding {
    const timestamp = new Date().toISOString();

    return {
      accountId: input.accountId,
      metaVideoId: input.metaVideoId,
      status: input.status,
      title: input.title,
      thumbnailUrl: input.thumbnailUrl,
      sourceUrl: input.sourceUrl,
      durationSeconds: input.durationSeconds,
      uploadedAt: timestamp,
      lastSyncedAt: timestamp,
      uploadSessionId: input.uploadSessionId,
      publishSource: 'meta-advideos'
    };
  }

  async publishVideoAssetToMeta(input: PublishVideoAssetToMetaInput) {
    const accountId = this.assertConfiguredAccountId();
    const asset = await this.resolveVideoAsset(input.assetId);
    const sourceUrl = asset.originalUrl;
    if (!sourceUrl) {
      throw new AppError('Meta publish requires a video asset with originalUrl', 'VALIDATION_ERROR', 400, {
        assetId: asset.id
      });
    }

    const actor = input.actor ?? 'internal-api';
    const reuseExisting = input.reuseExisting ?? true;
    const waitForReady = input.waitForReady ?? true;
    const timeoutSeconds = input.timeoutSeconds ?? 180;
    const existingBinding = getMetaVideoBindingForAccount(asset.metadata, accountId);

    if (input.dryRun) {
      await this.auditRepository.create({
        operationType: 'asset.video.publish-meta.preview',
        actor,
        targetType: 'asset-library',
        targetId: asset.id,
        status: 'pending',
        reason: input.reason,
        metadata: {
          accountId,
          reuseExisting,
          waitForReady,
          timeoutSeconds,
          existingBinding,
          sourceUrl
        }
      });

      return {
        ok: true,
        mode: 'dry-run',
        assetId: asset.id,
        accountId,
        sourceUrl,
        existingBinding,
        willReuseExisting: Boolean(reuseExisting && existingBinding?.metaVideoId),
        waitForReady,
        timeoutSeconds
      };
    }

    if (reuseExisting && existingBinding?.metaVideoId) {
      const video = waitForReady
        ? await this.metaClient.waitForVideoReady(existingBinding.metaVideoId, 3_000, timeoutSeconds * 1000)
        : await this.metaClient.getVideo(existingBinding.metaVideoId);

      const refreshedBinding = this.buildStoredBinding({
        accountId,
        metaVideoId: existingBinding.metaVideoId,
        uploadSessionId: existingBinding.uploadSessionId,
        title: video.data.title ?? existingBinding.title,
        status: video.data.status?.video_status ?? existingBinding.status,
        thumbnailUrl: video.data.picture ?? existingBinding.thumbnailUrl,
        sourceUrl: video.data.source ?? existingBinding.sourceUrl,
        durationSeconds: video.data.length ?? existingBinding.durationSeconds
      });

      await this.assetRepository.updateById(asset.id, {
        metadata: mergeMetaVideoBinding(asset.metadata, refreshedBinding),
        ...(asset.thumbnailUrl ? {} : { thumbnailUrl: refreshedBinding.thumbnailUrl }),
        ...(asset.durationSeconds ? {} : { durationSeconds: refreshedBinding.durationSeconds })
      });

      await this.auditRepository.create({
        operationType: 'asset.video.publish-meta',
        actor,
        targetType: 'asset-library',
        targetId: asset.id,
        status: 'success',
        reason: input.reason,
        metadata: {
          accountId,
          reusedExisting: true,
          metaVideoId: refreshedBinding.metaVideoId,
          metaVideoStatus: refreshedBinding.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        assetId: asset.id,
        accountId,
        reusedExisting: true,
        metaVideoId: refreshedBinding.metaVideoId,
        metaVideoStatus: refreshedBinding.status,
        binding: refreshedBinding,
        asset
      };
    }

    let tempFilePath: string | null = null;

    try {
      const downloaded = await this.downloadToTempFile(sourceUrl);
      tempFilePath = downloaded.filePath;
      const title = input.title?.trim() || asset.title || `asset-${asset.id}`;
      const upload = await this.metaClient.uploadAdVideoFromFile({
        filePath: downloaded.filePath,
        title,
        waitForReady,
        timeoutMs: timeoutSeconds * 1000
      }, accountId);
      const video = upload.data.video;
      const metaVideoId = upload.data.video_id;

      if (!metaVideoId) {
        throw new AppError('Meta video upload succeeded without returning a video id', 'REMOTE_TEMPORARY_FAILURE', 502, {
          upload: upload.data
        });
      }

      const binding = this.buildStoredBinding({
        accountId,
        metaVideoId,
        uploadSessionId: upload.data.upload_session_id ?? null,
        title: video.title ?? title,
        status: video.status?.video_status ?? null,
        thumbnailUrl: video.picture ?? asset.thumbnailUrl,
        sourceUrl: video.source ?? null,
        durationSeconds: video.length ?? asset.durationSeconds
      });

      await this.assetRepository.updateById(asset.id, {
        metadata: mergeMetaVideoBinding(asset.metadata, binding),
        ...(asset.thumbnailUrl ? {} : { thumbnailUrl: binding.thumbnailUrl }),
        ...(asset.durationSeconds ? {} : { durationSeconds: binding.durationSeconds })
      });

      await this.auditRepository.create({
        operationType: 'asset.video.publish-meta',
        actor,
        targetType: 'asset-library',
        targetId: asset.id,
        status: 'success',
        reason: input.reason,
        metadata: {
          accountId,
          reusedExisting: false,
          metaVideoId,
          metaVideoStatus: binding.status,
          uploadSessionId: binding.uploadSessionId,
          sourceAssetUrl: sourceUrl
        }
      });

      return {
        ok: true,
        mode: 'live',
        assetId: asset.id,
        accountId,
        reusedExisting: false,
        metaVideoId,
        metaVideoStatus: binding.status,
        binding,
        asset
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta video publish failed');

      await this.auditRepository.create({
        operationType: 'asset.video.publish-meta',
        actor,
        targetType: 'asset-library',
        targetId: asset.id,
        status: 'failed',
        reason: input.reason,
        metadata: {
          accountId,
          reusedExisting: false,
          normalizedErrorCode: appError.code,
          details: appError.details ?? null,
          sourceAssetUrl: sourceUrl
        }
      });

      throw appError;
    } finally {
      if (tempFilePath) {
        await rm(tempFilePath, { force: true }).catch(() => undefined);
      }
    }
  }
}
