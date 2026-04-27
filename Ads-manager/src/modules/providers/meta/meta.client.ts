import { open } from 'node:fs/promises';
import { configService } from '../../../config/settings.js';
import { AppError } from '../../../lib/errors.js';
import { type HttpBody, httpJson } from '../../../lib/http.js';
import { AuditRepository } from '../../foundation/audit/audit.repository.js';
import { CredentialsStateRepository } from '../../foundation/credentials/credentials.repository.js';
import { ProviderRequestLogRepository } from '../../foundation/provider-logs/provider-request-log.repository.js';
import { mapMetaError } from '../shared/provider-errors.js';
import { sanitizeProviderPayload } from '../shared/provider-sanitize.js';
import type {
  MetaAdAccountBasic,
  MetaAdCreativeDetail,
  MetaAdRuleHistoryEntry,
  MetaAdRuleSummary,
  MetaAdSetSummary,
  MetaAdSummary,
  MetaAudienceSummary,
  MetaAdVideoUploadResponse,
  MetaApiErrorShape,
  MetaCampaignSummary,
  MetaCopyResult,
  MetaInsightsSummary,
  MetaListResponse,
  MetaPageSummary,
  MetaRequestContext,
  MetaRuleWriteResult,
  MetaVideoDetail,
  MetaWriteResult
} from './meta.types.js';

function getMetaGraphBaseUrl(version: string) {
  return `https://graph.facebook.com/${version}`;
}

function getMetaGraphVideoBaseUrl(version: string) {
  return `https://graph-video.facebook.com/${version}`;
}
const META_INSIGHTS_FIELDS = [
  'spend',
  'impressions',
  'reach',
  'clicks',
  'ctr',
  'cpc',
  'actions',
  'cost_per_action_type'
].join(',');

function withInsights(fields: string[], datePreset = 'last_30d') {
  return [...fields, `insights.date_preset(${datePreset}){${META_INSIGHTS_FIELDS}}`].join(',');
}

interface MetaRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: HttpBody;
  headers?: Record<string, string>;
  baseUrl?: string;
  logPayload?: unknown;
}

export class MetaClient {
  private readonly credentialsRepository = new CredentialsStateRepository();
  private readonly requestLogRepository = new ProviderRequestLogRepository();
  private readonly auditRepository = new AuditRepository();

  private async resolveAccountId(accountId?: string | null) {
    const resolved = accountId ?? await configService.getMetaAccountId();
    return resolved ?? undefined;
  }

