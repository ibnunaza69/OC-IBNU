import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { AnalysisService } from '../analysis/analysis.service.js';
import { AssetLibraryRepository } from '../asset-generation/asset.repository.js';
import { enqueueKieImagePollJob } from '../asset-generation/image-generation.queue.js';
import { ImageGenerationService } from '../asset-generation/image-generation.service.js';
import { AssetGenerationTaskRepository } from '../asset-generation/task.repository.js';
import { enqueueKieRunwayVideoPollJob } from '../asset-generation/video-generation.queue.js';
import { VideoGenerationService } from '../asset-generation/video-generation.service.js';
import { CopyRepository } from '../copywriting-lab/copy.repository.js';
import { AuditRepository } from '../foundation/audit/audit.repository.js';
import { CredentialsStateRepository } from '../foundation/credentials/credentials.repository.js';
import { pingDb } from '../foundation/db/client.js';
import { JobsStateRepository } from '../foundation/jobs/jobs.repository.js';
import { ManageCampaignsCleanupService } from '../manage-campaigns/manage-campaigns-cleanup.service.js';
import { DuplicateTreeService } from '../manage-campaigns/duplicate-tree.service.js';
import { DuplicateWriteService } from '../manage-campaigns/duplicate-write.service.js';
import { PreflightCheckService } from '../manage-campaigns/preflight-check.service.js';
import { MetaSyncService } from '../meta-sync/meta-sync.service.js';
import { MetaAdSnapshotRepository } from '../meta-sync/repositories/meta-ad.repository.js';
import { MetaClient } from '../providers/meta/meta.client.js';
import { MetaOAuthService } from './meta-oauth.service.js';
import { getDashboardRuntimeConfig, updateDashboardRuntimeConfig, type DashboardSettingsUpdateInput } from './runtime-config.js';
import { dashboardWorkflowCatalog } from './workflow-catalog.js';

interface DashboardCreativeGenerateInput {
  assetType: 'image' | 'video';
  reason: string;
  actor?: string | undefined;
  image?: {
    providerPayload: Record<string, unknown>;
    templateVersion?: string | undefined;
    callbackUrl?: string | undefined;
    enqueuePolling?: boolean | undefined;
    dryRun?: boolean | undefined;
  };
  video?: {
    prompt: string;
    imageAssetId?: string | undefined;
    imageUrl?: string | undefined;
    durationSeconds?: 5 | 10 | undefined;
    quality?: '720p' | '1080p' | undefined;
    aspectRatio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | undefined;
    templateVersion?: string | undefined;
    callbackUrl?: string | undefined;
    enqueuePolling?: boolean | undefined;
    dryRun?: boolean | undefined;
  };
}

function inferAssetTypeFromCreativeType(creativeType?: string | null) {
  if (!creativeType) {
    return null;
  }

  return creativeType.toLowerCase().includes('video') ? 'video' : 'image';
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function inferAudienceType(subtype: string | null | undefined): 'custom' | 'lookalike' {
  const normalized = subtype?.toUpperCase() ?? '';
  return normalized.includes('LOOKALIKE') ? 'lookalike' : 'custom';
}

function getConnectionSelectionCount(connection: {
  selection: {
    adAccountIds: string[];
    pageIds: string[];
    pixelIds: string[];
    businessIds: string[];
  };
}) {
  return connection.selection.adAccountIds.length
    + connection.selection.pageIds.length
    + connection.selection.pixelIds.length
    + connection.selection.businessIds.length;
}

function buildConnectionHealth(connection: {
  runtimeBound: boolean;
  tokenExpiresAt: string | null;
  selection: {
    adAccountIds: string[];
    pageIds: string[];
    pixelIds: string[];
    businessIds: string[];
  };
}) {
  const issues: string[] = [];
  const selectionCount = getConnectionSelectionCount(connection);

  if (selectionCount === 0) {
    issues.push('Belum ada asset yang dipilih dari connection ini.');
  }

  if (!connection.tokenExpiresAt) {
    return {
      level: connection.runtimeBound ? 'info' : 'success',
      label: connection.runtimeBound ? 'BOUND' : 'READY',
      issues
    };
  }

  const remainingMs = new Date(connection.tokenExpiresAt).getTime() - Date.now();
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));

  if (remainingMs <= 0) {
    issues.push('Token terlihat sudah expired dan perlu reconnect.');
    return {
      level: 'error',
      label: 'EXPIRED',
      issues
    };
  }

  if (remainingHours <= 72) {
    issues.push(`Token akan expire sekitar ${remainingHours} jam lagi.`);
    return {
      level: connection.runtimeBound ? 'warning' : 'warning',
      label: connection.runtimeBound ? 'BOUND, EXPIRING' : 'EXPIRING',
      issues
    };
  }

  return {
    level: connection.runtimeBound ? 'info' : 'success',
    label: connection.runtimeBound ? 'BOUND' : 'HEALTHY',
    issues
  };
}

