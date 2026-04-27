import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { MetaAdSetSnapshotRepository } from '../meta-sync/repositories/meta-adset.repository.js';
import { MetaAdSnapshotRepository } from '../meta-sync/repositories/meta-ad.repository.js';
import { AdWriteService } from './ad-write.service.js';
import { DuplicateWriteService } from './duplicate-write.service.js';
import { MetaClient } from '../providers/meta/meta.client.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function extractMetaErrorSignal(value: unknown, depth = 0): { code: number | null; subcode: number | null; message: string | null } | null {
  if (depth > 5 || value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = extractMetaErrorSignal(item, depth + 1);
      if (match?.subcode || match?.code || match?.message) {
        return match;
      }
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const nestedError = asRecord(record.error);
  const code = typeof nestedError?.code === 'number'
    ? nestedError.code
    : typeof record.code === 'number'
      ? record.code
      : null;
  const subcode = typeof nestedError?.error_subcode === 'number'
    ? nestedError.error_subcode
    : typeof record.error_subcode === 'number'
      ? record.error_subcode
      : null;
  const message = asString(nestedError?.message) ?? asString(record.message);

  if (code || subcode || message) {
    return { code, subcode, message };
  }

  for (const nested of Object.values(record)) {
    const match = extractMetaErrorSignal(nested, depth + 1);
    if (match?.subcode || match?.code || match?.message) {
      return match;
    }
  }

  return null;
}

const KNOWN_BLOCKER_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function buildKnownBlockerSummary(rows: Array<{ operationType: string; targetId: string; metadata: unknown; createdAt?: Date }>) {
  const signals = rows.map((row) => ({
    operationType: row.operationType,
    targetId: row.targetId,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : null,
    metaError: extractMetaErrorSignal(row.metadata)
  })).filter((row) => row.metaError?.subcode || row.metaError?.code || row.metaError?.message);

  const freshSignals = signals.filter((row) => {
    if (!row.createdAt) {
      return false;
    }

    const createdAtMs = Date.parse(row.createdAt);
    return Number.isFinite(createdAtMs) && (Date.now() - createdAtMs) <= KNOWN_BLOCKER_MAX_AGE_MS;
  });

  const hasAppModeBlocker = freshSignals.some((row) => row.metaError?.subcode === 1885183);
  const hasPromotabilityBlocker = freshSignals.some((row) => row.metaError?.subcode === 2875030);

  return {
    signals,
    freshSignals,
    hasAppModeBlocker,
    hasPromotabilityBlocker
  };
}

