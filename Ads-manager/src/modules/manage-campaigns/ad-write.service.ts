import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { CreativeDraftService } from '../asset-generation/creative-draft.service.js';
import { MetaAdSetSnapshotRepository } from '../meta-sync/repositories/meta-adset.repository.js';
import { MetaAdSnapshotRepository } from '../meta-sync/repositories/meta-ad.repository.js';
import { MetaApprovalService } from '../meta-write/meta-approval.service.js';
import { MetaClient } from '../providers/meta/meta.client.js';

interface AdCreateInput {
  adSetId: string;
  name: string;
  creativeId?: string | undefined;
  imageAssetId?: string | undefined;
  videoAssetId?: string | undefined;
  creativeDraft?: {
    pageId: string;
    linkUrl: string;
    message: string;
    headline: string;
    description?: string | undefined;
    callToActionType?: string | undefined;
    metaVideoId?: string | undefined;
    instagramActorId?: string | undefined;
  } | undefined;
  creativeName?: string | undefined;
  pageId?: string | undefined;
  instagramActorId?: string | undefined;
  objectStorySpec?: Record<string, unknown> | undefined;
  status?: 'ACTIVE' | 'PAUSED' | undefined;
  trackingSpecs?: Record<string, unknown>[] | undefined;
}

interface AdCreateRequest {
  draft: AdCreateInput;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  confirmHighImpact?: boolean | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

type AdSetSnapshot = NonNullable<Awaited<ReturnType<MetaAdSetSnapshotRepository['getLatestByAdSetId']>>>;

type NormalizedExistingCreativeDraft = {
  adset_id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  creativeStrategy: 'existing-creative-reference';
  creative: {
    creative_id: string;
  };
  creative_id: string;
  tracking_specs?: Record<string, unknown>[] | undefined;
};

type NormalizedInlineCreativeDraft = {
  adset_id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED';
  creativeStrategy: 'inline-object-story-spec';
  ad_creative: {
    name?: string | undefined;
    object_story_spec: Record<string, unknown>;
  };
  page_id: string;
  instagram_actor_id?: string | undefined;
  tracking_specs?: Record<string, unknown>[] | undefined;
};

type NormalizedAdDraft = NormalizedExistingCreativeDraft | NormalizedInlineCreativeDraft;

function ensureWriteEnabled(request: { dryRun?: boolean | undefined; secret?: string | undefined; reason: string }) {
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

function hasOwnString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'string' && record[key].trim().length > 0;
}

function normalizeDraft(input: AdCreateInput): NormalizedAdDraft {
  const adSetId = input.adSetId.trim();
  const name = input.name.trim();
  const creativeId = input.creativeId?.trim();
  const creativeName = input.creativeName?.trim();
  const pageId = input.pageId?.trim();
  const instagramActorId = input.instagramActorId?.trim();
  const status = input.status ?? 'PAUSED';
  const objectStorySpec = input.objectStorySpec;

  if (!adSetId) {
    throw new AppError('adSetId is required', 'VALIDATION_ERROR', 400);
  }

  if (name.length < 3) {
    throw new AppError('Ad name must be at least 3 characters', 'VALIDATION_ERROR', 400);
  }

  if (input.trackingSpecs && !Array.isArray(input.trackingSpecs)) {
    throw new AppError('trackingSpecs must be an array when provided', 'VALIDATION_ERROR', 400);
  }

  if (creativeId && objectStorySpec) {
    throw new AppError('Use either creativeId or objectStorySpec, not both', 'VALIDATION_ERROR', 400);
  }

  if (!creativeId && !objectStorySpec) {
    throw new AppError('Either creativeId or objectStorySpec is required', 'VALIDATION_ERROR', 400);
  }

  if (creativeId) {
    return {
      adset_id: adSetId,
      name,
      status,
      creativeStrategy: 'existing-creative-reference',
      creative: {
        creative_id: creativeId
      },
      creative_id: creativeId,
      ...(input.trackingSpecs ? { tracking_specs: input.trackingSpecs } : {})
    };
  }

  if (!objectStorySpec || typeof objectStorySpec !== 'object' || Array.isArray(objectStorySpec)) {
    throw new AppError('objectStorySpec must be an object when provided', 'VALIDATION_ERROR', 400);
  }

  const normalizedObjectStorySpec = { ...objectStorySpec } as Record<string, unknown>;
  const resolvedPageId = pageId || (hasOwnString(normalizedObjectStorySpec, 'page_id') ? String(normalizedObjectStorySpec.page_id).trim() : undefined);
  const resolvedInstagramActorId = instagramActorId || (hasOwnString(normalizedObjectStorySpec, 'instagram_actor_id')
    ? String(normalizedObjectStorySpec.instagram_actor_id).trim()
    : undefined);

  if (!resolvedPageId) {
    throw new AppError('pageId is required when objectStorySpec is used', 'VALIDATION_ERROR', 400, {
      recommendation: 'Pass pageId explicitly or include page_id inside objectStorySpec.'
    });
  }

  normalizedObjectStorySpec.page_id = resolvedPageId;

  if (resolvedInstagramActorId) {
    normalizedObjectStorySpec.instagram_actor_id = resolvedInstagramActorId;
  }

  return {
    adset_id: adSetId,
    name,
    status,
    creativeStrategy: 'inline-object-story-spec',
    ad_creative: {
      ...(creativeName ? { name: creativeName } : {}),
      object_story_spec: normalizedObjectStorySpec
    },
    page_id: resolvedPageId,
    ...(resolvedInstagramActorId ? { instagram_actor_id: resolvedInstagramActorId } : {}),
    ...(input.trackingSpecs ? { tracking_specs: input.trackingSpecs } : {})
  };
}

function toApprovalPayload(draft: NormalizedAdDraft) {
  if (draft.creativeStrategy === 'existing-creative-reference') {
    return {
      adset_id: draft.adset_id,
      name: draft.name,
      status: draft.status,
      creative: draft.creative,
      ...(draft.tracking_specs ? { tracking_specs: draft.tracking_specs } : {})
    };
  }

  return {
    adset_id: draft.adset_id,
    name: draft.name,
    status: draft.status,
    creative_strategy: draft.creativeStrategy,
    ad_creative: draft.ad_creative,
    page_id: draft.page_id,
    ...(draft.instagram_actor_id ? { instagram_actor_id: draft.instagram_actor_id } : {}),
    ...(draft.tracking_specs ? { tracking_specs: draft.tracking_specs } : {})
  };
}

function toAdCreatePayload(draft: NormalizedAdDraft, creativeIdOverride?: string) {
  const resolvedCreativeId = creativeIdOverride ?? (draft.creativeStrategy === 'existing-creative-reference' ? draft.creative_id : undefined);

  if (!resolvedCreativeId) {
    throw new AppError('creativeId is required to create an ad payload', 'VALIDATION_ERROR', 400);
  }

  return {
    adset_id: draft.adset_id,
    name: draft.name,
    status: draft.status,
    creative: {
      creative_id: resolvedCreativeId
    },
    ...(draft.tracking_specs ? { tracking_specs: draft.tracking_specs } : {})
  };
}

export class AdWriteService {
  private readonly auditRepository = new AuditRepository();
  private readonly approvalService = new MetaApprovalService();
  private readonly metaClient = new MetaClient();
  private readonly creativeDraftService = new CreativeDraftService();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();
  private readonly adRepository = new MetaAdSnapshotRepository();