  private async request<T>(
    path: string,
    context: MetaRequestContext = {},
    options: MetaRequestOptions = {},
    operationType: 'meta.read' | 'meta.write' = 'meta.read'
  ) {
    const metaAccessToken = await configService.getMetaAccessToken();
    const metaAccountId = await configService.getMetaAccountId();
    const graphVersion = await configService.getMetaGraphApiVersion();

    if (!metaAccessToken) {
      await this.credentialsRepository.setState({
        provider: 'meta',
        subject: metaAccountId ?? 'default',
        isValid: false,
        invalidReason: 'META_ACCESS_TOKEN is not configured'
      });

      await this.auditRepository.create({
        operationType,
        actor: 'system',
        targetType: context.objectType ?? 'meta-resource',
        targetId: context.objectId ?? path,
        status: 'failed',
        reason: 'META_ACCESS_TOKEN is not configured',
        metadata: {
          endpoint: path,
          normalizedErrorCode: 'AUTH_INVALID',
          method: options.method ?? 'GET'
        }
      });

      throw new AppError('META_ACCESS_TOKEN is not configured', 'AUTH_INVALID', 500);
    }

    const url = new URL(`${options.baseUrl ?? getMetaGraphBaseUrl(graphVersion)}${path}`);
    url.searchParams.set('access_token', metaAccessToken);

    const requestOptions = {
      method: options.method ?? 'GET',
      ...(options.headers ? { headers: options.headers } : {}),
      ...(options.body === undefined ? {} : { body: options.body })
    };

    const response = await httpJson<T & MetaApiErrorShape>(url.toString(), requestOptions);
    const safeData = sanitizeProviderPayload(response.data);
    const loggedPayload = options.logPayload ?? (
      options.body instanceof URLSearchParams
        ? Object.fromEntries(options.body.entries())
        : options.body instanceof FormData
          ? { type: 'form-data' }
          : options.body
    );

    await this.requestLogRepository.create({
      requestId: response.requestId,
      provider: 'meta',
      endpoint: path,
      method: options.method ?? 'GET',
      statusCode: response.status,
      objectType: context.objectType,
      objectId: context.objectId,
      payload: loggedPayload,
      responseBody: safeData
    });

    if (!String(response.status).startsWith('2')) {
      const error = mapMetaError(response.status, safeData);

      await this.credentialsRepository.setState({
        provider: 'meta',
        subject: metaAccountId ?? 'default',
        isValid: false,
        invalidReason: error.message
      });

      await this.auditRepository.create({
        operationType,
        actor: 'system',
        targetType: context.objectType ?? 'meta-resource',
        targetId: context.objectId ?? path,
        status: 'failed',
        reason: error.message,
        metadata: {
          endpoint: path,
          requestId: response.requestId,
          normalizedErrorCode: error.code,
          statusCode: response.status,
          method: options.method ?? 'GET'
        }
      });

      throw error;
    }

    await this.credentialsRepository.setState({
      provider: 'meta',
      subject: metaAccountId ?? 'default',
      isValid: true,
      invalidReason: null
    });

    await this.auditRepository.create({
      operationType,
      actor: 'system',
      targetType: context.objectType ?? 'meta-resource',
      targetId: context.objectId ?? path,
      status: 'success',
      metadata: {
        endpoint: path,
        requestId: response.requestId,
        statusCode: response.status,
        method: options.method ?? 'GET'
      }
    });

    return {
      ...response,
      data: safeData
    };
  }

  async get<T>(path: string, context: MetaRequestContext = {}) {
    return this.request<T>(path, context, { method: 'GET' }, 'meta.read');
  }

  async paginateList<T>(path: string, context: MetaRequestContext = {}) {
    let currentPath = path;
    const items: T[] = [];
    let latestPaging: Record<string, unknown> | undefined;

    while (true) {
      const response = await this.get<MetaListResponse<T>>(currentPath, context);
      
      if (response.data.data && Array.isArray(response.data.data)) {
        items.push(...response.data.data);
      }

      latestPaging = response.data.paging as Record<string, unknown> | undefined;
      const nextUrl = response.data.paging?.next;

      if (!nextUrl) {
        break;
      }

      // Extract the path and query from the next URL
      const urlObj = new URL(nextUrl);
      currentPath = urlObj.pathname.replace(/^\/v[0-9.]+/, '') + urlObj.search;
    }

    return {
      data: items,
      paging: latestPaging
    };
  }

  async post<T>(path: string, body: HttpBody, context: MetaRequestContext = {}) {
    return this.request<T>(path, context, { method: 'POST', body }, 'meta.write');
  }

  async delete<T>(path: string, context: MetaRequestContext = {}) {
    return this.request<T>(path, context, { method: 'DELETE' }, 'meta.write');
  }

  async probe() {
    return this.get<{ id: string; name?: string }>('/me?fields=id,name', {
      objectType: 'meta-user',
      objectId: 'me'
    });
  }

