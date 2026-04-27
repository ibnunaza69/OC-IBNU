import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { AssetLibraryRepository } from './asset.repository.js';
import { getMetaVideoBindingForAccount } from './meta-video-binding.js';

export interface BuildImageAssetCreativeDraftInput {
  assetId: string;
  pageId: string;
  linkUrl: string;
  message: string;
  headline: string;
  description?: string | undefined;
  callToActionType?: string | undefined;
  instagramActorId?: string | undefined;
  actor?: string | undefined;
  reason?: string | undefined;
}

export interface BuildVideoAssetCreativeDraftInput {
  assetId: string;
  pageId: string;
  linkUrl: string;
  message: string;
  headline: string;
  description?: string | undefined;
  callToActionType?: string | undefined;
  metaVideoId?: string | undefined;
  instagramActorId?: string | undefined;
  actor?: string | undefined;
  reason?: string | undefined;
}

export class CreativeDraftService {
  private readonly assetRepository = new AssetLibraryRepository();
  private readonly auditRepository = new AuditRepository();

  async buildImageAssetCreativeDraft(input: BuildImageAssetCreativeDraftInput) {
    const asset = await this.assetRepository.findById(input.assetId);

    if (!asset) {
      throw new AppError('Image asset not found', 'RESOURCE_NOT_FOUND', 404, {
        assetId: input.assetId
      });
    }

    if (asset.assetType !== 'image' || !asset.originalUrl) {
      throw new AppError('Creative draft requires an image asset with originalUrl', 'VALIDATION_ERROR', 400, {
        assetId: asset.id,
        assetType: asset.assetType,
        originalUrl: asset.originalUrl
      });
    }

    const pageId = input.pageId.trim();
    const linkUrl = input.linkUrl.trim();
    const message = input.message.trim();
    const headline = input.headline.trim();
    const description = input.description?.trim();
    const callToActionType = input.callToActionType?.trim() || 'LEARN_MORE';
    const instagramActorId = input.instagramActorId?.trim();

    if (!pageId || !linkUrl || !message || !headline) {
      throw new AppError('pageId, linkUrl, message, and headline are required', 'VALIDATION_ERROR', 400);
    }

    const objectStorySpec: Record<string, unknown> = {
      page_id: pageId,
      link_data: {
        link: linkUrl,
        message,
        name: headline,
        picture: asset.originalUrl,
        call_to_action: {
          type: callToActionType,
          value: {
            link: linkUrl
          }
        },
        ...(description ? { description } : {})
      }
    };

    if (instagramActorId) {
      objectStorySpec.instagram_actor_id = instagramActorId;
    }

    const draft = {
      pageId,
      instagramActorId: instagramActorId ?? null,
      objectStorySpec,
      creativeHints: {
        creativeType: 'image-link-data',
        assetId: asset.id,
        sourceUrl: asset.originalUrl,
        thumbnailUrl: asset.thumbnailUrl ?? asset.originalUrl,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        provider: asset.provider
      }
    };

    await this.auditRepository.create({
      operationType: 'asset.image.creative-draft',
      actor: input.actor ?? 'internal-api',
      targetType: 'asset-library',
      targetId: asset.id,
      status: 'success',
      ...(input.reason ? { reason: input.reason } : {}),
      afterState: draft,
      metadata: {
        assetType: asset.assetType,
        sourceTaskId: asset.sourceTaskId,
        providerAssetId: asset.providerAssetId
      }
    });

    return {
      ok: true,
      asset,
      draft
    };
  }

  async buildVideoAssetCreativeDraft(input: BuildVideoAssetCreativeDraftInput) {
    const asset = await this.assetRepository.findById(input.assetId);

    if (!asset) {
      throw new AppError('Video asset not found', 'RESOURCE_NOT_FOUND', 404, {
        assetId: input.assetId
      });
    }

    if (asset.assetType !== 'video' || !asset.originalUrl) {
      throw new AppError('Creative draft requires a video asset with originalUrl', 'VALIDATION_ERROR', 400, {
        assetId: asset.id,
        assetType: asset.assetType,
        originalUrl: asset.originalUrl
      });
    }

    const pageId = input.pageId.trim();
    const linkUrl = input.linkUrl.trim();
    const message = input.message.trim();
    const headline = input.headline.trim();
    const description = input.description?.trim();
    const callToActionType = input.callToActionType?.trim() || 'LEARN_MORE';
    const metaVideoId = input.metaVideoId?.trim();
    const instagramActorId = input.instagramActorId?.trim();
    const storedBinding = getMetaVideoBindingForAccount(asset.metadata, env.META_AD_ACCOUNT_ID);
    const resolvedMetaVideoId = metaVideoId || storedBinding?.metaVideoId || null;
    const resolvedThumbnailUrl = storedBinding?.thumbnailUrl || asset.thumbnailUrl || null;

    if (!pageId || !linkUrl || !message || !headline) {
      throw new AppError('pageId, linkUrl, message, and headline are required', 'VALIDATION_ERROR', 400);
    }

    const providerConstraints = !resolvedMetaVideoId
      ? {
          status: 'requires-meta-video-id',
          recommendation: 'Publish the generated video asset to Meta first, or pass metaVideoId explicitly before using this video creative draft.'
        }
      : !resolvedThumbnailUrl
        ? {
            status: 'requires-video-thumbnail',
            recommendation: 'Meta video creatives need image_url or image_hash. Ensure the asset has thumbnailUrl or republish the video asset to Meta to fetch a thumbnail.'
          }
        : null;

    const objectStorySpec = providerConstraints
      ? null
      : {
          page_id: pageId,
          ...(instagramActorId ? { instagram_actor_id: instagramActorId } : {}),
          video_data: {
            video_id: resolvedMetaVideoId,
            image_url: resolvedThumbnailUrl,
            message,
            title: headline,
            call_to_action: {
              type: callToActionType,
              value: {
                link: linkUrl
              }
            }
          }
        };

    const draft = {
      pageId,
      instagramActorId: instagramActorId ?? null,
      objectStorySpec,
      creativeHints: {
        creativeType: 'video-data',
        assetId: asset.id,
        sourceUrl: asset.originalUrl,
        thumbnailUrl: resolvedThumbnailUrl,
        mimeType: asset.mimeType,
        durationSeconds: asset.durationSeconds,
        provider: asset.provider,
        metaVideoId: resolvedMetaVideoId,
        metaVideoResolvedFromAsset: Boolean(!metaVideoId && storedBinding?.metaVideoId),
        metaThumbnailUrl: resolvedThumbnailUrl
      },
      providerConstraints
    };

    await this.auditRepository.create({
      operationType: 'asset.video.creative-draft',
      actor: input.actor ?? 'internal-api',
      targetType: 'asset-library',
      targetId: asset.id,
      status: 'success',
      ...(input.reason ? { reason: input.reason } : {}),
      afterState: draft,
      metadata: {
        assetType: asset.assetType,
        sourceTaskId: asset.sourceTaskId,
        providerAssetId: asset.providerAssetId,
        hasMetaVideoId: Boolean(resolvedMetaVideoId),
        metaVideoResolvedFromAsset: Boolean(!metaVideoId && storedBinding?.metaVideoId),
        hasVideoThumbnail: Boolean(resolvedThumbnailUrl)
      }
    });

    return {
      ok: true,
      asset,
      draft
    };
  }
}