export class DashboardMonitoringService {
  private readonly analysisService = new AnalysisService();
  private readonly credentialsRepository = new CredentialsStateRepository();
  private readonly jobsRepository = new JobsStateRepository();
  private readonly auditRepository = new AuditRepository();
  private readonly assetTaskRepository = new AssetGenerationTaskRepository();
  private readonly assetLibraryRepository = new AssetLibraryRepository();
  private readonly imageGenerationService = new ImageGenerationService();
  private readonly videoGenerationService = new VideoGenerationService();
  private readonly copyRepository = new CopyRepository();
  private readonly cleanupService = new ManageCampaignsCleanupService();
  private readonly duplicateWriteService = new DuplicateWriteService();
  private readonly duplicateTreeService = new DuplicateTreeService();
  private readonly preflightCheckService = new PreflightCheckService();
  private readonly metaSyncService = new MetaSyncService();
  private readonly adSnapshotRepository = new MetaAdSnapshotRepository();
  private readonly metaClient = new MetaClient();
  private readonly metaOAuthService = new MetaOAuthService();

  private async getLinkedAssetByAdId(adIds: string[]) {
    const assetBindings = await this.auditRepository.findLatestAdAssetBindings(adIds);
    const assetIds = Array.from(new Set(
      Array.from(assetBindings.values())
        .map((binding) => binding.assetId)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    ));
    const assets = await this.assetLibraryRepository.findManyByIds(assetIds);
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));

    return new Map(adIds.map((adId) => {
      const binding = assetBindings.get(adId);
      const linkedAsset = binding?.assetId ? assetById.get(binding.assetId) : null;

      return [adId, linkedAsset
        ? {
            id: linkedAsset.id,
            assetType: linkedAsset.assetType,
            provider: linkedAsset.provider,
            status: linkedAsset.status,
            title: linkedAsset.title,
            mimeType: linkedAsset.mimeType,
            originalUrl: linkedAsset.originalUrl,
            thumbnailUrl: linkedAsset.thumbnailUrl,
            width: linkedAsset.width,
            height: linkedAsset.height,
            durationSeconds: linkedAsset.durationSeconds,
            source: 'asset-library' as const
          }
        : binding
          ? {
              id: binding.assetId ?? null,
              assetType: inferAssetTypeFromCreativeType(binding.creativeType),
              provider: binding.provider ?? null,
              status: null,
              title: null,
              mimeType: binding.mimeType ?? null,
              originalUrl: binding.sourceUrl ?? null,
              thumbnailUrl: binding.thumbnailUrl ?? binding.sourceUrl ?? null,
              width: binding.width ?? null,
              height: binding.height ?? null,
              durationSeconds: binding.durationSeconds ?? null,
              source: 'audit-binding' as const
            }
          : null];
    }));
  }

  async getSummary() {
    const [
      dbOk,
      overview,
      credentials,
      jobs,
      audits,
      assetTasks,
      assets,
      copyVariants,
      copyReviews
    ] = await Promise.all([
      pingDb(),
      this.analysisService.getOverview(),
      this.credentialsRepository.listAll(20),
      this.jobsRepository.listRecent(10),
      this.auditRepository.listRecent(10),
      this.assetTaskRepository.listRecent(10),
      this.assetLibraryRepository.listRecent(10),
      this.copyRepository.listVariants({ limit: 10 }),
      this.copyRepository.listReviews({ limit: 10 })
    ]);

    const metaCredential = env.META_AD_ACCOUNT_ID
      ? credentials.find((item) => item.provider === 'meta' && item.subject === env.META_AD_ACCOUNT_ID)
      : credentials.find((item) => item.provider === 'meta');
    const kieCredential = credentials.find((item) => item.provider === 'kie');

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      dashboard: {
        authEnabled: env.DASHBOARD_AUTH_ENABLED,
        secureCookie: env.DASHBOARD_COOKIE_SECURE,
        sessionTtlSeconds: env.DASHBOARD_SESSION_TTL_SECONDS
      },
      foundation: {
        db: dbOk ? 'up' : 'down',
        api: 'up',
        workerHint: jobs[0]?.updatedAt ?? null
      },
      providers: {
        meta: {
          configured: Boolean(env.META_ACCESS_TOKEN),
          adAccountConfigured: Boolean(env.META_AD_ACCOUNT_ID),
          credentialState: metaCredential ?? null
        },
        kie: {
          configured: Boolean(env.KIE_API_KEY),
          callbackConfigured: Boolean(env.KIE_CALLBACK_URL),
          credentialState: kieCredential ?? null
        }
      },
      analysisOverview: overview,
      recent: {
        credentials,
        jobs,
        audits,
        assetTasks,
        assets,
        copyVariants,
        copyReviews
      }
    };
  }

  async getCampaignExplorer(limit = 50) {
    const hierarchy = await this.analysisService.getCampaignHierarchy(undefined, limit);

    if (!hierarchy.ok) {
      return hierarchy;
    }

    const campaignItems = hierarchy.items ?? [];
    const adIds = campaignItems.flatMap((campaign) =>
      campaign.adSets.flatMap((adSet) => adSet.ads.map((ad) => ad.adId))
    );
    const linkedAssetByAdId = await this.getLinkedAssetByAdId(adIds);

    return {
      ...hierarchy,
      items: campaignItems.map((campaign) => ({
        ...campaign,
        adSets: campaign.adSets.map((adSet) => ({
          ...adSet,
          ads: adSet.ads.map((ad) => ({
            ...ad,
            asset: linkedAssetByAdId.get(ad.adId) ?? null
          }))
        }))
      }))
    };
  }

  async getAudiences(limit = 50, type: 'all' | 'custom' | 'lookalike' = 'all') {
    const response = await this.metaClient.listAudiences(limit);

    const mappedItems = response.data.map((item) => {
      const subtype = asString(item.subtype)?.toUpperCase() ?? null;

      return {
        id: item.id,
        name: asString(item.name),
        subtype,
        audienceType: inferAudienceType(subtype),
        description: asString(item.description),
        approximateCount: asInteger(item.approximate_count),
        retentionDays: asInteger(item.retention_days),
        timeCreated: asString(item.time_created),
        timeUpdated: asString(item.time_updated),
        operationStatus: asRecord(item.operation_status),
        deliveryStatus: asRecord(item.delivery_status),
        lookalikeSpec: asRecord(item.lookalike_spec),
        rule: asString(item.rule)
      };
    });

    const items = type === 'all'
      ? mappedItems
      : mappedItems.filter((item) => item.audienceType === type);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      filters: {
        limit,
        type
      },
      count: items.length,
      paging: response.paging ?? null,
      items
    };
  }

  async updateAudience(audienceId: string, input: {
    reason: string;
    actor?: string | undefined;
    dryRun?: boolean | undefined;
    name?: string | undefined;
    description?: string | undefined;
    retentionDays?: number | undefined;
  }) {
    const actor = input.actor ?? 'dashboard-user';
    const dryRun = input.dryRun ?? true;
    const before = await this.metaClient.getAudience(audienceId);
    const audienceSubtype = asString(before.data.subtype)?.toUpperCase() ?? null;

    if (audienceSubtype?.includes('LOOKALIKE') && input.retentionDays !== undefined) {
      throw new AppError('retentionDays hanya bisa diubah untuk custom audience.', 'VALIDATION_ERROR', 400);
    }

    const updatePayload = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.retentionDays !== undefined ? { retentionDays: input.retentionDays } : {})
    };

    if (dryRun) {
      await this.auditRepository.create({
        operationType: 'meta.audience.update',
        actor,
        targetType: 'audience',
        targetId: audienceId,
        status: 'pending',
        reason: input.reason,
        beforeState: before.data,
        afterState: updatePayload,
        metadata: {
          dryRun: true,
          fieldsUpdated: Object.keys(updatePayload)
        }
      });

      return {
        ok: true,
        mode: 'dry-run',
        audienceId,
        reason: input.reason,
        before: before.data,
        updatePayload
      };
    }

    try {
      const result = await this.metaClient.updateAudience(audienceId, {
        name: input.name,
        description: input.description,
        retentionDays: input.retentionDays
      });

      const refreshed = await this.metaClient.getAudience(audienceId).catch(() => null);

      await this.auditRepository.create({
        operationType: 'meta.audience.update',
        actor,
        targetType: 'audience',
        targetId: audienceId,
        status: 'success',
        reason: input.reason,
        beforeState: before.data,
        afterState: refreshed?.data ?? updatePayload,
        metadata: {
          dryRun: false,
          requestId: result.requestId,
          statusCode: result.status,
          fieldsUpdated: Object.keys(updatePayload)
        }
      });

      return {
        ok: true,
        mode: 'live',
        audienceId,
        result: result.data,
        item: refreshed?.data ?? null
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Audience update failed');

      await this.auditRepository.create({
        operationType: 'meta.audience.update',
        actor,
        targetType: 'audience',
        targetId: audienceId,
        status: 'failed',
        reason: input.reason,
        beforeState: before.data,
        afterState: updatePayload,
        metadata: {
          dryRun: false,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details ?? null,
          fieldsUpdated: Object.keys(updatePayload)
        }
      });

      throw appError;
    }
  }

  async deleteAudience(audienceId: string, input: {
    reason: string;
    actor?: string | undefined;
    dryRun?: boolean | undefined;
  }) {
    const actor = input.actor ?? 'dashboard-user';
    const dryRun = input.dryRun ?? true;
    const before = await this.metaClient.getAudience(audienceId);

    if (dryRun) {
      await this.auditRepository.create({
        operationType: 'meta.audience.delete',
        actor,
        targetType: 'audience',
        targetId: audienceId,
        status: 'pending',
        reason: input.reason,
        beforeState: before.data,
        metadata: {
          dryRun: true
        }
      });

      return {
        ok: true,
        mode: 'dry-run',
        audienceId,
        reason: input.reason,
        before: before.data
      };
    }

    try {
      const result = await this.metaClient.deleteAudience(audienceId);

      await this.auditRepository.create({
        operationType: 'meta.audience.delete',
        actor,
        targetType: 'audience',
        targetId: audienceId,
        status: 'success',
        reason: input.reason,
        beforeState: before.data,
        afterState: {
          deleted: true
        },
        metadata: {
          dryRun: false,
          requestId: result.requestId,
          statusCode: result.status
        }
      });

      return {
        ok: true,
        mode: 'live',
        audienceId,
        deleted: true,
        result: result.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Audience delete failed');

      await this.auditRepository.create({
        operationType: 'meta.audience.delete',
        actor,
        targetType: 'audience',
        targetId: audienceId,
        status: 'failed',
        reason: input.reason,
        beforeState: before.data,
        metadata: {
          dryRun: false,
          normalizedErrorCode: appError.code,
          statusCode: appError.statusCode,
          details: appError.details ?? null
        }
      });

      throw appError;
    }
  }

  async syncCampaignExplorer(limit = 50, input: { actor?: string | undefined } = {}) {
    const result = await this.metaSyncService.syncAccountHierarchy(limit);

    return {
      ok: true,
      action: 'sync-meta-hierarchy',
      source: 'meta-live',
      actor: input.actor ?? 'dashboard-user',
      syncedAt: new Date().toISOString(),
      limits: result.limits ?? null,
      totals: {
        campaigns: result.campaigns.length,
        adSets: result.adSets.length,
        ads: result.ads.length
      },
      accountId: result.account?.accountId ?? null
    };
  }

  async getAdDetail(adId: string) {
    const [adSnapshot, linkedAssetByAdId] = await Promise.all([
      this.adSnapshotRepository.getLatestByAdId(adId),
      this.getLinkedAssetByAdId([adId])
    ]);

    if (!adSnapshot) {
      return {
        ok: false,
        error: {
          code: 'AD_NOT_FOUND',
          message: 'Ad snapshot tidak ditemukan.'
        }
      };
    }

    const linkedAsset = linkedAssetByAdId.get(adId) ?? null;

    if (!adSnapshot.creativeId) {
      return {
        ok: true,
        ad: {
          adId: adSnapshot.adId,
          name: adSnapshot.name,
          effectiveStatus: adSnapshot.effectiveStatus,
          creativeId: null,
          creativeName: adSnapshot.creativeName
        },
        asset: linkedAsset,
        creative: null
      };
    }

    try {
      const creativeResponse = await this.metaClient.getAdCreative(adSnapshot.creativeId);
      const creative = creativeResponse.data;
      const objectStorySpec = asRecord(creative.object_story_spec);
      const linkData = asRecord(objectStorySpec?.link_data);
      const videoData = asRecord(objectStorySpec?.video_data);
      const photoData = asRecord(objectStorySpec?.photo_data);
      const firstChildAttachment = Array.isArray(linkData?.child_attachments)
        ? asRecord(linkData.child_attachments[0])
        : null;
      const videoId = asString(videoData?.video_id);

      let videoUrl: string | null = null;
      let videoDurationSeconds: number | null = null;
      let videoThumbnailUrl: string | null = null;

      if (videoId) {
        try {
          const videoResponse = await this.metaClient.getVideo(videoId);
          videoUrl = asString(videoResponse.data.source);
          videoDurationSeconds = asNumber(videoResponse.data.length);
          videoThumbnailUrl = asString(videoResponse.data.picture);
        } catch {
          videoUrl = null;
        }
      }

      const linkCallToActionValue = asRecord(asRecord(linkData?.call_to_action)?.value);
      const videoCallToActionValue = asRecord(asRecord(videoData?.call_to_action)?.value);
      const linkPreviewUrl = asString(linkData?.picture)
        ?? asString(firstChildAttachment?.picture)
        ?? asString(photoData?.url);
      const imageUrl = asString(creative.image_url) ?? linkPreviewUrl;
      const thumbnailUrl = asString(creative.thumbnail_url)
        ?? asString(videoData?.image_url)
        ?? videoThumbnailUrl
        ?? imageUrl;
      const previewType = videoUrl || videoId
        ? 'video'
        : imageUrl || thumbnailUrl
          ? 'image'
          : 'unknown';

      return {
        ok: true,
        ad: {
          adId: adSnapshot.adId,
          name: adSnapshot.name,
          effectiveStatus: adSnapshot.effectiveStatus,
          creativeId: adSnapshot.creativeId,
          creativeName: adSnapshot.creativeName
        },
        asset: linkedAsset,
        creative: {
          id: creative.id ?? adSnapshot.creativeId,
          name: creative.name ?? adSnapshot.creativeName ?? null,
          objectType: asString(creative.object_type),
          previewType,
          imageUrl,
          thumbnailUrl,
          videoUrl,
          videoId,
          durationSeconds: videoDurationSeconds,
          linkUrl: asString(linkData?.link)
            ?? asString(linkCallToActionValue?.link)
            ?? asString(videoCallToActionValue?.link),
          body: asString(linkData?.message) ?? asString(videoData?.message),
          headline: asString(linkData?.name) ?? asString(videoData?.title),
          description: asString(linkData?.description) ?? asString(videoData?.link_description),
          source: 'meta-creative' as const
        }
      };
    } catch (error) {
      return {
        ok: true,
        ad: {
          adId: adSnapshot.adId,
          name: adSnapshot.name,
          effectiveStatus: adSnapshot.effectiveStatus,
          creativeId: adSnapshot.creativeId,
          creativeName: adSnapshot.creativeName
        },
        asset: linkedAsset,
        creative: {
          id: adSnapshot.creativeId,
          name: adSnapshot.creativeName ?? null,
          objectType: null,
          previewType: 'unknown' as const,
          imageUrl: null,
          thumbnailUrl: null,
          videoUrl: null,
          videoId: null,
          durationSeconds: null,
          linkUrl: null,
          body: null,
          headline: null,
          description: null,
          source: 'meta-creative' as const,
          error: error instanceof Error ? error.message : 'Gagal memuat detail creative dari Meta.'
        }
      };
    }
  }

  async getCreativeLibrary(limit = 50, assetType: 'all' | 'image' | 'video' = 'all') {
    const items = await this.assetLibraryRepository.listRecent(limit, assetType === 'all' ? undefined : assetType);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      filters: {
        assetType,
        limit
      },
      totals: {
        total: items.length,
        image: items.filter((item) => item.assetType === 'image').length,
        video: items.filter((item) => item.assetType === 'video').length
      },
      items
    };
  }

  async getWorkflowCatalog() {
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      items: dashboardWorkflowCatalog
    };
  }

  async getSettings() {
    const [credentials, runtimeConfig, metaConnections] = await Promise.all([
      this.credentialsRepository.listAll(100),
      getDashboardRuntimeConfig(),
      this.metaOAuthService.listConnections()
    ]);
    const metaCredential = runtimeConfig.metaAdAccountId
      ? credentials.find((item) => item.provider === 'meta' && item.subject === runtimeConfig.metaAdAccountId)
      : credentials.find((item) => item.provider === 'meta') ?? null;
    const kieCredential = credentials.find((item) => item.provider === 'kie') ?? null;
    const enrichedConnections = metaConnections.map((connection) => ({
      ...connection,
      health: buildConnectionHealth(connection)
    }));

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (!runtimeConfig.metaAppId || !runtimeConfig.metaOAuthRedirectUri || !runtimeConfig.metaAppSecretConfigured) {
      blockers.push('Meta App ID, App Secret, dan Redirect URI belum lengkap, jadi reviewer belum bisa menjalankan flow authorize penuh.');
    }

    if (enrichedConnections.length === 0) {
      blockers.push('Belum ada Meta connection tersimpan untuk didemokan ke reviewer.');
    }

    if (!enrichedConnections.some((connection) => getConnectionSelectionCount(connection) > 0)) {
      blockers.push('Belum ada asset Meta yang dipilih dari connection manapun.');
    }

    if (!enrichedConnections.some((connection) => connection.runtimeBound)) {
      warnings.push('Belum ada connection yang ditetapkan untuk runtime berikutnya. Hal ini tidak mengubah konfigurasi aktif saat ini, namun perlu dijelaskan dalam alur verifikasi.');
    }

    if (!runtimeConfig.metaWriteApprovalRequired) {
      warnings.push('Meta write approval sedang nonaktif. Untuk narasi review, lebih kuat bila guardrail approval tetap aktif.');
    }

    if (metaCredential && metaCredential.isValid === false) {
      warnings.push(`Credential Meta utama sedang invalid${metaCredential.invalidReason ? ` (${metaCredential.invalidReason})` : ''}. Review readiness akan lebih kuat setelah credential state kembali valid.`);
    }

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      dashboard: {
        authEnabled: runtimeConfig.dashboardAuthEnabled,
        username: runtimeConfig.dashboardUsername,
        secureCookie: runtimeConfig.dashboardCookieSecure,
        sessionTtlSeconds: runtimeConfig.dashboardSessionTtlSeconds,
        loginMaxAttempts: runtimeConfig.dashboardLoginMaxAttempts,
        loginBlockMinutes: runtimeConfig.dashboardLoginBlockMinutes,
        passwordConfigured: runtimeConfig.dashboardPasswordHashConfigured
      },
      providers: {
        meta: {
          tokenConfigured: runtimeConfig.metaAccessTokenConfigured,
          adAccountId: runtimeConfig.metaAdAccountId,
          writeEnabled: runtimeConfig.metaWriteEnabled,
          writeApprovalRequired: runtimeConfig.metaWriteApprovalRequired,
          appId: runtimeConfig.metaAppId,
          appSecretConfigured: runtimeConfig.metaAppSecretConfigured,
          oauthRedirectUri: runtimeConfig.metaOAuthRedirectUri,
          graphApiVersion: runtimeConfig.metaGraphApiVersion,
          credentialState: metaCredential,
          connections: enrichedConnections
        },
        kie: {
          apiKeyConfigured: runtimeConfig.kieApiKeyConfigured,
          callbackUrl: runtimeConfig.kieCallbackUrl,
          credentialState: kieCredential
        }
      },
      reviewReadiness: {
        summary: {
          readyItems: 6 - blockers.length,
          totalItems: 6,
          blockerCount: blockers.length,
          warningCount: warnings.length
        },
        blockers,
        warnings,
        docs: {
          privacyPolicyDraft: 'projects/meta-ads-dev/META-PRIVACY-POLICY-DRAFT.md',
          termsOfServiceDraft: 'projects/meta-ads-dev/META-TERMS-OF-SERVICE-DRAFT.md',
          dataDeletionDraft: 'projects/meta-ads-dev/META-DATA-DELETION-DRAFT.md',
          reviewerNotesDraft: 'projects/meta-ads-dev/META-REVIEWER-NOTES-DRAFT.md',
          scopeRequestDraft: 'projects/meta-ads-dev/META-SCOPE-REQUEST-DRAFT.md',
          demoScriptDraft: 'projects/meta-ads-dev/META-DEMO-SCRIPT-DRAFT.md',
          checklist: 'projects/meta-ads-dev/META-APP-REVIEW-CHECKLIST.md',
          publicPrivacyUrl: '/privacy',
          publicTermsUrl: '/terms'
        },
        scopePositioning: 'Posisi capability saat ini: hubungkan asset Meta, pilih asset yang relevan, lalu tetapkan satu koneksi aktif untuk tahap operasional berikutnya. Hindari klaim native simultaneous multi-account runtime sampai arsitektur mendukung penuh.'
      },
      credentials,
      restartRequired: true,
      note: 'Perubahan config disimpan ke .env runtime. Restart service diperlukan agar seluruh perubahan env dipakai proses server aktif.'
    };
  }

  async updateSettings(input: DashboardSettingsUpdateInput & { actor?: string | undefined; reason?: string | undefined }) {
    const nextConfig = await updateDashboardRuntimeConfig(input);

    await this.auditRepository.create({
      operationType: 'dashboard.settings.update',
      actor: input.actor ?? 'dashboard',
      targetType: 'dashboard-settings',
      targetId: 'runtime-env',
      status: 'success',
      reason: input.reason ?? 'Dashboard settings updated from dashboard UI',
      afterState: {
        dashboardUsername: nextConfig.dashboardUsername,
        dashboardAuthEnabled: nextConfig.dashboardAuthEnabled,
        dashboardCookieSecure: nextConfig.dashboardCookieSecure,
        dashboardSessionTtlSeconds: nextConfig.dashboardSessionTtlSeconds,
        dashboardLoginMaxAttempts: nextConfig.dashboardLoginMaxAttempts,
        dashboardLoginBlockMinutes: nextConfig.dashboardLoginBlockMinutes,
        metaAdAccountId: nextConfig.metaAdAccountId,
        metaWriteEnabled: nextConfig.metaWriteEnabled,
        metaWriteApprovalRequired: nextConfig.metaWriteApprovalRequired,
        metaAppId: nextConfig.metaAppId,
        metaAppSecretConfigured: nextConfig.metaAppSecretConfigured,
        metaOAuthRedirectUri: nextConfig.metaOAuthRedirectUri,
        metaGraphApiVersion: nextConfig.metaGraphApiVersion,
        kieCallbackUrl: nextConfig.kieCallbackUrl,
        metaAccessTokenConfigured: nextConfig.metaAccessTokenConfigured,
        kieApiKeyConfigured: nextConfig.kieApiKeyConfigured
      },
      metadata: {
        restartRequired: true,
        tokenUpdated: input.metaAccessToken !== undefined,
        metaAppSecretUpdated: input.metaAppSecret !== undefined,
        kieApiKeyUpdated: input.kieApiKey !== undefined
      }
    });

    return this.getSettings();
  }

  async startMetaOAuth(actor?: string) {
    return this.metaOAuthService.start(actor ?? 'dashboard');
  }

  async completeMetaOAuth(code: string, state: string) {
    return this.metaOAuthService.handleCallback(code, state);
  }

  async saveMetaSelections(input: {
    connectionId: string;
    adAccountIds: string[];
    pageIds: string[];
    pixelIds: string[];
    businessIds: string[];
    primaryAdAccountId?: string | null;
    bindRuntime?: boolean;
  }) {
    return this.metaOAuthService.saveSelections({
      connectionId: input.connectionId,
      bindRuntime: input.bindRuntime,
      selection: {
        adAccountIds: input.adAccountIds,
        pageIds: input.pageIds,
        pixelIds: input.pixelIds,
        businessIds: input.businessIds,
        primaryAdAccountId: input.primaryAdAccountId ?? null
      }
    });
  }

  async unbindMetaConnection(connectionId: string) {
    return this.metaOAuthService.unbindConnection(connectionId);
  }

  async removeMetaConnection(connectionId: string) {
    return this.metaOAuthService.removeConnection(connectionId);
  }

  async duplicateCampaign(campaignId: string, input: {
    reason: string;
    actor?: string | undefined;
    dryRun?: boolean | undefined;
    confirmHighImpact?: boolean | undefined;
    statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    deepCopy?: boolean | undefined;
    startTime?: string | undefined;
    endTime?: string | undefined;
    renameOptions?: Record<string, unknown> | undefined;
    parameterOverrides?: Record<string, unknown> | undefined;
    migrateToAdvantagePlus?: boolean | undefined;
  }) {
    return this.duplicateWriteService.duplicateCampaign({
      reason: input.reason,
      actor: input.actor,
      dryRun: input.dryRun,
      confirmHighImpact: input.confirmHighImpact,
      draft: {
        sourceCampaignId: campaignId,
        statusOption: input.statusOption,
        deepCopy: input.deepCopy,
        startTime: input.startTime,
        endTime: input.endTime,
        renameOptions: input.renameOptions,
        parameterOverrides: input.parameterOverrides,
        migrateToAdvantagePlus: input.migrateToAdvantagePlus
      }
    });
  }

  async duplicateCampaignTree(campaignId: string, input: {
    reason: string;
    actor?: string | undefined;
    dryRun?: boolean | undefined;
    confirmHighImpact?: boolean | undefined;
    statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    includeAds?: boolean | undefined;
    cleanupOnFailure?: boolean | undefined;
    namePrefix?: string | undefined;
    nameSuffix?: string | undefined;
  }) {
    return this.duplicateTreeService.duplicateTree({
      reason: input.reason,
      actor: input.actor,
      dryRun: input.dryRun,
      confirmHighImpact: input.confirmHighImpact,
      draft: {
        sourceCampaignId: campaignId,
        statusOption: input.statusOption,
        includeAds: input.includeAds,
        cleanupOnFailure: input.cleanupOnFailure,
        namePrefix: input.namePrefix,
        nameSuffix: input.nameSuffix
      }
    });
  }

  async deleteCampaign(campaignId: string, input: {
    reason: string;
    actor?: string | undefined;
    dryRun?: boolean | undefined;
  }) {
    return this.cleanupService.deleteCampaign({
      targetId: campaignId,
      reason: input.reason,
      actor: input.actor,
      dryRun: input.dryRun
    });
  }

  async duplicateAdSet(adSetId: string, input: {
    reason: string;
    actor?: string | undefined;
    dryRun?: boolean | undefined;
    confirmHighImpact?: boolean | undefined;
    targetCampaignId?: string | undefined;
    statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    deepCopy?: boolean | undefined;
    createDcoAdSet?: boolean | undefined;
    startTime?: string | undefined;
    endTime?: string | undefined;
    renameOptions?: Record<string, unknown> | undefined;
  }) {
    return this.duplicateWriteService.duplicateAdSet({
      reason: input.reason,
      actor: input.actor,
      dryRun: input.dryRun,
      confirmHighImpact: input.confirmHighImpact,
      draft: {
        sourceAdSetId: adSetId,
        targetCampaignId: input.targetCampaignId,
        statusOption: input.statusOption,
        deepCopy: input.deepCopy,
        createDcoAdSet: input.createDcoAdSet,
        startTime: input.startTime,
        endTime: input.endTime,
        renameOptions: input.renameOptions
      }
    });
  }

  async deleteAdSet(adSetId: string, input: {
    reason: string;
    actor?: string | undefined;
    dryRun?: boolean | undefined;
  }) {
    return this.cleanupService.deleteAdSet({
      targetId: adSetId,
      reason: input.reason,
      actor: input.actor,
      dryRun: input.dryRun
    });
  }

  async inspectAdPromotability(adId: string, input: {
    targetAdSetId?: string | undefined;
  }) {
    return this.preflightCheckService.inspectAdPromotability({
      adId,
      targetAdSetId: input.targetAdSetId
    });
  }

  async preflightDuplicateAd(adId: string, input: {
    reason: string;
    actor?: string | undefined;
    targetAdSetId?: string | undefined;
    statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    renameOptions?: Record<string, unknown> | undefined;
    creativeParameters?: Record<string, unknown> | undefined;
  }) {
    return this.preflightCheckService.preflightDuplicateAd({
      reason: input.reason,
      actor: input.actor,
      draft: {
        sourceAdId: adId,
        targetAdSetId: input.targetAdSetId,
        statusOption: input.statusOption,
        renameOptions: input.renameOptions,
        creativeParameters: input.creativeParameters
      }
    });
  }

  async duplicateAd(adId: string, input: {
    reason: string;
    actor?: string | undefined;
    dryRun?: boolean | undefined;
    confirmHighImpact?: boolean | undefined;
    targetAdSetId?: string | undefined;
    statusOption?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    renameOptions?: Record<string, unknown> | undefined;
    creativeParameters?: Record<string, unknown> | undefined;
  }) {
    return this.duplicateWriteService.duplicateAd({
      reason: input.reason,
      actor: input.actor,
      dryRun: input.dryRun,
      confirmHighImpact: input.confirmHighImpact,
      draft: {
        sourceAdId: adId,
        targetAdSetId: input.targetAdSetId,
        statusOption: input.statusOption,
        renameOptions: input.renameOptions,
        creativeParameters: input.creativeParameters
      }
    });
  }

  async generateCreative(input: DashboardCreativeGenerateInput) {
    const actor = input.actor ?? 'dashboard';

    if (input.assetType === 'image') {
      const result = await this.imageGenerationService.createImageGenerationTask({
        providerPayload: input.image?.providerPayload ?? {},
        templateVersion: input.image?.templateVersion,
        callbackUrl: input.image?.callbackUrl,
        enqueuePolling: input.image?.enqueuePolling ?? true,
        dryRun: input.image?.dryRun ?? false,
        actor,
        reason: input.reason
      });

      if (result.ok && result.mode === 'live' && result.queueSuggestion) {
        await enqueueKieImagePollJob(result.queueSuggestion);
      }

      return {
        ok: true,
        assetType: 'image',
        result
      };
    }

    const result = await this.videoGenerationService.createRunwayVideoTask({
      prompt: input.video?.prompt ?? '',
      imageAssetId: input.video?.imageAssetId,
      imageUrl: input.video?.imageUrl,
      durationSeconds: input.video?.durationSeconds,
      quality: input.video?.quality,
      aspectRatio: input.video?.aspectRatio,
      templateVersion: input.video?.templateVersion,
      callbackUrl: input.video?.callbackUrl,
      enqueuePolling: input.video?.enqueuePolling ?? true,
      dryRun: input.video?.dryRun ?? false,
      actor,
      reason: input.reason
    });

    if (result.ok && result.mode === 'live' && result.queueSuggestion) {
      await enqueueKieRunwayVideoPollJob(result.queueSuggestion);
    }

    return {
      ok: true,
      assetType: 'video',
      result
    };
  }

  async deleteCreativeAsset(assetId: string, actor = 'dashboard') {
    const existing = await this.assetLibraryRepository.findById(assetId);
    if (!existing) {
      return null;
    }

    const deleted = await this.assetLibraryRepository.deleteById(assetId);

    if (deleted) {
      await this.auditRepository.create({
        operationType: 'asset.library.delete',
        actor,
        targetType: 'asset-library',
        targetId: assetId,
        status: 'success',
        reason: 'Deleted from dashboard creative library',
        beforeState: {
          assetType: existing.assetType,
          provider: existing.provider,
          title: existing.title,
          status: existing.status,
          providerAssetId: existing.providerAssetId,
          originalUrl: existing.originalUrl
        }
      });
    }

    return deleted;
  }
}
