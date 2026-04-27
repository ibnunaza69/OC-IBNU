import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CredentialsStateRepository } from '../../foundation/credentials/credentials.repository.js';
import { JobsStateRepository } from '../../foundation/jobs/jobs.repository.js';
import { ProviderRequestLogRepository } from '../../foundation/provider-logs/provider-request-log.repository.js';
import { env } from '../../../config/env.js';
import { configService } from '../../../config/settings.js';
import { KieClient } from '../kie/kie.client.js';
import { MetaClient } from '../meta/meta.client.js';
import { AppError } from '../../../lib/errors.js';
import { AdWriteService } from '../../manage-campaigns/ad-write.service.js';
import { AdSetWriteService } from '../../manage-campaigns/adset-write.service.js';
import { CampaignWriteService } from '../../manage-campaigns/campaign-write.service.js';
import { DuplicateTreeService } from '../../manage-campaigns/duplicate-tree.service.js';
import { DuplicateWriteService } from '../../manage-campaigns/duplicate-write.service.js';
import { BulkActionsService } from '../../manage-campaigns/bulk-actions.service.js';
import { ManageCampaignsCleanupService } from '../../manage-campaigns/manage-campaigns-cleanup.service.js';
import { PreflightCheckService } from '../../manage-campaigns/preflight-check.service.js';
import { enqueueMetaVerificationRunnerJob, META_VERIFICATION_RUNNER_JOB_NAME } from '../../manage-campaigns/verification-runner.queue.js';
import { MetaVerificationRunnerService } from '../../manage-campaigns/verification-runner.service.js';
import { MetaAdSetSnapshotRepository } from '../../meta-sync/repositories/meta-adset.repository.js';
import { MetaAdSnapshotRepository } from '../../meta-sync/repositories/meta-ad.repository.js';
import { MetaAdAccountSnapshotRepository } from '../../meta-sync/repositories/meta-ad-account.repository.js';
import { MetaCampaignSnapshotRepository } from '../../meta-sync/repositories/meta-campaign.repository.js';
import { MetaRuleHistorySnapshotRepository } from '../../meta-sync/repositories/meta-rule-history.repository.js';
import { MetaRuleSnapshotRepository } from '../../meta-sync/repositories/meta-rule.repository.js';
import { MetaApprovalService } from '../../meta-write/meta-approval.service.js';
import { MetaWriteGate } from '../../meta-write/meta-write.gate.js';
import { MetaWriteService } from '../../meta-write/meta-write.service.js';
import { enqueueMetaSyncHierarchyJob } from '../../meta-sync/meta-sync.queue.js';
import { MetaSyncService } from '../../meta-sync/meta-sync.service.js';
import { RuleValidationService } from '../../rules-management/rule-validation.service.js';
import { RuleWriteService } from '../../rules-management/rule-write.service.js';

const logLimitSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const campaignLimitSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25)
});

const kieTaskParamsSchema = z.object({
  taskId: z.string().min(1)
});

const metaTargetStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED']),
  reason: z.string().min(5),
  dryRun: z.boolean().optional().default(true)
});

const metaStartStopSchema = z.object({
  reason: z.string().min(5),
  dryRun: z.boolean().optional().default(true)
});

const metaBudgetSchema = z.object({
  dailyBudget: z.coerce.number().int().positive(),
  reason: z.string().min(5),
  dryRun: z.boolean().optional().default(true)
});

const metaBudgetDeltaSchema = z.object({
  amount: z.coerce.number().int().positive(),
  reason: z.string().min(5),
  dryRun: z.boolean().optional().default(true)
});

const campaignParamsSchema = z.object({
  campaignId: z.string().min(1)
});

const adSetParamsSchema = z.object({
  adSetId: z.string().min(1)
});

const adParamsSchema = z.object({
  adId: z.string().min(1)
});

const ruleParamsSchema = z.object({
  ruleId: z.string().min(1)
});

const writeApprovalIssueSchema = z.object({
  operationType: z.enum(['meta.write.status-change', 'meta.budget.change', 'meta.campaign.create', 'meta.adset.create', 'meta.ad.create', 'meta.campaign.delete', 'meta.adset.delete', 'meta.campaign.duplicate', 'meta.campaign.duplicate-tree', 'meta.adset.duplicate', 'meta.ad.duplicate', 'meta.video.publish', 'meta.rule.create', 'meta.rule.update', 'meta.rule.status-change', 'meta.rule.delete']),
  targetType: z.enum(['campaign', 'adset', 'ad', 'rule', 'asset-library']),
  targetId: z.string().min(1),
  reason: z.string().min(5),
  payload: z.record(z.string(), z.unknown())
});