function uniqueWarnings(values: Array<{ code: string; message: string; source: string }>) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.code}:${value.message}:${value.source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export class PreflightCheckService {
  private readonly auditRepository = new AuditRepository();
  private readonly adRepository = new MetaAdSnapshotRepository();
  private readonly adSetRepository = new MetaAdSetSnapshotRepository();
  private readonly adWriteService = new AdWriteService();
  private readonly duplicateWriteService = new DuplicateWriteService();
  private readonly metaClient = new MetaClient();

  private async getRecentExternalSignals(sourceAdId?: string) {
    const [globalRows, sourceRows] = await Promise.all([
      this.auditRepository.findRecentByOperation(['meta.ad.create', 'meta.ad.duplicate'], 20),
      sourceAdId
        ? this.auditRepository.findRecentByTarget('ad', sourceAdId, ['meta.ad.duplicate'], 10)
        : Promise.resolve([])
    ]);

    return {
      global: buildKnownBlockerSummary(globalRows),
      source: buildKnownBlockerSummary(sourceRows)
    };
  }

  async inspectAdPromotability(input: {
    adId: string;
    targetAdSetId?: string | undefined;
  }) {
    const sourceAd = await this.adRepository.getLatestByAdId(input.adId)
      ?? (env.META_AD_ACCOUNT_ID
        ? await this.metaClient.getAd(input.adId).then((response) => this.adRepository.upsert(env.META_AD_ACCOUNT_ID!, response.data))
        : null);

    if (!sourceAd) {
      throw new AppError('Source ad not found or not readable', 'RESOURCE_NOT_FOUND', 404, {
        adId: input.adId
      });
    }

    const targetAdSet = input.targetAdSetId
      ? await this.adSetRepository.getLatestByAdSetId(input.targetAdSetId)
      : null;

    const creativeId = sourceAd.creativeId;
    const creative = creativeId
      ? await this.metaClient.getAdCreative(creativeId).then((response) => response.data).catch(() => null)
      : null;
    const objectStorySpec = asRecord(creative?.object_story_spec);
    const videoData = asRecord(objectStorySpec?.video_data);
    const linkData = asRecord(objectStorySpec?.link_data);
    const pageId = asString(objectStorySpec?.page_id);
    const instagramActorId = asString(objectStorySpec?.instagram_actor_id);
    const videoId = asString(videoData?.video_id);
    const video = videoId
      ? await this.metaClient.getVideo(videoId).then((response) => response.data).catch(() => null)
      : null;
    const page = pageId
      ? await this.metaClient.getPage(pageId).then((response) => response.data).catch(() => null)
      : null;

    const recentSignals = await this.getRecentExternalSignals(sourceAd.adId);
    const blockers: Array<{ code: string; message: string; source: string }> = [];
    const warnings: Array<{ code: string; message: string; source: string }> = [];

    if (recentSignals.source.hasPromotabilityBlocker) {
      blockers.push({
        code: 'SOURCE_CREATIVE_NOT_PROMOTABLE',
        message: 'Recent duplicate attempts on this source ad were rejected by Meta because the source creative is not promotable.',
        source: 'audit:meta.ad.duplicate'
      });
    }

    if (recentSignals.global.hasAppModeBlocker) {
      blockers.push({
        code: 'META_APP_NOT_LIVE',
        message: 'Recent Meta write attempts still show error_subcode 1885183, which strongly suggests the app/post-backed creative context is still not Live/Public.',
        source: 'audit:meta.ad.create/meta.ad.duplicate'
      });
    }

    if (creative && videoData && !asString(videoData.image_url) && !creative.thumbnail_url && !creative.image_url) {
      warnings.push({
        code: 'VIDEO_PREVIEW_IMAGE_MISSING',
        message: 'Video creative does not expose an image_url/thumbnail_url in the current detail fetch; some Meta write paths can be sensitive to missing preview images.',
        source: 'creative:object_story_spec.video_data'
      });
    }

    if (video?.status?.video_status && video.status.video_status.toLowerCase() !== 'ready') {
      warnings.push({
        code: 'VIDEO_NOT_READY',
        message: `Source video is not ready yet (status: ${video.status.video_status}).`,
        source: 'video:status'
      });
    }

    if (instagramActorId) {
      warnings.push({
        code: 'INSTAGRAM_ACTOR_CONTEXT',
        message: 'Source creative uses instagram_actor_id; duplicate/live create can depend on Instagram/Page/business linkage being valid for the current app context.',
        source: 'creative:object_story_spec.instagram_actor_id'
      });
    }

    if (pageId && !page) {
      warnings.push({
        code: 'PAGE_READ_UNCONFIRMED',
        message: 'Source creative references a page_id, but the current token could not confirm page readability via Graph in this preflight pass.',
        source: 'graph:page'
      });
    }

    return {
      ok: true,
      action: 'inspect-ad-promotability',
      status: blockers.length ? 'blocked' : warnings.length ? 'conditional' : 'likely-ready',
      sourceAd: {
        adId: sourceAd.adId,
        name: sourceAd.name,
        campaignId: sourceAd.campaignId,
        adSetId: sourceAd.adSetId,
        creativeId: sourceAd.creativeId,
        creativeName: sourceAd.creativeName,
        effectiveStatus: sourceAd.effectiveStatus
      },
      targetAdSet: targetAdSet
        ? {
            adSetId: targetAdSet.adSetId,
            name: targetAdSet.name,
            campaignId: targetAdSet.campaignId,
            effectiveStatus: targetAdSet.effectiveStatus
          }
        : null,
      creative: creative
        ? {
            id: creative.id ?? sourceAd.creativeId,
            name: creative.name ?? sourceAd.creativeName,
            objectType: creative.object_type ?? null,
            pageId,
            instagramActorId,
            storyKeys: objectStorySpec ? Object.keys(objectStorySpec) : [],
            hasVideoData: Boolean(videoData),
            hasLinkData: Boolean(linkData),
            hasImageUrl: Boolean(creative.image_url),
            hasThumbnailUrl: Boolean(creative.thumbnail_url)
          }
        : null,
      page: page
        ? {
            id: page.id,
            name: page.name ?? null,
            verificationStatus: page.verification_status ?? null,
            canPost: page.can_post ?? null,
            isPublished: page.is_published ?? null,
            link: page.link ?? null
          }
        : null,
      video: video
        ? {
            id: video.id ?? videoId,
            status: video.status?.video_status ?? null,
            length: video.length ?? null,
            title: video.title ?? null
          }
        : null,
      blockers: uniqueWarnings(blockers),
      warnings: uniqueWarnings(warnings),
      evidence: recentSignals
    };
  }

  async preflightCreateAd(input: {
    draft: Record<string, unknown>;
    reason: string;
    actor?: string | undefined;
    secret?: string | undefined;
  }) {
    const preview = await this.adWriteService.previewCreateAd({
      draft: input.draft as any,
      reason: input.reason,
      actor: input.actor,
      secret: input.secret,
      dryRun: true,
      confirmHighImpact: false
    });

    const pageId = asString((preview.draft as Record<string, unknown>).pageId)
      ?? asString(asRecord((preview.draft as Record<string, unknown>).objectStorySpec)?.page_id)
      ?? asString(asRecord((preview.draft as Record<string, unknown>).creativeDraft)?.pageId);
    const page = pageId
      ? await this.metaClient.getPage(pageId).then((response) => response.data).catch(() => null)
      : null;
    const recentSignals = await this.getRecentExternalSignals();

    const blockers: Array<{ code: string; message: string; source: string }> = [];
    const warnings: Array<{ code: string; message: string; source: string }> = [];

    if (recentSignals.global.hasAppModeBlocker && preview.creativeStrategy.type !== 'existing-creative-reference') {
      blockers.push({
        code: 'META_APP_NOT_LIVE',
        message: 'Recent Meta write attempts still show error_subcode 1885183. Any path that needs Meta to accept a new post-backed creative can remain blocked until the app is Live/Public.',
        source: 'audit:meta.ad.create/meta.ad.duplicate'
      });
    }

    if (pageId && !page) {
      warnings.push({
        code: 'PAGE_READ_UNCONFIRMED',
        message: 'The preflight could not confirm page readability for the requested page_id with the current token.',
        source: 'graph:page'
      });
    }

    if (preview.assetBinding && preview.creativeStrategy.type === 'inline-object-story-spec') {
      warnings.push({
        code: 'INLINE_CREATIVE_CONTEXT',
        message: 'This create path still depends on Meta accepting inline/post-backed creative context, so Live/Public app status remains important.',
        source: 'creativeStrategy:inline-object-story-spec'
      });
    }

    return {
      ok: true,
      action: 'preflight-create-ad',
      status: blockers.length ? 'blocked' : warnings.length ? 'conditional' : 'likely-ready',
      preview,
      page: page
        ? {
            id: page.id,
            name: page.name ?? null,
            verificationStatus: page.verification_status ?? null,
            canPost: page.can_post ?? null,
            isPublished: page.is_published ?? null,
            link: page.link ?? null
          }
        : null,
      blockers: uniqueWarnings(blockers),
      warnings: uniqueWarnings(warnings),
      evidence: recentSignals.global
    };
  }

  async preflightDuplicateAd(input: {
    draft: {
      sourceAdId: string;
      targetAdSetId?: string | undefined;
      statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
      renameOptions?: Record<string, unknown> | undefined;
      creativeParameters?: Record<string, unknown> | undefined;
    };
    reason: string;
    actor?: string | undefined;
    secret?: string | undefined;
  }) {
    const preview = await this.duplicateWriteService.previewDuplicateAd({
      draft: input.draft,
      reason: input.reason,
      actor: input.actor,
      secret: input.secret,
      dryRun: true,
      confirmHighImpact: false
    });
    const inspection = await this.inspectAdPromotability({
      adId: input.draft.sourceAdId,
      targetAdSetId: input.draft.targetAdSetId
    });

    const blockers = uniqueWarnings([
      ...inspection.blockers,
      ...(preview.activeRequiresConfirmHighImpact
        ? [{
            code: 'ACTIVE_STATUS_REQUIRES_CONFIRMATION',
            message: 'Live duplicate ad with ACTIVE status will require confirmHighImpact=true or a safer PAUSED rollout.',
            source: 'duplicate-preview'
          }]
        : [])
    ]);
    const warnings = uniqueWarnings([
      ...inspection.warnings
    ]);

    return {
      ok: true,
      action: 'preflight-duplicate-ad',
      status: blockers.length ? 'blocked' : warnings.length ? 'conditional' : 'likely-ready',
      preview,
      inspection,
      blockers,
      warnings
    };
  }
}