  private async resolveDraftInput(input: AdCreateInput) {
    if (input.imageAssetId && input.videoAssetId) {
      throw new AppError('Use only one asset mode: imageAssetId or videoAssetId', 'VALIDATION_ERROR', 400);
    }

    if (!input.imageAssetId && !input.videoAssetId) {
      return {
        draft: input,
        assetBinding: null
      };
    }

    if (!input.creativeDraft) {
      throw new AppError('creativeDraft is required when imageAssetId or videoAssetId is used', 'VALIDATION_ERROR', 400, {
        imageAssetId: input.imageAssetId,
        videoAssetId: input.videoAssetId
      });
    }

    if (input.imageAssetId) {
      const creativeDraft = await this.creativeDraftService.buildImageAssetCreativeDraft({
        assetId: input.imageAssetId,
        pageId: input.creativeDraft.pageId,
        linkUrl: input.creativeDraft.linkUrl,
        message: input.creativeDraft.message,
        headline: input.creativeDraft.headline,
        description: input.creativeDraft.description,
        callToActionType: input.creativeDraft.callToActionType,
        instagramActorId: input.creativeDraft.instagramActorId,
        actor: 'internal-api',
        reason: `Resolve image asset ${input.imageAssetId} into ad creative draft`
      });

      return {
        draft: {
          ...input,
          pageId: creativeDraft.draft.pageId,
          instagramActorId: creativeDraft.draft.instagramActorId ?? undefined,
          objectStorySpec: creativeDraft.draft.objectStorySpec,
          creativeId: undefined
        },
        assetBinding: creativeDraft.draft.creativeHints
      };
    }

    const creativeDraft = await this.creativeDraftService.buildVideoAssetCreativeDraft({
      assetId: input.videoAssetId!,
      pageId: input.creativeDraft.pageId,
      linkUrl: input.creativeDraft.linkUrl,
      message: input.creativeDraft.message,
      headline: input.creativeDraft.headline,
      description: input.creativeDraft.description,
      callToActionType: input.creativeDraft.callToActionType,
      metaVideoId: input.creativeDraft.metaVideoId,
      instagramActorId: input.creativeDraft.instagramActorId,
      actor: 'internal-api',
      reason: `Resolve video asset ${input.videoAssetId} into ad creative draft`
    });

    if (!creativeDraft.draft.objectStorySpec) {
      throw new AppError('Video asset is not ready for create ad yet', 'VALIDATION_ERROR', 400, {
        videoAssetId: input.videoAssetId,
        providerConstraints: creativeDraft.draft.providerConstraints,
        recommendation: 'Publish the video asset to Meta first so it has a reusable metaVideoId and thumbnail.'
      });
    }

    return {
      draft: {
        ...input,
        pageId: creativeDraft.draft.pageId,
        instagramActorId: creativeDraft.draft.instagramActorId ?? undefined,
        objectStorySpec: creativeDraft.draft.objectStorySpec,
        creativeId: undefined
      },
      assetBinding: creativeDraft.draft.creativeHints
    };
  }