const metaCampaignCreateSchema = z.object({
  name: z.string().trim().min(3).max(255),
  objective: z.string().trim().min(1),
  status: z.enum(['ACTIVE', 'PAUSED']).optional().default('PAUSED'),
  buyingType: z.string().trim().min(1).optional(),
  isAdSetBudgetSharingEnabled: z.boolean().optional().default(false),
  specialAdCategories: z.array(z.string().trim().min(1)).optional().default([]),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaAdSetCreateSchema = z.object({
  campaignId: z.string().min(1),
  name: z.string().trim().min(3).max(255),
  billingEvent: z.string().trim().min(1),
  optimizationGoal: z.string().trim().min(1),
  status: z.enum(['ACTIVE', 'PAUSED']).optional().default('PAUSED'),
  targeting: z.record(z.string(), z.unknown()),
  dailyBudget: z.coerce.number().int().positive().optional(),
  lifetimeBudget: z.coerce.number().int().positive().optional(),
  promotedObject: z.record(z.string(), z.unknown()).optional(),
  bidStrategy: z.string().trim().min(1).optional(),
  bidAmount: z.coerce.number().int().positive().optional(),
  startTime: z.string().trim().min(1).optional(),
  endTime: z.string().trim().min(1).optional(),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaAdCreateSchema = z.object({
  adSetId: z.string().min(1),
  name: z.string().trim().min(3).max(255),
  creativeId: z.string().min(1).optional(),
  imageAssetId: z.string().uuid().optional(),
  videoAssetId: z.string().uuid().optional(),
  creativeDraft: z.object({
    pageId: z.string().min(1),
    linkUrl: z.string().url(),
    message: z.string().trim().min(1).max(2000),
    headline: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(255).optional(),
    callToActionType: z.string().trim().min(1).max(64).optional(),
    metaVideoId: z.string().min(1).optional(),
    instagramActorId: z.string().min(1).optional()
  }).optional(),
  creativeName: z.string().trim().min(3).max(255).optional(),
  pageId: z.string().min(1).optional(),
  instagramActorId: z.string().min(1).optional(),
  objectStorySpec: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional().default('PAUSED'),
  trackingSpecs: z.array(z.record(z.string(), z.unknown())).optional(),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
}).superRefine((value, ctx) => {
  const hasCreativeId = typeof value.creativeId === 'string' && value.creativeId.trim().length > 0;
  const hasObjectStorySpec = Boolean(value.objectStorySpec);
  const hasImageAssetId = typeof value.imageAssetId === 'string' && value.imageAssetId.trim().length > 0;
  const hasVideoAssetId = typeof value.videoAssetId === 'string' && value.videoAssetId.trim().length > 0;
  const modeCount = Number(hasCreativeId) + Number(hasObjectStorySpec) + Number(hasImageAssetId) + Number(hasVideoAssetId);

  if (modeCount === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide one creative mode: creativeId, objectStorySpec, imageAssetId, or videoAssetId',
      path: ['creativeId']
    });
  }

  if (modeCount > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Use only one creative mode: creativeId, objectStorySpec, imageAssetId, or videoAssetId',
      path: ['creativeId']
    });
  }

  if ((hasImageAssetId || hasVideoAssetId) && !value.creativeDraft) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'creativeDraft is required when imageAssetId or videoAssetId is used',
      path: ['creativeDraft']
    });
  }

  if (!hasImageAssetId && !hasVideoAssetId && value.creativeDraft) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'creativeDraft can only be used together with imageAssetId or videoAssetId',
      path: ['imageAssetId']
    });
  }

  if (hasObjectStorySpec) {
    const objectStorySpec = value.objectStorySpec as Record<string, unknown>;
    const hasPageId = typeof value.pageId === 'string' && value.pageId.trim().length > 0;
    const hasPageIdInSpec = typeof objectStorySpec.page_id === 'string' && objectStorySpec.page_id.trim().length > 0;

    if (!hasPageId && !hasPageIdInSpec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pageId is required when objectStorySpec is used',
        path: ['pageId']
      });
    }
  }
});

const duplicateStatusOptionSchema = z.enum(['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE']).optional().default('PAUSED');

const metaCampaignDuplicateSchema = z.object({
  statusOption: duplicateStatusOptionSchema,
  deepCopy: z.boolean().optional().default(false),
  startTime: z.string().trim().min(1).optional(),
  endTime: z.string().trim().min(1).optional(),
  renameOptions: z.record(z.string(), z.unknown()).optional(),
  parameterOverrides: z.record(z.string(), z.unknown()).optional(),
  migrateToAdvantagePlus: z.boolean().optional().default(false),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaAdSetDuplicateSchema = z.object({
  targetCampaignId: z.string().min(1).optional(),
  statusOption: duplicateStatusOptionSchema,
  deepCopy: z.boolean().optional().default(false),
  createDcoAdSet: z.boolean().optional().default(false),
  startTime: z.string().trim().min(1).optional(),
  endTime: z.string().trim().min(1).optional(),
  renameOptions: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaAdDuplicateSchema = z.object({
  targetAdSetId: z.string().min(1).optional(),
  statusOption: duplicateStatusOptionSchema,
  renameOptions: z.record(z.string(), z.unknown()).optional(),
  creativeParameters: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaAdPromotabilitySchema = z.object({
  targetAdSetId: z.string().min(1).optional()
});

const metaCampaignDuplicateTreeSchema = z.object({
  statusOption: duplicateStatusOptionSchema,
  includeAds: z.boolean().optional().default(true),
  cleanupOnFailure: z.boolean().optional().default(true),
  namePrefix: z.string().trim().min(1).max(80).optional(),
  nameSuffix: z.string().trim().min(1).max(80).optional(),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaVerificationCreateAdSchema = z.object({
  adSetId: z.string().min(1),
  name: z.string().trim().min(3).max(255),
  creativeId: z.string().min(1).optional(),
  imageAssetId: z.string().uuid().optional(),
  videoAssetId: z.string().uuid().optional(),
  creativeDraft: z.object({
    pageId: z.string().min(1),
    linkUrl: z.string().url(),
    message: z.string().trim().min(1).max(2000),
    headline: z.string().trim().min(1).max(255),
    description: z.string().trim().min(1).max(255).optional(),
    callToActionType: z.string().trim().min(1).max(64).optional(),
    metaVideoId: z.string().min(1).optional(),
    instagramActorId: z.string().min(1).optional()
  }).optional(),
  creativeName: z.string().trim().min(3).max(255).optional(),
  pageId: z.string().min(1).optional(),
  instagramActorId: z.string().min(1).optional(),
  objectStorySpec: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional().default('PAUSED'),
  trackingSpecs: z.array(z.record(z.string(), z.unknown())).optional()
}).superRefine((value, ctx) => {
  const hasCreativeId = typeof value.creativeId === 'string' && value.creativeId.trim().length > 0;
  const hasObjectStorySpec = Boolean(value.objectStorySpec);
  const hasImageAssetId = typeof value.imageAssetId === 'string' && value.imageAssetId.trim().length > 0;
  const hasVideoAssetId = typeof value.videoAssetId === 'string' && value.videoAssetId.trim().length > 0;
  const modeCount = Number(hasCreativeId) + Number(hasObjectStorySpec) + Number(hasImageAssetId) + Number(hasVideoAssetId);

  if (modeCount === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide one creative mode: creativeId, objectStorySpec, imageAssetId, or videoAssetId',
      path: ['creativeId']
    });
  }

  if (modeCount > 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Use only one creative mode: creativeId, objectStorySpec, imageAssetId, or videoAssetId',
      path: ['creativeId']
    });
  }

  if ((hasImageAssetId || hasVideoAssetId) && !value.creativeDraft) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'creativeDraft is required when imageAssetId or videoAssetId is used',
      path: ['creativeDraft']
    });
  }

  if (!hasImageAssetId && !hasVideoAssetId && value.creativeDraft) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'creativeDraft can only be used together with imageAssetId or videoAssetId',
      path: ['imageAssetId']
    });
  }

  if (hasObjectStorySpec) {
    const objectStorySpec = value.objectStorySpec as Record<string, unknown>;
    const hasPageId = typeof value.pageId === 'string' && value.pageId.trim().length > 0;
    const hasPageIdInSpec = typeof objectStorySpec.page_id === 'string' && objectStorySpec.page_id.trim().length > 0;

    if (!hasPageId && !hasPageIdInSpec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pageId is required when objectStorySpec is used',
        path: ['pageId']
      });
    }
  }
});

