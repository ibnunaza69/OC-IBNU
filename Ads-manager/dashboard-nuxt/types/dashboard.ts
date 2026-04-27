export interface DashboardCredentialState {
  id?: string;
  provider: string;
  subject: string;
  isValid: boolean;
  invalidReason?: string | null;
  lastCheckedAt?: string | null;
  updatedAt?: string | null;
}

export interface DashboardJobState {
  jobName: string;
  jobKey?: string | null;
  status: string;
  updatedAt?: string | null;
}

export interface DashboardAuditEntry {
  operationType: string;
  targetType: string;
  targetId: string;
  status: string;
  createdAt?: string | null;
}

export interface DashboardAssetTask {
  assetType: string;
  provider: string;
  taskType: string;
  status: string;
  updatedAt?: string | null;
}

export interface DashboardAssetItem {
  id: string;
  assetType: 'image' | 'video';
  provider: string;
  status: string;
  sourceTaskId?: string | null;
  providerAssetId?: string | null;
  title?: string | null;
  mimeType?: string | null;
  originalUrl?: string | null;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  promptVersion?: string | null;
  metadata?: unknown;
  expiresAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DashboardCopyVariant {
  lineageKey: string;
  versionNumber: number;
  style: string;
  sourceType: string;
  headline: string;
  createdAt?: string | null;
}

export interface DashboardCopyReview {
  reviewMode: string;
  variantId?: string | null;
  overallScore: number;
  createdAt?: string | null;
}

export interface DashboardAnalysisOverview {
  ok?: boolean;
  totals?: {
    campaigns?: number;
    adSets?: number;
    ads?: number;
    activeCampaigns?: number;
    activeAdSets?: number;
    activeAds?: number;
  };
  budgets?: {
    campaignDailyBudgetTotal?: number;
    adSetDailyBudgetTotal?: number;
    currency?: string | null;
  };
  freshness?: {
    accountSyncedAt?: string | null;
    campaignsSyncedAt?: string | null;
    adSetsSyncedAt?: string | null;
    adsSyncedAt?: string | null;
  };
  breakdowns?: Record<string, unknown>;
  integrity?: unknown;
}

export interface DashboardSummaryResponse {
  ok: boolean;
  generatedAt: string;
  dashboard: {
    authEnabled: boolean;
    secureCookie: boolean;
    sessionTtlSeconds: number;
  };
  foundation: {
    db: string;
    api: string;
    workerHint?: string | null;
  };
  providers: {
    meta: {
      configured: boolean;
      adAccountConfigured: boolean;
      credentialState?: DashboardCredentialState | null;
    };
    kie: {
      configured: boolean;
      callbackConfigured: boolean;
      credentialState?: DashboardCredentialState | null;
    };
  };
  analysisOverview?: DashboardAnalysisOverview | null;
  recent: {
    credentials: DashboardCredentialState[];
    jobs: DashboardJobState[];
    audits: DashboardAuditEntry[];
    assetTasks: DashboardAssetTask[];
    assets: DashboardAssetItem[];
    copyVariants: DashboardCopyVariant[];
    copyReviews: DashboardCopyReview[];
  };
}

export interface DashboardSessionResponse {
  ok: boolean;
  session?: {
    username: string;
  };
  error?: {
    code: string;
    message: string;
    retryAfterSeconds?: number | null;
  };
}

export interface DashboardLoginResponse {
  ok: boolean;
  redirectTo?: string;
  error?: {
    code: string;
    message: string;
    retryAfterSeconds?: number | null;
  };
}

export interface DashboardPerformanceMetrics {
  source: 'meta-insights-last-30d' | 'snapshot-only';
  budgetAmount: number | null;
  budgetType: 'daily' | 'lifetime' | null;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  resultCount: number | null;
  costPerResult: number | null;
  resultLabel: string | null;
  resultActionType: string | null;
}

export interface DashboardHierarchyFreshness {
  accountSyncedAt: string | null;
  campaignsSyncedAt: string | null;
  adSetsSyncedAt: string | null;
  adsSyncedAt: string | null;
}

export interface DashboardCampaignHierarchyResponse {
  ok: boolean;
  accountId: string;
  currency: string | null;
  performanceWindow: string;
  freshness: DashboardHierarchyFreshness;
  count: number;
  items: Array<{
    campaignId: string;
    name: string | null;
    objective: string | null;
    effectiveStatus: string | null;
    dailyBudget: string | null;
    syncedAt: string | null;
    providerUpdatedTime: string | null;
    metrics: DashboardPerformanceMetrics;
    adSetCount: number;
    adCount: number;
    adSets: Array<{
      adSetId: string;
      name: string | null;
      effectiveStatus: string | null;
      optimizationGoal: string | null;
      dailyBudget: string | null;
      syncedAt: string | null;
      providerUpdatedTime: string | null;
      metrics: DashboardPerformanceMetrics;
      ads: Array<{
        adId: string;
        name: string | null;
        effectiveStatus: string | null;
        creativeId: string | null;
        creativeName: string | null;
        syncedAt: string | null;
        providerUpdatedTime: string | null;
        metrics: DashboardPerformanceMetrics;
        asset?: {
          id: string | null;
          assetType: 'image' | 'video' | null;
          provider: string | null;
          status: string | null;
          title: string | null;
          mimeType: string | null;
          originalUrl: string | null;
          thumbnailUrl: string | null;
          width: number | null;
          height: number | null;
          durationSeconds: number | null;
          source: 'asset-library' | 'audit-binding';
        } | null;
      }>;
    }>;
  }>;
}

export interface DashboardAdDetailResponse {
  ok: boolean;
  ad?: {
    adId: string;
    name: string | null;
    effectiveStatus: string | null;
    creativeId: string | null;
    creativeName: string | null;
  };
  asset?: {
    id: string | null;
    assetType: 'image' | 'video' | null;
    provider: string | null;
    status: string | null;
    title: string | null;
    mimeType: string | null;
    originalUrl: string | null;
    thumbnailUrl: string | null;
    width: number | null;
    height: number | null;
    durationSeconds: number | null;
    source: 'asset-library' | 'audit-binding';
  } | null;
  creative?: {
    id: string;
    name: string | null;
    objectType: string | null;
    previewType: 'image' | 'video' | 'unknown';
    imageUrl: string | null;
    thumbnailUrl: string | null;
    videoUrl: string | null;
    videoId: string | null;
    durationSeconds: number | null;
    linkUrl: string | null;
    body: string | null;
    headline: string | null;
    description: string | null;
    source: 'meta-creative';
    error?: string;
  } | null;
  error?: {
    code: string;
    message: string;
  };
}

export interface DashboardCampaignSyncResponse {
  ok: boolean;
  action: string;
  source: string;
  actor: string;
  syncedAt: string;
  accountId: string | null;
  limits?: {
    campaigns: number;
    adSets: number;
    ads: number;
  } | null;
  totals: {
    campaigns: number;
    adSets: number;
    ads: number;
  };
}

export interface DashboardMetaIssue {
  code: string;
  message: string;
  source: string;
}

export interface DashboardMetaActionResponse {
  ok: boolean;
  mode?: 'dry-run' | 'live';
  action?: string;
  status?: string;
  copiedCampaignId?: string | null;
  copiedAdSetId?: string | null;
  copiedAdId?: string | null;
  copiedAdSets?: Array<{
    sourceAdSetId: string;
    copiedAdSetId: string;
  }>;
  copiedAds?: Array<{
    sourceAdId: string;
    copiedAdId: string | null;
  }>;
  renameWarnings?: Array<{
    objectType: string;
    objectId: string;
    message: string;
  }>;
  blockers?: DashboardMetaIssue[];
  warnings?: DashboardMetaIssue[];
  totals?: {
    adSets: number;
    ads: number;
  };
  sourceCampaign?: {
    id: string;
    name: string | null;
    status: string | null;
    objective?: string | null;
  };
  sourceAdSet?: {
    id: string;
    name: string | null;
    status: string | null;
    campaignId: string | null;
  };
  sourceAd?: {
    id: string;
    name: string | null;
    status: string | null;
    adSetId: string | null;
    campaignId?: string | null;
    creativeId?: string | null;
  };
  targetCampaign?: {
    id: string;
    name: string | null;
    status: string | null;
  } | null;
  targetAdSet?: {
    id: string;
    name: string | null;
    status: string | null;
    campaignId?: string | null;
  } | null;
  page?: {
    id: string;
    name: string | null;
    verificationStatus: string | null;
    canPost: boolean | null;
    isPublished: boolean | null;
    link: string | null;
  } | null;
  video?: {
    id: string | null;
    status: string | null;
    length: number | null;
    title: string | null;
  } | null;
  preview?: Record<string, unknown> | null;
  inspection?: Record<string, unknown> | null;
  draft?: Record<string, unknown> | null;
  refreshedSnapshot?: Record<string, unknown> | null;
  deletedCampaignId?: string | null;
  deletedAdSetId?: string | null;
  deletedCount?: number;
  result?: Record<string, unknown> | null;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface DashboardCreativeLibraryResponse {
  ok: boolean;
  generatedAt: string;
  filters: {
    assetType: 'all' | 'image' | 'video';
    limit: number;
  };
  totals: {
    total: number;
    image: number;
    video: number;
  };
  items: DashboardAssetItem[];
}

export interface DashboardAudienceItem {
  id: string;
  name: string | null;
  subtype: string | null;
  audienceType: 'custom' | 'lookalike';
  description: string | null;
  approximateCount: number | null;
  retentionDays: number | null;
  timeCreated: string | null;
  timeUpdated: string | null;
  operationStatus: Record<string, unknown> | null;
  deliveryStatus: Record<string, unknown> | null;
  lookalikeSpec: Record<string, unknown> | null;
  rule: string | null;
}

export interface DashboardAudienceListResponse {
  ok: boolean;
  generatedAt: string;
  filters: {
    limit: number;
    type: 'all' | 'custom' | 'lookalike';
  };
  count: number;
  paging: Record<string, unknown> | null;
  items: DashboardAudienceItem[];
}

export interface DashboardWorkflowDefinition {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  nodes: Array<{
    id: string;
    type?: string;
    position: { x: number; y: number };
    data: {
      label: string;
      detail?: string;
      tone?: 'primary' | 'success' | 'warning' | 'error' | 'neutral';
    };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label?: string;
    animated?: boolean;
  }>;
}

export interface DashboardWorkflowResponse {
  ok: boolean;
  generatedAt: string;
  items: DashboardWorkflowDefinition[];
}

export interface DashboardMetaConnectionAsset {
  id: string;
  name: string;
  type: 'ad-account' | 'page' | 'pixel' | 'business';
  accountId?: string | null;
  category?: string | null;
  currency?: string | null;
  status?: string | null;
  tasks?: string[];
  businessId?: string | null;
  businessName?: string | null;
  code?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DashboardMetaConnection {
  id: string;
  label: string;
  profileId: string;
  profileName: string;
  tokenType: string | null;
  tokenPreview: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  graphApiVersion: string;
  createdAt: string;
  updatedAt: string;
  runtimeBound: boolean;
  adAccounts: DashboardMetaConnectionAsset[];
  pages: DashboardMetaConnectionAsset[];
  pixels: DashboardMetaConnectionAsset[];
  businesses: DashboardMetaConnectionAsset[];
  selection: {
    adAccountIds: string[];
    pageIds: string[];
    pixelIds: string[];
    businessIds: string[];
    primaryAdAccountId: string | null;
  };
  health: {
    level: 'success' | 'info' | 'warning' | 'error';
    label: string;
    issues: string[];
  };
}

export interface DashboardSettingsResponse {
  ok: boolean;
  generatedAt: string;
  dashboard: {
    authEnabled: boolean;
    username: string | null;
    secureCookie: boolean;
    sessionTtlSeconds: number;
    loginMaxAttempts: number;
    loginBlockMinutes: number;
    passwordConfigured: boolean;
  };
  providers: {
    meta: {
      tokenConfigured: boolean;
      adAccountId: string | null;
      writeEnabled: boolean;
      writeApprovalRequired: boolean;
      appId: string | null;
      appSecretConfigured: boolean;
      oauthRedirectUri: string | null;
      graphApiVersion: string;
      credentialState: DashboardCredentialState | null;
      connections: DashboardMetaConnection[];
    };
    kie: {
      apiKeyConfigured: boolean;
      callbackUrl: string | null;
      credentialState: DashboardCredentialState | null;
    };
  };
  reviewReadiness: {
    summary: {
      readyItems: number;
      totalItems: number;
      blockerCount: number;
      warningCount: number;
    };
    blockers: string[];
    warnings: string[];
    docs: {
      privacyPolicyDraft: string;
      termsOfServiceDraft: string;
      dataDeletionDraft: string;
      reviewerNotesDraft: string;
      scopeRequestDraft: string;
      demoScriptDraft: string;
      checklist: string;
      publicPrivacyUrl: string;
      publicTermsUrl: string;
    };
    scopePositioning: string;
  };
  credentials: DashboardCredentialState[];
  restartRequired: boolean;
  note: string;
}

export interface DashboardSettingsUpdateRequest {
  dashboardUsername?: string | null;
  dashboardAuthEnabled?: boolean;
  dashboardCookieSecure?: boolean;
  dashboardSessionTtlSeconds?: number;
  dashboardLoginMaxAttempts?: number;
  dashboardLoginBlockMinutes?: number;
  metaAccessToken?: string | null;
  metaAdAccountId?: string | null;
  metaWriteEnabled?: boolean;
  metaWriteApprovalRequired?: boolean;
  metaAppId?: string | null;
  metaAppSecret?: string | null;
  metaOAuthRedirectUri?: string | null;
  metaGraphApiVersion?: string | null;
  kieApiKey?: string | null;
  kieCallbackUrl?: string | null;
  reason?: string;
}

export interface DashboardMetaOAuthStartResponse {
  ok: boolean;
  authUrl: string;
  state: string;
  redirectUri: string;
  graphApiVersion: string;
  scopes: string[];
}

export interface DashboardMetaSelectionSaveRequest {
  adAccountIds: string[];
  pageIds: string[];
  pixelIds: string[];
  businessIds: string[];
  primaryAdAccountId?: string | null;
  bindRuntime?: boolean;
}

export interface DashboardMetaConnectionMutationResponse {
  ok: boolean;
  connection?: DashboardMetaConnection;
  removedConnectionId?: string;
  note?: string;
}

export type DashboardCreativeGenerateRequest =
  | {
      assetType: 'image';
      reason: string;
      image: {
        providerPayload: Record<string, unknown>;
        templateVersion?: string;
        callbackUrl?: string;
        enqueuePolling?: boolean;
        dryRun?: boolean;
      };
    }
  | {
      assetType: 'video';
      reason: string;
      video: {
        prompt: string;
        imageAssetId?: string;
        imageUrl?: string;
        durationSeconds?: 5 | 10;
        quality?: '720p' | '1080p';
        aspectRatio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
        templateVersion?: string;
        callbackUrl?: string;
        enqueuePolling?: boolean;
        dryRun?: boolean;
      };
    };

export interface DashboardCreativeGenerateResponse {
  ok: boolean;
  assetType: 'image' | 'video';
  result: {
    ok: boolean;
    mode: 'dry-run' | 'live' | 'planned';
    provider: string;
    task?: { id: string; status: string };
    queueSuggestion?: { taskId: string; providerTaskId: string; requestedBy: string; requestedAt: string } | null;
    normalizedPayload?: Record<string, unknown>;
  };
}

export interface DashboardCreativeDeleteResponse {
  ok: boolean;
  item?: DashboardAssetItem;
  error?: {
    code: string;
    message: string;
  };
}

