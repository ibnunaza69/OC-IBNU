import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardMonitoringService } from './dashboard.service.js';
import { pingDb } from '../foundation/db/client.js';
import { getDashboardRuntimeConfig, updateDashboardRuntimeConfig } from './runtime-config.js';

vi.mock('../../config/env.js', () => ({
  env: {
    META_AD_ACCOUNT_ID: 'act_123',
    DASHBOARD_AUTH_ENABLED: false,
    DASHBOARD_COOKIE_SECURE: false,
    DASHBOARD_SESSION_TTL_SECONDS: 3600,
    META_ACCESS_TOKEN: 'token123',
    KIE_API_KEY: 'kie_key',
    KIE_CALLBACK_URL: 'http://localhost/callback'
  }
}));

vi.mock('../foundation/db/client.js', () => ({
  pingDb: vi.fn()
}));

vi.mock('./runtime-config.js', () => ({
  getDashboardRuntimeConfig: vi.fn(),
  updateDashboardRuntimeConfig: vi.fn()
}));

const mockAnalysisService = {
  getOverview: vi.fn(),
  getCampaignHierarchy: vi.fn()
};
vi.mock('../analysis/analysis.service.js', () => ({
  AnalysisService: vi.fn(() => mockAnalysisService)
}));

const mockCredentialsRepo = { listAll: vi.fn() };
vi.mock('../foundation/credentials/credentials.repository.js', () => ({
  CredentialsStateRepository: vi.fn(() => mockCredentialsRepo)
}));

const mockJobsRepo = { listRecent: vi.fn() };
vi.mock('../foundation/jobs/jobs.repository.js', () => ({
  JobsStateRepository: vi.fn(() => mockJobsRepo)
}));

const mockAuditRepo = { listRecent: vi.fn(), findLatestAdAssetBindings: vi.fn(), create: vi.fn() };
vi.mock('../foundation/audit/audit.repository.js', () => ({
  AuditRepository: vi.fn(() => mockAuditRepo)
}));

const mockAssetTaskRepo = { listRecent: vi.fn() };
vi.mock('../asset-generation/task.repository.js', () => ({
  AssetGenerationTaskRepository: vi.fn(() => mockAssetTaskRepo)
}));

const mockAssetLibraryRepo = { listRecent: vi.fn(), findManyByIds: vi.fn(), findById: vi.fn(), deleteById: vi.fn() };
vi.mock('../asset-generation/asset.repository.js', () => ({
  AssetLibraryRepository: vi.fn(() => mockAssetLibraryRepo)
}));

const mockCopyRepo = { listVariants: vi.fn(), listReviews: vi.fn() };
vi.mock('../copywriting-lab/copy.repository.js', () => ({
  CopyRepository: vi.fn(() => mockCopyRepo)
}));

const mockMetaClient = {
  listAudiences: vi.fn(),
  getAudience: vi.fn(),
  updateAudience: vi.fn(),
  deleteAudience: vi.fn(),
  getAdCreative: vi.fn(),
  getVideo: vi.fn()
};
vi.mock('../providers/meta/meta.client.js', () => ({
  MetaClient: vi.fn(() => mockMetaClient)
}));

const mockMetaSyncService = { syncAccountHierarchy: vi.fn() };
vi.mock('../meta-sync/meta-sync.service.js', () => ({
  MetaSyncService: vi.fn(() => mockMetaSyncService)
}));

const mockAdSnapshotRepo = { getLatestByAdId: vi.fn() };
vi.mock('../meta-sync/repositories/meta-ad.repository.js', () => ({
  MetaAdSnapshotRepository: vi.fn(() => mockAdSnapshotRepo)
}));

const mockMetaOAuthService = { listConnections: vi.fn(), start: vi.fn(), handleCallback: vi.fn(), saveSelections: vi.fn(), unbindConnection: vi.fn(), removeConnection: vi.fn() };
vi.mock('./meta-oauth.service.js', () => ({
  MetaOAuthService: vi.fn(() => mockMetaOAuthService)
}));

const mockCleanupService = { deleteCampaign: vi.fn(), deleteAdSet: vi.fn() };
vi.mock('../manage-campaigns/manage-campaigns-cleanup.service.js', () => ({
  ManageCampaignsCleanupService: vi.fn(() => mockCleanupService)
}));

const mockDuplicateWriteService = { duplicateCampaign: vi.fn(), duplicateAdSet: vi.fn(), duplicateAd: vi.fn() };
vi.mock('../manage-campaigns/duplicate-write.service.js', () => ({
  DuplicateWriteService: vi.fn(() => mockDuplicateWriteService)
}));

const mockDuplicateTreeService = { duplicateTree: vi.fn() };
vi.mock('../manage-campaigns/duplicate-tree.service.js', () => ({
  DuplicateTreeService: vi.fn(() => mockDuplicateTreeService)
}));