  async getAdAccountBasic(accountId?: string) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    return this.get<MetaAdAccountBasic>(`/act_${accountId}?fields=id,account_id,name,account_status,currency`, {
      objectType: 'ad-account',
      objectId: accountId
    });
  }

  async listCampaigns(limit = 25, accountId?: string) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const fields = withInsights([
      'id',
      'name',
      'objective',
      'status',
      'effective_status',
      'buying_type',
      'daily_budget',
      'lifetime_budget',
      'start_time',
      'stop_time',
      'updated_time'
    ]);

    return this.paginateList<MetaCampaignSummary>(`/act_${accountId}/campaigns?fields=${encodeURIComponent(fields)}&limit=${limit}`, {
      objectType: 'campaign-list',
      objectId: accountId
    });
  }

  async getCampaign(campaignId: string) {
    const fields = withInsights([
      'id',
      'name',
      'objective',
      'status',
      'effective_status',
      'buying_type',
      'daily_budget',
      'lifetime_budget',
      'start_time',
      'stop_time',
      'updated_time'
    ]);

    return this.get<MetaCampaignSummary>(`/${campaignId}?fields=${encodeURIComponent(fields)}`, {
      objectType: 'campaign',
      objectId: campaignId
    });
  }

  async listAdSets(limit = 25, accountId?: string) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const fields = withInsights([
      'id',
      'campaign_id',
      'name',
      'status',
      'effective_status',
      'daily_budget',
      'lifetime_budget',
      'billing_event',
      'optimization_goal',
      'bid_strategy',
      'start_time',
      'end_time',
      'updated_time'
    ]);

    return this.paginateList<MetaAdSetSummary>(`/act_${accountId}/adsets?fields=${encodeURIComponent(fields)}&limit=${limit}`, {
      objectType: 'adset-list',
      objectId: accountId
    });
  }

  async getAdSet(adSetId: string) {
    const fields = withInsights([
      'id',
      'campaign_id',
      'name',
      'status',
      'effective_status',
      'daily_budget',
      'lifetime_budget',
      'billing_event',
      'optimization_goal',
      'bid_strategy',
      'start_time',
      'end_time',
      'updated_time'
    ]);

    return this.get<MetaAdSetSummary>(`/${adSetId}?fields=${encodeURIComponent(fields)}`, {
      objectType: 'adset',
      objectId: adSetId
    });
  }

  async listAds(limit = 25, accountId?: string) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const fields = withInsights([
      'id',
      'campaign_id',
      'adset_id',
      'name',
      'status',
      'effective_status',
      'creative{id,name}',
      'updated_time'
    ]);

    return this.paginateList<MetaAdSummary>(`/act_${accountId}/ads?fields=${encodeURIComponent(fields)}&limit=${limit}`, {
      objectType: 'ad-list',
      objectId: accountId
    });
  }

  async listAudiences(limit = 50, accountId?: string) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const fields = [
      'id',
      'name',
      'subtype',
      'description',
      'approximate_count',
      'retention_days',
      'time_created',
      'time_updated',
      'operation_status',
      'delivery_status',
      'lookalike_spec',
      'rule'
    ].join(',');

    return this.paginateList<MetaAudienceSummary>(`/act_${accountId}/customaudiences?fields=${encodeURIComponent(fields)}&limit=${limit}`, {
      objectType: 'audience-list',
      objectId: accountId
    });
  }

  async listRules(limit = 25, accountId?: string) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const fields = [
      'id',
      'name',
      'status',
      'evaluation_spec',
      'execution_spec',
      'schedule_spec',
      'created_time',
      'updated_time'
    ].join(',');

    return this.paginateList<MetaAdRuleSummary>(`/act_${accountId}/adrules_library?fields=${encodeURIComponent(fields)}&limit=${limit}`, {
      objectType: 'rule-list',
      objectId: accountId
    });
  }

  async listRuleHistory(limit = 25, accountId?: string) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const fields = [
      'id',
      'rule_id',
      'ad_rule_id',
      'created_time',
      'updated_time',
      'evaluation_spec',
      'execution_spec',
      'schedule_spec'
    ].join(',');

    return this.paginateList<MetaAdRuleHistoryEntry>(`/act_${accountId}/adrules_history?fields=${encodeURIComponent(fields)}&limit=${limit}`, {
      objectType: 'rule-history-list',
      objectId: accountId
    });
  }

  async getRule(ruleId: string) {
    const fields = [
      'id',
      'name',
      'status',
      'evaluation_spec',
      'execution_spec',
      'schedule_spec',
      'created_time',
      'updated_time'
    ].join(',');

    return this.get<MetaAdRuleSummary>(`/${ruleId}?fields=${encodeURIComponent(fields)}`, {
      objectType: 'rule',
      objectId: ruleId
    });
  }

  async getAd(adId: string) {
    const fields = withInsights([
      'id',
      'campaign_id',
      'adset_id',
      'name',
      'status',
      'effective_status',
      'creative{id,name}',
      'updated_time'
    ]);

    return this.get<MetaAdSummary>(`/${adId}?fields=${encodeURIComponent(fields)}`, {
      objectType: 'ad',
      objectId: adId
    });
  }

  async fetchObjectInsights(
    objectId: string,
    window:
      | { datePreset: string }
      | { since: string; until: string }
  ) {
    const params = new URLSearchParams();
    params.set('fields', META_INSIGHTS_FIELDS);
    if ('datePreset' in window) {
      params.set('date_preset', window.datePreset);
    } else {
      params.set('time_range', JSON.stringify({ since: window.since, until: window.until }));
    }

    return this.get<MetaListResponse<MetaInsightsSummary>>(
      `/${objectId}/insights?${params.toString()}`,
      { objectType: 'insights', objectId }
    );
  }

  async getAudience(audienceId: string) {
    const fields = [
      'id',
      'name',
      'subtype',
      'description',
      'approximate_count',
      'retention_days',
      'time_created',
      'time_updated',
      'operation_status',
      'delivery_status',
      'lookalike_spec',
      'rule'
    ].join(',');

    return this.get<MetaAudienceSummary>(`/${audienceId}?fields=${encodeURIComponent(fields)}`, {
      objectType: 'audience',
      objectId: audienceId
    });
  }

  async getAdCreative(creativeId: string) {
    const fields = [
      'id',
      'name',
      'object_type',
      'image_url',
      'thumbnail_url',
      'object_story_spec'
    ].join(',');

    return this.get<MetaAdCreativeDetail>(`/${creativeId}?fields=${encodeURIComponent(fields)}`, {
      objectType: 'ad-creative',
      objectId: creativeId
    });
  }

  async getPage(pageId: string) {
    const fields = [
      'id',
      'name',
      'link',
      'category',
      'verification_status',
      'can_post',
      'is_published'
    ].join(',');

    return this.get<MetaPageSummary>(`/${pageId}?fields=${encodeURIComponent(fields)}`, {
      objectType: 'page',
      objectId: pageId
    });
  }

  async getVideo(videoId: string) {
    const fields = [
      'id',
      'source',
      'picture',
      'length',
      'title',
      'status'
    ].join(',');

    return this.get<MetaVideoDetail>(`/${videoId}?fields=${encodeURIComponent(fields)}`, {
      objectType: 'video',
      objectId: videoId
    });
  }

  async uploadAdVideoFromFile(
    input: {
      filePath: string;
      title?: string | undefined;
      waitForReady?: boolean | undefined;
      pollIntervalMs?: number | undefined;
      timeoutMs?: number | undefined;
    },
    accountId?: string
  ) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const fileHandle = await open(input.filePath, 'r');

    try {
      const stats = await fileHandle.stat();
      const title = input.title?.trim() || 'meta-video-upload';
      const waitForReady = input.waitForReady ?? true;
      const pollIntervalMs = input.pollIntervalMs ?? 3_000;
      const timeoutMs = input.timeoutMs ?? 180_000;

      const startResponse = await this.request<MetaAdVideoUploadResponse>(`/act_${accountId}/advideos`, {
        objectType: 'video-upload-start',
        objectId: accountId
      }, {
        method: 'POST',
        baseUrl: getMetaGraphVideoBaseUrl(await configService.getMetaGraphApiVersion()),
        body: new URLSearchParams({
          upload_phase: 'start',
          file_size: String(stats.size)
        })
      }, 'meta.write');

      const uploadSessionId = startResponse.data.upload_session_id;
      const videoId = startResponse.data.video_id;
      let startOffset = Number.parseInt(startResponse.data.start_offset ?? '0', 10);
      let endOffset = Number.parseInt(startResponse.data.end_offset ?? '0', 10);

      if (!uploadSessionId || !videoId || Number.isNaN(startOffset) || Number.isNaN(endOffset)) {
        throw new AppError('Meta video upload session did not return the expected identifiers', 'REMOTE_TEMPORARY_FAILURE', 502, {
          response: startResponse.data
        });
      }

      while (startOffset !== endOffset) {
        const chunkSize = endOffset - startOffset;
        const buffer = Buffer.alloc(chunkSize);
        const { bytesRead } = await fileHandle.read(buffer, 0, chunkSize, startOffset);
        const chunk = buffer.subarray(0, bytesRead);
        const formData = new FormData();
        formData.set('upload_phase', 'transfer');
        formData.set('start_offset', String(startOffset));
        formData.set('upload_session_id', uploadSessionId);
        formData.set('video_file_chunk', new Blob([chunk]), title.replace(/\s+/g, '-'));

        const transferResponse = await this.request<MetaAdVideoUploadResponse>(`/act_${accountId}/advideos`, {
          objectType: 'video-upload-transfer',
          objectId: videoId
        }, {
          method: 'POST',
          baseUrl: getMetaGraphVideoBaseUrl(await configService.getMetaGraphApiVersion()),
          body: formData,
          logPayload: {
            upload_phase: 'transfer',
            start_offset: String(startOffset),
            upload_session_id: uploadSessionId,
            chunkBytes: bytesRead
          }
        }, 'meta.write');

        startOffset = Number.parseInt(transferResponse.data.start_offset ?? String(endOffset), 10);
        endOffset = Number.parseInt(transferResponse.data.end_offset ?? String(endOffset), 10);

        if (Number.isNaN(startOffset) || Number.isNaN(endOffset)) {
          throw new AppError('Meta video upload transfer returned invalid offsets', 'REMOTE_TEMPORARY_FAILURE', 502, {
            response: transferResponse.data
          });
        }
      }

      await this.request<MetaAdVideoUploadResponse>(`/act_${accountId}/advideos`, {
        objectType: 'video-upload-finish',
        objectId: videoId
      }, {
        method: 'POST',
        baseUrl: getMetaGraphVideoBaseUrl(await configService.getMetaGraphApiVersion()),
        body: new URLSearchParams({
          upload_phase: 'finish',
          upload_session_id: uploadSessionId,
          title
        })
      }, 'meta.write');

      const readyVideo = waitForReady
        ? await this.waitForVideoReady(videoId, pollIntervalMs, timeoutMs)
        : await this.getVideo(videoId);

      return {
        requestId: startResponse.requestId,
        status: startResponse.status,
        data: {
          video_id: videoId,
          upload_session_id: uploadSessionId,
          video: readyVideo.data
        }
      };
    } finally {
      await fileHandle.close();
    }
  }

  async waitForVideoReady(videoId: string, pollIntervalMs = 3_000, timeoutMs = 180_000) {
    const startedAt = Date.now();

    while (true) {
      const video = await this.getVideo(videoId);
      const videoStatus = video.data.status?.video_status?.toLowerCase() ?? null;

      if (!videoStatus || videoStatus === 'ready') {
        return video;
      }

      if (videoStatus !== 'processing' && videoStatus !== 'uploading') {
        throw new AppError(`Meta video is not ready yet (status: ${videoStatus})`, 'REMOTE_TEMPORARY_FAILURE', 409, {
          videoId,
          video: video.data
        });
      }

      if (Date.now() - startedAt >= timeoutMs) {
        throw new AppError('Timed out waiting for Meta video encoding to finish', 'REMOTE_TEMPORARY_FAILURE', 504, {
          videoId,
          timeoutMs,
          video: video.data
        });
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  async createAd(
    payload: {
      name: string;
      adset_id: string;
      status: 'ACTIVE' | 'PAUSED';
      creative: {
        creative_id: string;
      };
      tracking_specs?: Record<string, unknown>[] | undefined;
    },
    accountId?: string
  ) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const body = new URLSearchParams({
      name: payload.name,
      adset_id: payload.adset_id,
      status: payload.status,
      creative: JSON.stringify(payload.creative),
      ...(payload.tracking_specs ? { tracking_specs: JSON.stringify(payload.tracking_specs) } : {})
    });

    return this.post<MetaWriteResult>(`/act_${accountId}/ads`, body, {
      objectType: 'ad-create',
      objectId: accountId
    });
  }

  async createAdCreative(
    payload: {
      name?: string | undefined;
      object_story_spec: Record<string, unknown>;
    },
    accountId?: string
  ) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const body = new URLSearchParams({
      ...(payload.name ? { name: payload.name } : {}),
      object_story_spec: JSON.stringify(payload.object_story_spec)
    });

    return this.post<MetaWriteResult>(`/act_${accountId}/adcreatives`, body, {
      objectType: 'adcreative-create',
      objectId: accountId
    });
  }

  async updateCampaignStatus(campaignId: string, status: 'ACTIVE' | 'PAUSED') {
    const body = new URLSearchParams({ status });
    return this.post<MetaWriteResult>(`/${campaignId}`, body, {
      objectType: 'campaign',
      objectId: campaignId
    });
  }

  async updateCampaignName(campaignId: string, name: string) {
    const body = new URLSearchParams({ name });
    return this.post<MetaWriteResult>(`/${campaignId}`, body, {
      objectType: 'campaign-rename',
      objectId: campaignId
    });
  }

  async updateAdSetName(adSetId: string, name: string) {
    const body = new URLSearchParams({ name });
    return this.post<MetaWriteResult>(`/${adSetId}`, body, {
      objectType: 'adset-rename',
      objectId: adSetId
    });
  }

  async updateAdSetStatus(adSetId: string, status: 'ACTIVE' | 'PAUSED') {
    const body = new URLSearchParams({ status });
    return this.post<MetaWriteResult>(`/${adSetId}`, body, {
      objectType: 'adset',
      objectId: adSetId
    });
  }

  async updateAdStatus(adId: string, status: 'ACTIVE' | 'PAUSED') {
    const body = new URLSearchParams({ status });
    return this.post<MetaWriteResult>(`/${adId}`, body, {
      objectType: 'ad',
      objectId: adId
    });
  }

  async updateAdName(adId: string, name: string) {
    const body = new URLSearchParams({ name });
    return this.post<MetaWriteResult>(`/${adId}`, body, {
      objectType: 'ad-rename',
      objectId: adId
    });
  }

  async updateAudience(
    audienceId: string,
    payload: {
      name?: string | undefined;
      description?: string | undefined;
      retentionDays?: number | undefined;
    }
  ) {
    const body = new URLSearchParams({
      ...(payload.name ? { name: payload.name } : {}),
      ...(payload.description ? { description: payload.description } : {}),
      ...(typeof payload.retentionDays === 'number' ? { retention_days: String(payload.retentionDays) } : {})
    });

    return this.post<MetaWriteResult>(`/${audienceId}`, body, {
      objectType: 'audience',
      objectId: audienceId
    });
  }

  async updateCampaignDailyBudget(campaignId: string, dailyBudget: number) {
    const body = new URLSearchParams({ daily_budget: String(dailyBudget) });
    return this.post<MetaWriteResult>(`/${campaignId}`, body, {
      objectType: 'campaign-budget',
      objectId: campaignId
    });
  }

  async updateAdSetDailyBudget(adSetId: string, dailyBudget: number) {
    const body = new URLSearchParams({ daily_budget: String(dailyBudget) });
    return this.post<MetaWriteResult>(`/${adSetId}`, body, {
      objectType: 'adset-budget',
      objectId: adSetId
    });
  }

  async createCampaign(
    payload: {
      name: string;
      objective: string;
      status: 'ACTIVE' | 'PAUSED';
      buying_type?: string | undefined;
      is_adset_budget_sharing_enabled?: boolean | undefined;
      special_ad_categories: string[];
    },
    accountId?: string
  ) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const body = new URLSearchParams({
      name: payload.name,
      objective: payload.objective,
      status: payload.status,
      is_adset_budget_sharing_enabled: String(payload.is_adset_budget_sharing_enabled ?? false),
      special_ad_categories: JSON.stringify(payload.special_ad_categories),
      ...(payload.buying_type ? { buying_type: payload.buying_type } : {})
    });

    return this.post<MetaWriteResult>(`/act_${accountId}/campaigns`, body, {
      objectType: 'campaign-create',
      objectId: accountId
    });
  }

  async createAdSet(
    payload: {
      name: string;
      campaign_id: string;
      billing_event: string;
      optimization_goal: string;
      status: 'ACTIVE' | 'PAUSED';
      targeting: Record<string, unknown>;
      daily_budget?: number | undefined;
      lifetime_budget?: number | undefined;
      promoted_object?: Record<string, unknown> | undefined;
      bid_strategy?: string | undefined;
      bid_amount?: number | undefined;
      start_time?: string | undefined;
      end_time?: string | undefined;
    },
    accountId?: string
  ) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const body = new URLSearchParams({
      name: payload.name,
      campaign_id: payload.campaign_id,
      billing_event: payload.billing_event,
      optimization_goal: payload.optimization_goal,
      status: payload.status,
      targeting: JSON.stringify(payload.targeting),
      ...(payload.daily_budget ? { daily_budget: String(payload.daily_budget) } : {}),
      ...(payload.lifetime_budget ? { lifetime_budget: String(payload.lifetime_budget) } : {}),
      ...(payload.promoted_object ? { promoted_object: JSON.stringify(payload.promoted_object) } : {}),
      ...(payload.bid_strategy ? { bid_strategy: payload.bid_strategy } : {}),
      ...(payload.bid_amount ? { bid_amount: String(payload.bid_amount) } : {}),
      ...(payload.start_time ? { start_time: payload.start_time } : {}),
      ...(payload.end_time ? { end_time: payload.end_time } : {})
    });

    return this.post<MetaWriteResult>(`/act_${accountId}/adsets`, body, {
      objectType: 'adset-create',
      objectId: accountId
    });
  }

  async copyCampaign(
    campaignId: string,
    payload: {
      deep_copy?: boolean | undefined;
      end_time?: string | undefined;
      migrate_to_advantage_plus?: boolean | undefined;
      parameter_overrides?: Record<string, unknown> | undefined;
      rename_options?: Record<string, unknown> | undefined;
      start_time?: string | undefined;
      status_option?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    }
  ) {
    const body = new URLSearchParams({
      ...(typeof payload.deep_copy === 'boolean' ? { deep_copy: String(payload.deep_copy) } : {}),
      ...(payload.end_time ? { end_time: payload.end_time } : {}),
      ...(typeof payload.migrate_to_advantage_plus === 'boolean' ? { migrate_to_advantage_plus: String(payload.migrate_to_advantage_plus) } : {}),
      ...(payload.parameter_overrides ? { parameter_overrides: JSON.stringify(payload.parameter_overrides) } : {}),
      ...(payload.rename_options ? { rename_options: JSON.stringify(payload.rename_options) } : {}),
      ...(payload.start_time ? { start_time: payload.start_time } : {}),
      ...(payload.status_option ? { status_option: payload.status_option } : {})
    });

    return this.post<MetaCopyResult>(`/${campaignId}/copies`, body, {
      objectType: 'campaign-copy',
      objectId: campaignId
    });
  }

  async copyAdSet(
    adSetId: string,
    payload: {
      campaign_id?: string | undefined;
      create_dco_adset?: boolean | undefined;
      deep_copy?: boolean | undefined;
      end_time?: string | undefined;
      rename_options?: Record<string, unknown> | undefined;
      start_time?: string | undefined;
      status_option?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    }
  ) {
    const body = new URLSearchParams({
      ...(payload.campaign_id ? { campaign_id: payload.campaign_id } : {}),
      ...(typeof payload.create_dco_adset === 'boolean' ? { create_dco_adset: String(payload.create_dco_adset) } : {}),
      ...(typeof payload.deep_copy === 'boolean' ? { deep_copy: String(payload.deep_copy) } : {}),
      ...(payload.end_time ? { end_time: payload.end_time } : {}),
      ...(payload.rename_options ? { rename_options: JSON.stringify(payload.rename_options) } : {}),
      ...(payload.start_time ? { start_time: payload.start_time } : {}),
      ...(payload.status_option ? { status_option: payload.status_option } : {})
    });

    return this.post<MetaCopyResult>(`/${adSetId}/copies`, body, {
      objectType: 'adset-copy',
      objectId: adSetId
    });
  }

  async copyAd(
    adId: string,
    payload: {
      adset_id?: string | undefined;
      creative_parameters?: Record<string, unknown> | undefined;
      rename_options?: Record<string, unknown> | undefined;
      status_option?: 'ACTIVE' | 'PAUSED' | 'INHERITED_FROM_SOURCE' | undefined;
    }
  ) {
    const body = new URLSearchParams({
      ...(payload.adset_id ? { adset_id: payload.adset_id } : {}),
      ...(payload.creative_parameters ? { creative_parameters: JSON.stringify(payload.creative_parameters) } : {}),
      ...(payload.rename_options ? { rename_options: JSON.stringify(payload.rename_options) } : {}),
      ...(payload.status_option ? { status_option: payload.status_option } : {})
    });

    return this.post<MetaCopyResult>(`/${adId}/copies`, body, {
      objectType: 'ad-copy',
      objectId: adId
    });
  }

  async deleteCampaign(campaignId: string) {
    return this.delete<MetaWriteResult>(`/${campaignId}`, {
      objectType: 'campaign',
      objectId: campaignId
    });
  }

  async deleteAdSet(adSetId: string) {
    return this.delete<MetaWriteResult>(`/${adSetId}`, {
      objectType: 'adset',
      objectId: adSetId
    });
  }

  async deleteAudience(audienceId: string) {
    return this.delete<MetaWriteResult>(`/${audienceId}`, {
      objectType: 'audience',
      objectId: audienceId
    });
  }

  async createRule(
    payload: {
      name: string;
      status: 'ENABLED' | 'DISABLED';
      evaluation_spec: Record<string, unknown>;
      execution_spec: Record<string, unknown>;
      schedule_spec?: Record<string, unknown> | undefined;
    },
    accountId?: string
  ) {
    accountId = await this.resolveAccountId(accountId);
    if (!accountId) {
      throw new AppError('META_AD_ACCOUNT_ID is not configured', 'AUTH_INVALID', 500);
    }

    const body = new URLSearchParams({
      name: payload.name,
      status: payload.status,
      evaluation_spec: JSON.stringify(payload.evaluation_spec),
      execution_spec: JSON.stringify(payload.execution_spec),
      ...(payload.schedule_spec ? { schedule_spec: JSON.stringify(payload.schedule_spec) } : {})
    });

    return this.post<MetaRuleWriteResult>(`/act_${accountId}/adrules_library`, body, {
      objectType: 'rule-create',
      objectId: accountId
    });
  }

  async updateRuleStatus(ruleId: string, status: 'ENABLED' | 'DISABLED') {
    const body = new URLSearchParams({ status });
    return this.post<MetaRuleWriteResult>(`/${ruleId}`, body, {
      objectType: 'rule',
      objectId: ruleId
    });
  }

  async updateRule(
    ruleId: string,
    payload: {
      name: string;
      status: 'ENABLED' | 'DISABLED';
      evaluation_spec: Record<string, unknown>;
      execution_spec: Record<string, unknown>;
      schedule_spec?: Record<string, unknown> | undefined;
    }
  ) {
    const body = new URLSearchParams({
      name: payload.name,
      status: payload.status,
      evaluation_spec: JSON.stringify(payload.evaluation_spec),
      execution_spec: JSON.stringify(payload.execution_spec),
      ...(payload.schedule_spec ? { schedule_spec: JSON.stringify(payload.schedule_spec) } : {})
    });

    return this.post<MetaRuleWriteResult>(`/${ruleId}`, body, {
      objectType: 'rule',
      objectId: ruleId
    });
  }

  async deleteRule(ruleId: string) {
    return this.delete<MetaRuleWriteResult>(`/${ruleId}`, {
      objectType: 'rule',
      objectId: ruleId
    });
  }
}