const metaVerificationPromotabilitySchema = metaAdPromotabilitySchema.extend({
  adId: z.string().min(1)
});

const metaVerificationDuplicateAdSchema = metaAdDuplicateSchema.omit({
  reason: true,
  confirmHighImpact: true,
  dryRun: true
}).extend({
  sourceAdId: z.string().min(1)
});

const metaVerificationDuplicateTreeSchema = metaCampaignDuplicateTreeSchema.omit({
  reason: true,
  confirmHighImpact: true,
  dryRun: true
}).extend({
  sourceCampaignId: z.string().min(1)
});

const metaVerificationRunnerSchema = z.object({
  reason: z.string().min(5),
  syncHierarchy: z.boolean().optional().default(true),
  limit: z.coerce.number().int().positive().max(100).optional().default(25),
  createAdPreflight: metaVerificationCreateAdSchema.optional(),
  promotability: metaVerificationPromotabilitySchema.optional(),
  duplicateAdPreflight: metaVerificationDuplicateAdSchema.optional(),
  duplicateTree: metaVerificationDuplicateTreeSchema.optional()
}).superRefine((value, ctx) => {
  if (!value.syncHierarchy && !value.createAdPreflight && !value.promotability && !value.duplicateAdPreflight && !value.duplicateTree) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enable syncHierarchy or provide at least one verification check payload',
      path: ['syncHierarchy']
    });
  }
});

const metaRuleDraftValidationSchema = z.object({
  name: z.string().trim().min(3).max(255),
  status: z.enum(['ENABLED', 'DISABLED']).optional(),
  evaluationSpec: z.object({
    evaluationType: z.enum(['SCHEDULE', 'TRIGGER']),
    filters: z.array(z.object({
      field: z.string().min(1),
      operator: z.string().min(1),
      value: z.unknown()
    })).min(1)
  }),
  executionSpec: z.object({
    executionType: z.enum([
      'PAUSE',
      'UNPAUSE',
      'CHANGE_BUDGET',
      'CHANGE_CAMPAIGN_BUDGET',
      'REBALANCE_BUDGET',
      'NOTIFICATION',
      'PING_ENDPOINT'
    ]),
    executionOptions: z.array(z.object({
      field: z.string().min(1),
      operator: z.string().min(1),
      value: z.unknown()
    })).optional().default([])
  }),
  scheduleSpec: z.object({
    scheduleType: z.string().min(1),
    schedule: z.array(z.object({
      days: z.array(z.coerce.number().int().min(0).max(6)).min(1),
      start_minute: z.coerce.number().int().min(0).max(1440),
      end_minute: z.coerce.number().int().min(0).max(1440)
    })).min(1)
  }).optional()
});