  private async ensureParentAdSetExists(adSetId: string): Promise<AdSetSnapshot> {
    const existing = await this.adSetRepository.getLatestByAdSetId(adSetId);
    if (existing) {
      return existing;
    }

    if (!env.META_AD_ACCOUNT_ID) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    try {
      const liveAdSet = await this.metaClient.getAdSet(adSetId);
      const snapshot = await this.adSetRepository.upsert(env.META_AD_ACCOUNT_ID, liveAdSet.data);
      if (!snapshot) {
        throw new AppError('Failed to persist parent ad set snapshot', 'REMOTE_TEMPORARY_FAILURE', 500, {
          adSetId
        });
      }

      return snapshot;
    } catch {
      throw new AppError('Parent ad set not found or not readable', 'RESOURCE_NOT_FOUND', 404, {
        adSetId
      });
    }
  }

  private async refreshAdSnapshot(adId: string) {
    if (!env.META_AD_ACCOUNT_ID) {
      return {
        snapshotUpdated: false,
        adId,
        error: 'META_AD_ACCOUNT_ID is not configured'
      };
    }

    try {
      const liveAd = await this.metaClient.getAd(adId);
      await this.adRepository.upsert(env.META_AD_ACCOUNT_ID, liveAd.data);
      return {
        snapshotUpdated: true,
        adId,
        strategy: 'live-read' as const
      };
    } catch (error) {
      return {
        snapshotUpdated: false,
        adId,
        strategy: 'failed' as const,
        error: error instanceof Error ? error.message : 'Unknown ad snapshot refresh error'
      };
    }
  }

  private describeCreativeStrategy(draft: NormalizedAdDraft) {
    if (draft.creativeStrategy === 'existing-creative-reference') {
      return {
        type: draft.creativeStrategy,
        creativeId: draft.creative_id,
        risks: [
          'Referenced creative can fail if the advertiser token cannot use the page or Instagram actor behind that creative.'
        ]
      };
    }

    return {
      type: draft.creativeStrategy,
      pageId: draft.page_id,
      instagramActorId: draft.instagram_actor_id ?? null,
      hasCreativeName: Boolean(draft.ad_creative.name),
      objectStoryKeys: Object.keys(draft.ad_creative.object_story_spec).sort(),
      recommendation: 'This strategy is safer when existing creative ownership/page permissions are the blocker.'
    };
  }