const mockPreflightCheckService = { inspectAdPromotability: vi.fn(), preflightDuplicateAd: vi.fn() };
vi.mock('../manage-campaigns/preflight-check.service.js', () => ({
  PreflightCheckService: vi.fn(() => mockPreflightCheckService)
}));

const mockImageGenService = { createImageGenerationTask: vi.fn() };
vi.mock('../asset-generation/image-generation.service.js', () => ({
  ImageGenerationService: vi.fn(() => mockImageGenService)
}));

const mockVideoGenService = { createRunwayVideoTask: vi.fn() };
vi.mock('../asset-generation/video-generation.service.js', () => ({
  VideoGenerationService: vi.fn(() => mockVideoGenService)
}));

vi.mock('../asset-generation/image-generation.queue.js', () => ({
  enqueueKieImagePollJob: vi.fn()
}));

vi.mock('../asset-generation/video-generation.queue.js', () => ({
  enqueueKieRunwayVideoPollJob: vi.fn()
}));

describe('DashboardMonitoringService', () => {
  let service: DashboardMonitoringService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DashboardMonitoringService();
  });

  describe('getSummary', () => {
    it('should return a combined summary', async () => {
      vi.mocked(pingDb).mockResolvedValue(true);
      mockAnalysisService.getOverview.mockResolvedValue({ totals: { campaigns: 5 } });
      mockCredentialsRepo.listAll.mockResolvedValue([{ provider: 'meta', subject: 'act_123' }]);
      mockJobsRepo.listRecent.mockResolvedValue([]);
      mockAuditRepo.listRecent.mockResolvedValue([]);
      mockAssetTaskRepo.listRecent.mockResolvedValue([]);
      mockAssetLibraryRepo.listRecent.mockResolvedValue([]);
      mockCopyRepo.listVariants.mockResolvedValue([]);
      mockCopyRepo.listReviews.mockResolvedValue([]);

      const result = await service.getSummary();
      
      expect(result.ok).toBe(true);
      expect(result.foundation.db).toBe('up');
      expect(result.analysisOverview.totals.campaigns).toBe(5);
    });
  });

  describe('getAudiences', () => {
    it('should return mapped audiences', async () => {
      mockMetaClient.listAudiences.mockResolvedValue({
        data: [{
          id: 'aud_1',
          name: 'Audience 1',
          subtype: 'CUSTOM',
          approximate_count: 1000
        }],
        paging: { cursors: { after: 'abc' } }
      });

      const result = await service.getAudiences(10, 'all');

      expect(result.ok).toBe(true);
      expect(result.count).toBe(1);
      expect(result.items[0].id).toBe('aud_1');
      expect(result.items[0].audienceType).toBe('custom');
    });
  });

  describe('getCampaignExplorer', () => {
    it('should return campaign hierarchy with linked assets', async () => {
      mockAnalysisService.getCampaignHierarchy.mockResolvedValue({
        ok: true,
        items: [
          {
            campaignId: 'c1',
            adSets: [
              {
                adSetId: 'as1',
                ads: [{ adId: 'a1' }]
              }
            ]
          }
        ]
      });

      mockAuditRepo.findLatestAdAssetBindings.mockResolvedValue(new Map([
        ['a1', { assetId: 'asset_1', creativeType: 'image' }]
      ]));

      mockAssetLibraryRepo.findManyByIds.mockResolvedValue([
        { id: 'asset_1', assetType: 'image', provider: 'kie', title: 'Image 1' }
      ]);

      const result = await service.getCampaignExplorer(10);
      
      expect(result.ok).toBe(true);
      if (result.ok) {
        const campaign = result.items[0];
        const ad = campaign.adSets[0].ads[0];
        expect(ad.asset?.id).toBe('asset_1');
      }
    });
  });

  describe('getSettings', () => {
    it('should return dashboard settings', async () => {
      mockCredentialsRepo.listAll.mockResolvedValue([]);
      vi.mocked(getDashboardRuntimeConfig).mockResolvedValue({
        dashboardAuthEnabled: true,
        metaAdAccountId: 'act_123',
        metaAppId: 'app_1',
        metaAppSecretConfigured: true,
        metaOAuthRedirectUri: 'http://localhost/callback',
        metaWriteEnabled: true,
        metaWriteApprovalRequired: false
      } as any);

      mockMetaOAuthService.listConnections.mockResolvedValue([
        {
          id: 'conn_1',
          runtimeBound: true,
          tokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
          selection: { adAccountIds: ['act_123'], pageIds: [], pixelIds: [], businessIds: [] }
        }
      ]);

      const result = await service.getSettings();
      expect(result.ok).toBe(true);
      expect(result.dashboard.authEnabled).toBe(true);
      expect(result.providers.meta.connections[0].id).toBe('conn_1');
    });
  });
});