const metaRuleCreateSchema = metaRuleDraftValidationSchema.extend({
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaRuleUpdateSchema = metaRuleDraftValidationSchema.extend({
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaRuleStatusSchema = z.object({
  status: z.enum(['ENABLED', 'DISABLED']),
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaRuleEnableDisableSchema = z.object({
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaRuleDeleteSchema = z.object({
  reason: z.string().min(5),
  confirmHighImpact: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true)
});

const metaEntityDeleteSchema = z.object({
  reason: z.string().min(5),
  dryRun: z.boolean().optional().default(true)
});

function getActorHeader(headers: Record<string, unknown>) {
  return typeof headers['x-actor'] === 'string' ? headers['x-actor'] : 'internal-api';
}

function getWriteSecretHeader(headers: Record<string, unknown>) {
  return typeof headers['x-meta-write-secret'] === 'string' ? headers['x-meta-write-secret'] : undefined;
}

function getApprovalIdHeader(headers: Record<string, unknown>) {
  return typeof headers['x-meta-write-approval-id'] === 'string' ? headers['x-meta-write-approval-id'] : undefined;
}

function getApprovalTokenHeader(headers: Record<string, unknown>) {
  return typeof headers['x-meta-write-approval-token'] === 'string' ? headers['x-meta-write-approval-token'] : undefined;
}

export async function registerProviderInternalRoutes(app: FastifyInstance) {
  const credentialsRepository = new CredentialsStateRepository();
  const jobsRepository = new JobsStateRepository();
  const requestLogRepository = new ProviderRequestLogRepository();
  const adAccountSnapshotRepository = new MetaAdAccountSnapshotRepository();
  const campaignSnapshotRepository = new MetaCampaignSnapshotRepository();
  const adSetSnapshotRepository = new MetaAdSetSnapshotRepository();
  const adSnapshotRepository = new MetaAdSnapshotRepository();
  const ruleSnapshotRepository = new MetaRuleSnapshotRepository();
  const ruleHistorySnapshotRepository = new MetaRuleHistorySnapshotRepository();
  const metaApprovalService = new MetaApprovalService();
  const metaWriteGate = new MetaWriteGate();
  const metaWriteService = new MetaWriteService();
  const adWriteService = new AdWriteService();
  const adSetWriteService = new AdSetWriteService();
  const campaignWriteService = new CampaignWriteService();
  const duplicateTreeService = new DuplicateTreeService();
  const duplicateWriteService = new DuplicateWriteService();
  const manageCampaignsCleanupService = new ManageCampaignsCleanupService();
  const bulkActionsService = new BulkActionsService();
  const preflightCheckService = new PreflightCheckService();
  const verificationRunnerService = new MetaVerificationRunnerService();
  const metaSyncService = new MetaSyncService();
  const ruleValidationService = new RuleValidationService();
  const ruleWriteService = new RuleWriteService();
  const metaClient = new MetaClient();
  const kieClient = new KieClient();

  app.get('/internal/providers/status', async () => {
    const metaAccountId = await configService.getMetaAccountId();
    const metaAccessToken = await configService.getMetaAccessToken();
    const kieApiKey = await configService.getKieApiKey();
    const kieCallbackUrl = await configService.getKieCallbackUrl();

    const metaState = await credentialsRepository.findOne('meta', metaAccountId ?? 'default');
    const kieState = await credentialsRepository.findOne('kie', 'default');

    return {
      ok: true,
      providers: {
        meta: {
          configured: Boolean(metaAccessToken),
          adAccountConfigured: Boolean(metaAccountId),
          credentialState: metaState ?? null
        },
        kie: {
          configured: Boolean(kieApiKey),
          callbackConfigured: Boolean(kieCallbackUrl),
          credentialState: kieState ?? null
        }
      }
    };
  });

  app.get('/internal/providers/logs', async (request) => {
    const query = logLimitSchema.parse(request.query);
    const items = await requestLogRepository.listRecent(query.limit);

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/providers/meta/probe', async (_request, reply) => {
    try {
      const result = await metaClient.probe();
      return {
        ok: true,
        provider: 'meta',
        result: result.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta probe failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.get('/internal/providers/meta/write-gate', async () => {
    return metaWriteGate.getStatus();
  });

  app.post('/internal/providers/meta/write-approvals/issue', async (request, reply) => {
    const body = writeApprovalIssueSchema.parse(request.body ?? {});

    try {
      const result = await metaApprovalService.issueApproval({
        operationType: body.operationType,
        targetType: body.targetType,
        targetId: body.targetId,
        actor: getActorHeader(request.headers),
        reason: body.reason,
        payload: body.payload
      });

      reply.code(201);
      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta write approval issue failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/campaigns', async (request, reply) => {
    const body = metaCampaignCreateSchema.parse(request.body ?? {});

    try {
      const result = await campaignWriteService.createCampaign({
        draft: {
          name: body.name,
          objective: body.objective,
          status: body.status,
          buyingType: body.buyingType,
          isAdSetBudgetSharingEnabled: body.isAdSetBudgetSharingEnabled,
          specialAdCategories: body.specialAdCategories
        },
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 201);
      return {
        provider: 'meta',
        action: 'create-campaign',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign create failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'create-campaign',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/adsets', async (request, reply) => {
    const body = metaAdSetCreateSchema.parse(request.body ?? {});

    try {
      const result = await adSetWriteService.createAdSet({
        draft: {
          campaignId: body.campaignId,
          name: body.name,
          billingEvent: body.billingEvent,
          optimizationGoal: body.optimizationGoal,
          status: body.status,
          targeting: body.targeting,
          dailyBudget: body.dailyBudget,
          lifetimeBudget: body.lifetimeBudget,
          promotedObject: body.promotedObject,
          bidStrategy: body.bidStrategy,
          bidAmount: body.bidAmount,
          startTime: body.startTime,
          endTime: body.endTime
        },
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 201);
      return {
        provider: 'meta',
        action: 'create-adset',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad set create failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'create-adset',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/ads', async (request, reply) => {
    const body = metaAdCreateSchema.parse(request.body ?? {});

    try {
      const result = await adWriteService.createAd({
        draft: {
          adSetId: body.adSetId,
          name: body.name,
          creativeId: body.creativeId,
          imageAssetId: body.imageAssetId,
          videoAssetId: body.videoAssetId,
          creativeDraft: body.creativeDraft,
          creativeName: body.creativeName,
          pageId: body.pageId,
          instagramActorId: body.instagramActorId,
          objectStorySpec: body.objectStorySpec,
          status: body.status,
          trackingSpecs: body.trackingSpecs
        },
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 201);
      return {
        provider: 'meta',
        action: 'create-ad',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad create failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'create-ad',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/ads/preflight/create', async (request, reply) => {
    const body = metaAdCreateSchema.parse(request.body ?? {});

    try {
      const result = await preflightCheckService.preflightCreateAd({
        draft: {
          adSetId: body.adSetId,
          name: body.name,
          creativeId: body.creativeId,
          imageAssetId: body.imageAssetId,
          videoAssetId: body.videoAssetId,
          creativeDraft: body.creativeDraft,
          creativeName: body.creativeName,
          pageId: body.pageId,
          instagramActorId: body.instagramActorId,
          objectStorySpec: body.objectStorySpec,
          status: body.status,
          trackingSpecs: body.trackingSpecs
        },
        reason: body.reason,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers)
      });

      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta create-ad preflight failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'preflight-create-ad',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/ads/:adId/promotability', async (request, reply) => {
    const params = adParamsSchema.parse(request.params);
    const body = metaAdPromotabilitySchema.parse(request.body ?? {});

    try {
      const result = await preflightCheckService.inspectAdPromotability({
        adId: params.adId,
        targetAdSetId: body.targetAdSetId
      });

      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad promotability inspection failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'inspect-ad-promotability',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/ads/:adId/preflight/duplicate', async (request, reply) => {
    const params = adParamsSchema.parse(request.params);
    const body = metaAdDuplicateSchema.parse(request.body ?? {});

    try {
      const result = await preflightCheckService.preflightDuplicateAd({
        draft: {
          sourceAdId: params.adId,
          targetAdSetId: body.targetAdSetId,
          statusOption: body.statusOption,
          renameOptions: body.renameOptions,
          creativeParameters: body.creativeParameters
        },
        reason: body.reason,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers)
      });

      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta duplicate-ad preflight failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'preflight-duplicate-ad',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/verification/run', async (request, reply) => {
    const body = metaVerificationRunnerSchema.parse(request.body ?? {});
    const actor = getActorHeader(request.headers);

    await jobsRepository.upsert({
      jobName: META_VERIFICATION_RUNNER_JOB_NAME,
      status: 'running',
      payload: {
        startedAt: new Date().toISOString(),
        requestedBy: actor,
        reason: body.reason,
        syncHierarchy: body.syncHierarchy,
        limit: body.limit
      }
    });

    try {
      const result = await verificationRunnerService.run({
        reason: body.reason,
        actor,
        syncHierarchy: body.syncHierarchy,
        limit: body.limit,
        createAdPreflight: body.createAdPreflight
          ? {
              adSetId: body.createAdPreflight.adSetId,
              name: body.createAdPreflight.name,
              creativeId: body.createAdPreflight.creativeId,
              imageAssetId: body.createAdPreflight.imageAssetId,
              videoAssetId: body.createAdPreflight.videoAssetId,
              creativeDraft: body.createAdPreflight.creativeDraft,
              creativeName: body.createAdPreflight.creativeName,
              pageId: body.createAdPreflight.pageId,
              instagramActorId: body.createAdPreflight.instagramActorId,
              objectStorySpec: body.createAdPreflight.objectStorySpec,
              status: body.createAdPreflight.status,
              trackingSpecs: body.createAdPreflight.trackingSpecs
            }
          : undefined,
        promotability: body.promotability
          ? {
              adId: body.promotability.adId,
              targetAdSetId: body.promotability.targetAdSetId
            }
          : undefined,
        duplicateAdPreflight: body.duplicateAdPreflight
          ? {
              sourceAdId: body.duplicateAdPreflight.sourceAdId,
              targetAdSetId: body.duplicateAdPreflight.targetAdSetId,
              statusOption: body.duplicateAdPreflight.statusOption,
              renameOptions: body.duplicateAdPreflight.renameOptions,
              creativeParameters: body.duplicateAdPreflight.creativeParameters
            }
          : undefined,
        duplicateTree: body.duplicateTree
          ? {
              sourceCampaignId: body.duplicateTree.sourceCampaignId,
              statusOption: body.duplicateTree.statusOption,
              includeAds: body.duplicateTree.includeAds,
              cleanupOnFailure: body.duplicateTree.cleanupOnFailure,
              namePrefix: body.duplicateTree.namePrefix,
              nameSuffix: body.duplicateTree.nameSuffix
            }
          : undefined
      });

      await jobsRepository.upsert({
        jobName: META_VERIFICATION_RUNNER_JOB_NAME,
        status: 'succeeded',
        payload: {
          finishedAt: new Date().toISOString(),
          requestedBy: actor,
          result
        }
      });

      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta verification runner failed');

      await jobsRepository.upsert({
        jobName: META_VERIFICATION_RUNNER_JOB_NAME,
        status: 'failed',
        lastError: appError.message,
        payload: {
          failedAt: new Date().toISOString(),
          requestedBy: actor,
          reason: body.reason
        }
      });

      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'meta-verification-runner',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/verification/enqueue', async (request, reply) => {
    const body = metaVerificationRunnerSchema.parse(request.body ?? {});

    try {
      const result = await enqueueMetaVerificationRunnerJob({
        reason: body.reason,
        actor: getActorHeader(request.headers),
        requestedBy: getActorHeader(request.headers),
        syncHierarchy: body.syncHierarchy,
        limit: body.limit,
        createAdPreflight: body.createAdPreflight
          ? {
              adSetId: body.createAdPreflight.adSetId,
              name: body.createAdPreflight.name,
              creativeId: body.createAdPreflight.creativeId,
              imageAssetId: body.createAdPreflight.imageAssetId,
              videoAssetId: body.createAdPreflight.videoAssetId,
              creativeDraft: body.createAdPreflight.creativeDraft,
              creativeName: body.createAdPreflight.creativeName,
              pageId: body.createAdPreflight.pageId,
              instagramActorId: body.createAdPreflight.instagramActorId,
              objectStorySpec: body.createAdPreflight.objectStorySpec,
              status: body.createAdPreflight.status,
              trackingSpecs: body.createAdPreflight.trackingSpecs
            }
          : undefined,
        promotability: body.promotability
          ? {
              adId: body.promotability.adId,
              targetAdSetId: body.promotability.targetAdSetId
            }
          : undefined,
        duplicateAdPreflight: body.duplicateAdPreflight
          ? {
              sourceAdId: body.duplicateAdPreflight.sourceAdId,
              targetAdSetId: body.duplicateAdPreflight.targetAdSetId,
              statusOption: body.duplicateAdPreflight.statusOption,
              renameOptions: body.duplicateAdPreflight.renameOptions,
              creativeParameters: body.duplicateAdPreflight.creativeParameters
            }
          : undefined,
        duplicateTree: body.duplicateTree
          ? {
              sourceCampaignId: body.duplicateTree.sourceCampaignId,
              statusOption: body.duplicateTree.statusOption,
              includeAds: body.duplicateTree.includeAds,
              cleanupOnFailure: body.duplicateTree.cleanupOnFailure,
              namePrefix: body.duplicateTree.namePrefix,
              nameSuffix: body.duplicateTree.nameSuffix
            }
          : undefined
      });

      reply.code(result.status === 'queued' ? 202 : 200);
      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta verification runner enqueue failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'meta-verification-runner',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.get('/internal/providers/meta/verification/last', async () => {
    const item = await jobsRepository.findLatest(META_VERIFICATION_RUNNER_JOB_NAME);

    return {
      ok: true,
      provider: 'meta',
      jobName: META_VERIFICATION_RUNNER_JOB_NAME,
      item
    };
  });

  app.post('/internal/providers/meta/campaigns/:campaignId/duplicate', async (request, reply) => {
    const params = campaignParamsSchema.parse(request.params);
    const body = metaCampaignDuplicateSchema.parse(request.body ?? {});

    try {
      const result = await duplicateWriteService.duplicateCampaign({
        draft: {
          sourceCampaignId: params.campaignId,
          statusOption: body.statusOption,
          deepCopy: body.deepCopy,
          startTime: body.startTime,
          endTime: body.endTime,
          renameOptions: body.renameOptions,
          parameterOverrides: body.parameterOverrides,
          migrateToAdvantagePlus: body.migrateToAdvantagePlus
        },
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 201);
      return {
        provider: 'meta',
        action: 'duplicate-campaign',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign duplicate failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'duplicate-campaign',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/campaigns/:campaignId/duplicate-tree', async (request, reply) => {
    const params = campaignParamsSchema.parse(request.params);
    const body = metaCampaignDuplicateTreeSchema.parse(request.body ?? {});

    try {
      const result = await duplicateTreeService.duplicateTree({
        draft: {
          sourceCampaignId: params.campaignId,
          statusOption: body.statusOption,
          includeAds: body.includeAds,
          cleanupOnFailure: body.cleanupOnFailure,
          namePrefix: body.namePrefix,
          nameSuffix: body.nameSuffix
        },
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 201);
      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign tree duplicate failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'duplicate-campaign-tree',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/adsets/:adSetId/duplicate', async (request, reply) => {
    const params = adSetParamsSchema.parse(request.params);
    const body = metaAdSetDuplicateSchema.parse(request.body ?? {});

    try {
      const result = await duplicateWriteService.duplicateAdSet({
        draft: {
          sourceAdSetId: params.adSetId,
          targetCampaignId: body.targetCampaignId,
          statusOption: body.statusOption,
          deepCopy: body.deepCopy,
          createDcoAdSet: body.createDcoAdSet,
          startTime: body.startTime,
          endTime: body.endTime,
          renameOptions: body.renameOptions
        },
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 201);
      return {
        provider: 'meta',
        action: 'duplicate-adset',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad set duplicate failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'duplicate-adset',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/ads/:adId/duplicate', async (request, reply) => {
    const params = adParamsSchema.parse(request.params);
    const body = metaAdDuplicateSchema.parse(request.body ?? {});

    try {
      const result = await duplicateWriteService.duplicateAd({
        draft: {
          sourceAdId: params.adId,
          targetAdSetId: body.targetAdSetId,
          statusOption: body.statusOption,
          renameOptions: body.renameOptions,
          creativeParameters: body.creativeParameters
        },
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 201);
      return {
        provider: 'meta',
        action: 'duplicate-ad',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad duplicate failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'duplicate-ad',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/rules/drafts/validate', async (request, reply) => {
    const body = metaRuleDraftValidationSchema.parse(request.body ?? {});

    try {
      const result = ruleValidationService.validateDraft(body);
      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule draft validation failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/rules', async (request, reply) => {
    const body = metaRuleCreateSchema.parse(request.body ?? {});

    try {
      const result = await ruleWriteService.createRule({
        draft: {
          name: body.name,
          status: body.status,
          evaluationSpec: body.evaluationSpec,
          executionSpec: body.executionSpec,
          scheduleSpec: body.scheduleSpec
        },
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 201);
      return {
        provider: 'meta',
        action: 'create-rule',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule create failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'create-rule',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/rules/:ruleId', async (request, reply) => {
    const params = ruleParamsSchema.parse(request.params);
    const body = metaRuleUpdateSchema.parse(request.body ?? {});

    try {
      const result = await ruleWriteService.updateRule({
        ruleId: params.ruleId,
        draft: {
          name: body.name,
          status: body.status,
          evaluationSpec: body.evaluationSpec,
          executionSpec: body.executionSpec,
          scheduleSpec: body.scheduleSpec
        },
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'update-rule',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule update failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'update-rule',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/rules/:ruleId/status', async (request, reply) => {
    const params = ruleParamsSchema.parse(request.params);
    const body = metaRuleStatusSchema.parse(request.body ?? {});

    try {
      const result = await ruleWriteService.changeStatus({
        ruleId: params.ruleId,
        nextStatus: body.status,
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'rule-status-change',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule status change failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'rule-status-change',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/rules/:ruleId/enable', async (request, reply) => {
    const params = ruleParamsSchema.parse(request.params);
    const body = metaRuleEnableDisableSchema.parse(request.body ?? {});

    try {
      const result = await ruleWriteService.enableRule(params.ruleId, body.reason, {
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'enable-rule',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule enable failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'enable-rule',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/rules/:ruleId/disable', async (request, reply) => {
    const params = ruleParamsSchema.parse(request.params);
    const body = metaRuleEnableDisableSchema.parse(request.body ?? {});

    try {
      const result = await ruleWriteService.disableRule(params.ruleId, body.reason, {
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'disable-rule',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule disable failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'disable-rule',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.delete('/internal/providers/meta/rules/:ruleId', async (request, reply) => {
    const params = ruleParamsSchema.parse(request.params);
    const body = metaRuleDeleteSchema.parse(request.body ?? {});

    try {
      const result = await ruleWriteService.deleteRule({
        ruleId: params.ruleId,
        reason: body.reason,
        confirmHighImpact: body.confirmHighImpact,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'delete-rule',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule delete failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'delete-rule',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.delete('/internal/providers/meta/campaigns/:campaignId', async (request, reply) => {
    const params = campaignParamsSchema.parse(request.params);
    const body = metaEntityDeleteSchema.parse(request.body ?? {});

    try {
      const result = await manageCampaignsCleanupService.deleteCampaign({
        targetId: params.campaignId,
        reason: body.reason,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'delete-campaign',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign delete failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'delete-campaign',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.delete('/internal/providers/meta/adsets/:adSetId', async (request, reply) => {
    const params = z.object({ adSetId: z.string().min(1) }).parse(request.params);
    const body = metaEntityDeleteSchema.parse(request.body ?? {});

    try {
      const result = await manageCampaignsCleanupService.deleteAdSet({
        targetId: params.adSetId,
        reason: body.reason,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'delete-adset',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad set delete failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'delete-adset',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.get('/internal/providers/meta/ad-account', async (_request, reply) => {
    try {
      const result = await metaClient.getAdAccountBasic();
      return {
        ok: true,
        provider: 'meta',
        result: result.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad account probe failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.get('/internal/providers/meta/campaigns', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaClient.listCampaigns(query.limit);
      return {
        ok: true,
        provider: 'meta',
        count: result.data.length,
        paging: result.paging ?? null,
        result: result.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaigns fetch failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/campaigns/sync', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaSyncService.syncAccountAndCampaigns(query.limit);
      return {
        ok: true,
        provider: 'meta',
        syncedAccountId: env.META_AD_ACCOUNT_ID,
        campaignCount: result.campaigns.length,
        paging: result.paging,
        account: result.account
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaigns sync failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.get('/internal/providers/meta/adsets', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaClient.listAdSets(query.limit);
      return {
        ok: true,
        provider: 'meta',
        count: result.data.length,
        paging: result.paging ?? null,
        result: result.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad sets fetch failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/adsets/sync', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaSyncService.syncAdSets(query.limit);
      return {
        ok: true,
        provider: 'meta',
        syncedAccountId: env.META_AD_ACCOUNT_ID,
        adSetCount: result.adSets.length,
        paging: result.paging
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad sets sync failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.get('/internal/providers/meta/ads', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaClient.listAds(query.limit);
      return {
        ok: true,
        provider: 'meta',
        count: result.data.length,
        paging: result.paging ?? null,
        result: result.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ads fetch failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.get('/internal/providers/meta/rules', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaClient.listRules(query.limit);
      return {
        ok: true,
        provider: 'meta',
        count: result.data.length,
        paging: result.paging ?? null,
        result: result.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rules fetch failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/rules/sync', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaSyncService.syncRules(query.limit);
      return {
        ok: true,
        provider: 'meta',
        syncedAccountId: env.META_AD_ACCOUNT_ID,
        ruleCount: result.rules.length,
        paging: result.paging
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rules sync failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.get('/internal/providers/meta/rules/history', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaClient.listRuleHistory(query.limit);
      return {
        ok: true,
        provider: 'meta',
        count: result.data.length,
        paging: result.paging ?? null,
        result: result.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule history fetch failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/rules/history/sync', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaSyncService.syncRuleHistory(query.limit);
      return {
        ok: true,
        provider: 'meta',
        syncedAccountId: env.META_AD_ACCOUNT_ID,
        historyCount: result.history.length,
        paging: result.paging
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta rule history sync failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/ads/sync', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaSyncService.syncAds(query.limit);
      return {
        ok: true,
        provider: 'meta',
        syncedAccountId: env.META_AD_ACCOUNT_ID,
        adCount: result.ads.length,
        paging: result.paging
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ads sync failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/hierarchy/sync', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await metaSyncService.syncAccountHierarchy(query.limit);
      return {
        ok: true,
        provider: 'meta',
        syncedAccountId: env.META_AD_ACCOUNT_ID,
        campaignCount: result.campaigns.length,
        adSetCount: result.adSets.length,
        adCount: result.ads.length,
        paging: result.paging,
        adSetPaging: result.adSetPaging,
        adPaging: result.adPaging,
        account: result.account
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta hierarchy sync failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/hierarchy/sync/enqueue', async (request, reply) => {
    const query = campaignLimitSchema.parse(request.query);

    try {
      const result = await enqueueMetaSyncHierarchyJob({
        limit: query.limit,
        requestedBy: 'internal-api'
      });

      reply.code(result.status === 'queued' ? 202 : 200);
      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta hierarchy enqueue failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.get('/internal/providers/meta/snapshots/ad-account', async (_request) => {
    const item = env.META_AD_ACCOUNT_ID
      ? await adAccountSnapshotRepository.getLatest(env.META_AD_ACCOUNT_ID)
      : null;

    return {
      ok: true,
      item
    };
  });

  app.get('/internal/providers/meta/snapshots/campaigns', async (request) => {
    const query = campaignLimitSchema.parse(request.query);
    const items = env.META_AD_ACCOUNT_ID
      ? await campaignSnapshotRepository.listByAccount(env.META_AD_ACCOUNT_ID, query.limit)
      : [];

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/providers/meta/snapshots/adsets', async (request) => {
    const query = campaignLimitSchema.parse(request.query);
    const items = env.META_AD_ACCOUNT_ID
      ? await adSetSnapshotRepository.listByAccount(env.META_AD_ACCOUNT_ID, query.limit)
      : [];

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/providers/meta/snapshots/ads', async (request) => {
    const query = campaignLimitSchema.parse(request.query);
    const items = env.META_AD_ACCOUNT_ID
      ? await adSnapshotRepository.listByAccount(env.META_AD_ACCOUNT_ID, query.limit)
      : [];

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/providers/meta/snapshots/rules', async (request) => {
    const query = campaignLimitSchema.parse(request.query);
    const items = env.META_AD_ACCOUNT_ID
      ? await ruleSnapshotRepository.listByAccount(env.META_AD_ACCOUNT_ID, query.limit)
      : [];

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/providers/meta/snapshots/rules/history', async (request) => {
    const query = campaignLimitSchema.parse(request.query);
    const items = env.META_AD_ACCOUNT_ID
      ? await ruleHistorySnapshotRepository.listByAccount(env.META_AD_ACCOUNT_ID, query.limit)
      : [];

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.post('/internal/providers/meta/campaigns/:campaignId/status', async (request, reply) => {
    const params = campaignParamsSchema.parse(request.params);
    const body = metaTargetStatusSchema.parse(request.body ?? {});

    try {
      const result = await metaWriteService.changeStatus({
        targetType: 'campaign',
        targetId: params.campaignId,
        nextStatus: body.status,
        reason: body.reason,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign status change failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/campaigns/:campaignId/start', async (request, reply) => {
    const params = campaignParamsSchema.parse(request.params);
    const body = metaStartStopSchema.parse(request.body ?? {});

    try {
      const result = await metaWriteService.startCampaign(params.campaignId, body.reason, {
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'start-campaign',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign start failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'start-campaign',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/campaigns/:campaignId/stop', async (request, reply) => {
    const params = campaignParamsSchema.parse(request.params);
    const body = metaStartStopSchema.parse(request.body ?? {});

    try {
      const result = await metaWriteService.stopCampaign(params.campaignId, body.reason, {
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'stop-campaign',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign stop failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'stop-campaign',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/campaigns/:campaignId/budget', async (request, reply) => {
    const params = campaignParamsSchema.parse(request.params);
    const body = metaBudgetSchema.parse(request.body ?? {});

    try {
      const result = await metaWriteService.changeCampaignBudget({
        targetType: 'campaign',
        targetId: params.campaignId,
        nextDailyBudget: body.dailyBudget,
        reason: body.reason,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'set-campaign-budget',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign budget change failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'set-campaign-budget',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/campaigns/:campaignId/budget/increase', async (request, reply) => {
    const params = campaignParamsSchema.parse(request.params);
    const body = metaBudgetDeltaSchema.parse(request.body ?? {});

    try {
      const result = await metaWriteService.increaseCampaignBudget(params.campaignId, body.amount, body.reason, {
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'increase-campaign-budget',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign budget increase failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'increase-campaign-budget',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/campaigns/:campaignId/budget/decrease', async (request, reply) => {
    const params = campaignParamsSchema.parse(request.params);
    const body = metaBudgetDeltaSchema.parse(request.body ?? {});

    try {
      const result = await metaWriteService.decreaseCampaignBudget(params.campaignId, body.amount, body.reason, {
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'decrease-campaign-budget',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta campaign budget decrease failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'decrease-campaign-budget',
        error: {
          code: appError.code,
          message: appError.message,
          details: appError.details ?? null
        }
      };
    }
  });

  app.post('/internal/providers/meta/ads/:adId/status', async (request, reply) => {
    const params = adParamsSchema.parse(request.params);
    const body = metaTargetStatusSchema.parse(request.body ?? {});

    try {
      const result = await metaWriteService.changeStatus({
        targetType: 'ad',
        targetId: params.adId,
        nextStatus: body.status,
        reason: body.reason,
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad status change failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/ads/:adId/start', async (request, reply) => {
    const params = adParamsSchema.parse(request.params);
    const body = metaStartStopSchema.parse(request.body ?? {});

    try {
      const result = await metaWriteService.startAd(params.adId, body.reason, {
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'start-ad',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad start failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'start-ad',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.post('/internal/providers/meta/ads/:adId/stop', async (request, reply) => {
    const params = adParamsSchema.parse(request.params);
    const body = metaStartStopSchema.parse(request.body ?? {});

    try {
      const result = await metaWriteService.stopAd(params.adId, body.reason, {
        dryRun: body.dryRun,
        actor: getActorHeader(request.headers),
        secret: getWriteSecretHeader(request.headers),
        approvalId: getApprovalIdHeader(request.headers),
        approvalToken: getApprovalTokenHeader(request.headers)
      });

      reply.code(body.dryRun ? 200 : 202);
      return {
        provider: 'meta',
        action: 'stop-ad',
        ...result
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Meta ad stop failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'meta',
        action: 'stop-ad',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  app.get('/internal/providers/kie/tasks/:taskId', async (request, reply) => {
    const params = kieTaskParamsSchema.parse(request.params);

    try {
      const result = await kieClient.getTask(params.taskId);
      return {
        ok: true,
        provider: 'kie',
        result: result.data
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('KIE task probe failed');
      reply.code(appError.statusCode >= 400 ? appError.statusCode : 500);
      return {
        ok: false,
        provider: 'kie',
        error: {
          code: appError.code,
          message: appError.message
        }
      };
    }
  });

  const bulkStatusSchema = z.object({
    targetType: z.enum(['campaign', 'ad']),
    targetIds: z.array(z.string().min(1)).min(1).max(100),
    nextStatus: z.enum(['ACTIVE', 'PAUSED']),
    reason: z.string().min(5),
    dryRun: z.boolean().optional().default(true)
  });

  const bulkDeleteSchema = z.object({
    targetType: z.enum(['campaign', 'adset']),
    targetIds: z.array(z.string().min(1)).min(1).max(100),
    reason: z.string().min(5),
    dryRun: z.boolean().optional().default(true)
  });

  const bulkDuplicateSchema = z.object({
    sourceCampaignIds: z.array(z.string().min(1)).min(1).max(25),
    statusOption: z.enum(['ACTIVE', 'PAUSED', 'INHERITED_FROM_SOURCE']).optional(),
    deepCopy: z.boolean().optional(),
    confirmHighImpact: z.boolean().optional(),
    reason: z.string().min(5),
    dryRun: z.boolean().optional().default(true)
  });

  app.post('/internal/providers/meta/bulk/status', async (request) => {
    const body = bulkStatusSchema.parse(request.body);
    return bulkActionsService.bulkChangeStatus({
      targetType: body.targetType,
      targetIds: body.targetIds,
      nextStatus: body.nextStatus,
      reason: body.reason,
      dryRun: body.dryRun,
      actor: getActorHeader(request.headers),
      secret: getWriteSecretHeader(request.headers),
      approvalId: getApprovalIdHeader(request.headers),
      approvalToken: getApprovalTokenHeader(request.headers)
    });
  });

  app.post('/internal/providers/meta/bulk/delete', async (request) => {
    const body = bulkDeleteSchema.parse(request.body);
    return bulkActionsService.bulkDelete({
      targetType: body.targetType,
      targetIds: body.targetIds,
      reason: body.reason,
      dryRun: body.dryRun,
      actor: getActorHeader(request.headers),
      secret: getWriteSecretHeader(request.headers),
      approvalId: getApprovalIdHeader(request.headers),
      approvalToken: getApprovalTokenHeader(request.headers)
    });
  });

  app.post('/internal/providers/meta/bulk/duplicate-campaigns', async (request) => {
    const body = bulkDuplicateSchema.parse(request.body);
    return bulkActionsService.bulkDuplicateCampaigns({
      sourceCampaignIds: body.sourceCampaignIds,
      statusOption: body.statusOption,
      deepCopy: body.deepCopy,
      confirmHighImpact: body.confirmHighImpact,
      reason: body.reason,
      dryRun: body.dryRun,
      actor: getActorHeader(request.headers),
      secret: getWriteSecretHeader(request.headers),
      approvalId: getApprovalIdHeader(request.headers),
      approvalToken: getApprovalTokenHeader(request.headers)
    });
  });
}