  private async createInlineCreativeIfNeeded(draft: NormalizedAdDraft) {
    if (draft.creativeStrategy !== 'inline-object-story-spec') {
      return null;
    }

    const result = await this.metaClient.createAdCreative(draft.ad_creative);

    return {
      creativeId: result.data.id ?? null,
      providerResponse: result.data,
      requestId: result.requestId,
      status: result.status
    };
  }

  private buildPermissionRecoveryHint(draft: NormalizedAdDraft) {
    if (draft.creativeStrategy === 'existing-creative-reference') {
      return {
        recommendation: 'Pastikan creativeId berasal dari page/actor yang memang bisa dipakai oleh advertiser ini, atau gunakan objectStorySpec + pageId agar creative dibuat ulang di jalur yang lebih eksplisit.',
        likelyCause: 'Existing creative is bound to a page or Instagram actor that the current advertiser/token cannot use.'
      };
    }

    return {
      recommendation: 'Pastikan pageId dan instagramActorId (jika dipakai) memang terhubung ke asset yang bisa dipakai oleh ad account dan token ini punya permission advertiser yang sesuai.',
      likelyCause: 'The supplied page or Instagram actor is not usable by the current advertiser/token.'
    };
  }

  private toActionableCreateError(error: unknown, draft: NormalizedAdDraft, createdInlineCreative?: { creativeId: string | null } | null) {
    const appError = error instanceof AppError ? error : new AppError('Meta ad create failed');
    const lowerMessage = appError.message.toLowerCase();
    const looksLikeCreativePermissionIssue = appError.code === 'PERMISSION_DENIED'
      || lowerMessage.includes('advertiser')
      || lowerMessage.includes('creative')
      || lowerMessage.includes('page');

    if (!looksLikeCreativePermissionIssue) {
      return appError;
    }

    return new AppError(
      'Meta ad create failed because the advertiser cannot use the requested creative/page context',
      appError.code,
      appError.statusCode,
      {
        originalMessage: appError.message,
        originalDetails: appError.details ?? null,
        creativeStrategy: this.describeCreativeStrategy(draft),
        ...(createdInlineCreative ? { createdInlineCreativeId: createdInlineCreative.creativeId } : {}),
        ...this.buildPermissionRecoveryHint(draft)
      }
    );
  }

  private assertHighImpactConfirmation(request: AdCreateRequest, draft: NormalizedAdDraft) {
    if (request.dryRun || draft.status !== 'ACTIVE' || request.confirmHighImpact) {
      return;
    }

    throw new AppError(
      'Live ad create with ACTIVE status requires confirmHighImpact=true or safer PAUSED rollout',
      'POLICY_REJECTED',
      409,
      {
        reason: request.reason,
        draft: toApprovalPayload(draft),
        recommendation: 'Create ad in PAUSED status first, then explicitly start it later.'
      }
    );
  }

  async previewCreateAd(request: AdCreateRequest) {
    const gate = ensureWriteEnabled(request);
    const resolved = await this.resolveDraftInput(request.draft);
    const draft = normalizeDraft(resolved.draft);
    const parentAdSet = await this.ensureParentAdSetExists(draft.adset_id);
    const creativeStrategy = this.describeCreativeStrategy(draft);

    await this.auditRepository.create({
      operationType: 'meta.ad.preview',
      actor: request.actor ?? 'internal-api',
      targetType: 'ad',
      targetId: `draft:${draft.name}`,
      status: 'pending',
      reason: request.reason,
      afterState: toApprovalPayload(draft),
      metadata: {
        dryRun: true,
        parentAdSetId: draft.adset_id,
        parentAdSetSnapshotId: parentAdSet.id,
        parentCampaignId: parentAdSet.campaignId,
        writeGate: gate,
        activeRequiresConfirmHighImpact: draft.status === 'ACTIVE',
        creativeStrategy,
        assetBinding: resolved.assetBinding
      }
    });

    return {
      ok: true,
      mode: 'dry-run',
      writeGate: gate,
      draft: toApprovalPayload(draft),
      creativeStrategy,
      assetBinding: resolved.assetBinding,
      parentAdSet: {
        id: parentAdSet.adSetId,
        name: parentAdSet.name,
        status: parentAdSet.status,
        campaignId: parentAdSet.campaignId
      },
      activeRequiresConfirmHighImpact: draft.status === 'ACTIVE'
    };
  }

  async createAd(request: AdCreateRequest) {
    if (request.dryRun) {
      return this.previewCreateAd(request);
    }

    const gate = ensureWriteEnabled(request);
    const resolved = await this.resolveDraftInput(request.draft);
    const draft = normalizeDraft(resolved.draft);
    const parentAdSet = await this.ensureParentAdSetExists(draft.adset_id);
    const creativeStrategy = this.describeCreativeStrategy(draft);
    this.assertHighImpactConfirmation(request, draft);

    await this.approvalService.assertAndConsumeApproval({
      operationType: 'meta.ad.create',
      targetType: 'ad',
      targetId: `draft:${draft.name}`,
      actor: request.actor ?? 'internal-api',
      reason: request.reason,
      payload: toApprovalPayload(draft),
      approvalId: request.approvalId,
      approvalToken: request.approvalToken
    });

    let createdInlineCreative: {
      creativeId: string | null;
      providerResponse: unknown;
      requestId: string;
      status: number;
    } | null = null;

    try {
      createdInlineCreative = await this.createInlineCreativeIfNeeded(draft);

      if (draft.creativeStrategy === 'inline-object-story-spec' && !createdInlineCreative?.creativeId) {
        throw new AppError('Meta ad creative create response did not include creative id', 'REMOTE_TEMPORARY_FAILURE', 502, {
          creativeStrategy,
          providerResponse: createdInlineCreative?.providerResponse ?? null
        });
      }

      const result = await this.metaClient.createAd(toAdCreatePayload(draft, createdInlineCreative?.creativeId ?? undefined));
      const adId = result.data.id ?? `draft:${draft.name}`;
      const refreshedSnapshot = result.data.id
        ? await this.refreshAdSnapshot(result.data.id)
        : {
            snapshotUpdated: false,
            adId,
            strategy: 'missing-id' as const,
            error: 'Meta create ad response did not include ad id'
          };

      await this.auditRepository.create({
        operationType: 'meta.ad.create',
        actor: request.actor ?? 'internal-api',
        targetType: 'ad',
        targetId: adId,
        status: 'success',
        reason: request.reason,
        afterState: {
          draft: toApprovalPayload(draft),
          providerResponse: result.data,
          adId
        },
        metadata: {
          dryRun: false,
          parentAdSetId: draft.adset_id,
          parentAdSetSnapshotId: parentAdSet.id,
          parentCampaignId: parentAdSet.campaignId,
          writeGate: gate,
          creativeStrategy,
          assetBinding: resolved.assetBinding,
          createdInlineCreative,
          refreshedSnapshot,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        action: 'create-ad',
        adId,
        draft: toApprovalPayload(draft),
        creativeStrategy,
        assetBinding: resolved.assetBinding,
        createdInlineCreative,
        parentAdSet: {
          id: parentAdSet.adSetId,
          name: parentAdSet.name,
          status: parentAdSet.status,
          campaignId: parentAdSet.campaignId
        },
        result: result.data,
        refreshedSnapshot
      };
    } catch (error) {
      const appError = this.toActionableCreateError(error, draft, createdInlineCreative);

      await this.auditRepository.create({
        operationType: 'meta.ad.create',
        actor: request.actor ?? 'internal-api',
        targetType: 'ad',
        targetId: `draft:${draft.name}`,
        status: 'failed',
        reason: request.reason,
        afterState: toApprovalPayload(draft),
        metadata: {
          dryRun: false,
          parentAdSetId: draft.adset_id,
          creativeStrategy,
          assetBinding: resolved.assetBinding,
          createdInlineCreative,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details
        }
      });

      throw appError;
    }
  }
}
