import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CampaignWriteService } from '../manage-campaigns/campaign-write.service.js';
import { AdSetWriteService } from '../manage-campaigns/adset-write.service.js';
import { AdWriteService } from '../manage-campaigns/ad-write.service.js';
import { DuplicateTreeService } from '../manage-campaigns/duplicate-tree.service.js';
import { MetaWriteService } from '../meta-write/meta-write.service.js';
import { AnalysisService } from '../analysis/analysis.service.js';
import { CopyService } from '../copywriting-lab/copy.service.js';
import { ImageGenerationService } from '../asset-generation/image-generation.service.js';

/**
 * Meta Ads API Agent Routes (Target Version: Graph API v25.0 - Feb 2026)
 * 
 * These routes provide a standardized interface for AI agents to interact with
 * Meta Ads. They orchestrate complex operations such as creation, duplication,
 * and delivery control while enforcing validation, logging, and security.
 */
export async function registerMetaAgentRoutes(app: FastifyInstance) {
  // Schema definitions
  const metaAgentCreateSchema = z.object({
    payload: z.any().describe('The raw payload to send to Meta Ads API'),
    reason: z.string().default('AI Agent Request').describe('Reason provided by AI Agent for this action'),
    approvalToken: z.string().optional().describe('Token for write operations approval'),
    dryRun: z.boolean().optional().default(false).describe('If true, validates without making changes')
  });

  const duplicateSchema = z.object({
    approvalToken: z.string().optional().describe('Token for write operations approval'),
    status_option: z.enum(['ACTIVE', 'PAUSED']).default('PAUSED').describe('Target status for the duplicated object'),
    dryRun: z.boolean().optional().default(false).describe('If true, validates without making changes'),
    reason: z.string().default('AI Agent Request').describe('Reason provided by AI Agent for this action')
  });

  const statusSchema = z.object({
    status: z.enum(['ACTIVE', 'PAUSED']).describe('Target status for the object'),
    reason: z.string().min(5).default('AI Agent Status Update').describe('Reason provided by AI Agent for this status update'),
    dryRun: z.boolean().optional().default(false).describe('If true, validates without making changes'),
    approvalToken: z.string().optional().describe('Token for write operations approval')
  });

  const budgetSchema = z.object({
    amount: z.number().int().positive().describe('Budget amount in local currency (cents depending on Meta setup)'),
    reason: z.string().min(5).default('AI Agent Budget Update').describe('Reason provided by AI Agent for this budget update'),
    dryRun: z.boolean().optional().default(false).describe('If true, validates without making changes'),
    approvalToken: z.string().optional().describe('Token for write operations approval')
  });

  const creativeGenerateSchema = z.object({
    campaignId: z.string().optional().describe('Context Campaign ID for copy variants'),
    adSetId: z.string().optional().describe('Context AdSet ID for copy variants'),
    adId: z.string().optional().describe('Context Ad ID for copy variants'),
    brief: z.string().min(5).describe('Brief text for copy generation'),
    productName: z.string().optional().describe('Name of the product'),
    targetAudience: z.string().optional().describe('Target audience description'),
    desiredOutcome: z.string().optional().describe('Desired outcome for the audience'),
    styles: z.array(z.string()).optional().describe('Copy styles (e.g. benefit-led, promo)'),
    toneKeywords: z.array(z.string()).optional().describe('Keywords for tone (e.g. urgent, elegant)'),
    callToActionType: z.string().optional().describe('CTA type (e.g. SHOP_NOW)'),
    imagePrompt: z.string().optional().describe('If provided, triggers KIE image generation task'),
    reason: z.string().min(5).default('AI Agent Creative Generation').describe('Reason for this generation task')
  });

  // Service instantiation
  const metaWriteService = new MetaWriteService();
  const analysisService = new AnalysisService();
  const copyService = new CopyService();
  const imageService = new ImageGenerationService();

  // ---------------------------------------------------------
  // Meta Ads Campaign Endpoints
  // ---------------------------------------------------------

  /**
   * POST /meta/campaigns/create
   * Creates a new Meta Ads campaign.
   */
  app.post('/meta/campaigns/create', async (request, reply) => {
    const { payload, reason, approvalToken, dryRun } = metaAgentCreateSchema.parse(request.body);
    const service = new CampaignWriteService();
    const result = await service.createCampaign({ draft: payload, reason, approvalToken, dryRun });
    return { ok: true, result };
  });

  /**
   * POST /meta/adsets/create
   * Creates a new Meta Ads AdSet within a campaign.
   */
  app.post('/meta/adsets/create', async (request, reply) => {
    const { payload, reason, approvalToken, dryRun } = metaAgentCreateSchema.parse(request.body);
    const service = new AdSetWriteService();
    const result = await service.createAdSet({ draft: payload, reason, approvalToken, dryRun });
    return { ok: true, result };
  });

  /**
   * POST /meta/ads/create
   * Creates a new Meta Ad within an AdSet.
   */
  app.post('/meta/ads/create', async (request, reply) => {
    const { payload, reason, approvalToken, dryRun } = metaAgentCreateSchema.parse(request.body);
    const service = new AdWriteService();
    const result = await service.createAd({ draft: payload, reason, approvalToken, dryRun });
    return { ok: true, result };
  });

  /**
   * POST /meta/campaigns/:campaignId/duplicate-tree
   * Duplicates an entire campaign tree (Campaign -> AdSet -> Ad).
   */
  app.post('/meta/campaigns/:campaignId/duplicate-tree', async (request, reply) => {
    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);
    const { approvalToken, status_option, dryRun, reason } = duplicateSchema.parse(request.body);
    const service = new DuplicateTreeService();
    const result = await service.duplicateTree({ 
      draft: { sourceCampaignId: campaignId, statusOption: status_option as any }, 
      reason,
      dryRun, 
      approvalToken 
    });
    return { ok: true, result };
  });

  /**
   * POST /meta/campaigns/:campaignId/status
   * Updates the status of an existing Meta Ads campaign.
   */
  app.post('/meta/campaigns/:campaignId/status', async (request, reply) => {
    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);
    const { status, reason, dryRun, approvalToken } = statusSchema.parse(request.body);
    
    const result = await metaWriteService.changeStatus({
      targetType: 'campaign',
      targetId: campaignId,
      nextStatus: status,
      reason,
      dryRun,
      approvalToken
    });
    
    return { ok: true, result };
  });

  /**
   * POST /meta/campaigns/:campaignId/budget
   * Updates the budget of an existing Meta Ads campaign.
   */
  app.post('/meta/campaigns/:campaignId/budget', async (request, reply) => {
    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);
    const { amount, reason, dryRun, approvalToken } = budgetSchema.parse(request.body);
    
    const result = await metaWriteService.changeCampaignBudget({
      targetType: 'campaign',
      targetId: campaignId,
      nextDailyBudget: amount,
      reason,
      dryRun,
      approvalToken
    });
    
    return { ok: true, result };
  });

  // ---------------------------------------------------------
  // Agent Placeholder / Integrations Endpoints
  // ---------------------------------------------------------

  /**
   * POST /meta/campaigns/:campaignId/insights
   * Retrieve performance insights and metrics for a specific Meta Ads campaign.
   */
  app.post('/meta/campaigns/:campaignId/insights', async (request, reply) => {
    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);
    const result = await analysisService.getCampaignInsights(campaignId);
    return { ok: true, result };
  });

  /**
   * POST /meta/creatives/generate
   * Trigger copy variant generation and optionally a KIE image generation task.
   */
  app.post('/meta/creatives/generate', async (request, reply) => {
    const input = creativeGenerateSchema.parse(request.body);
    
    // 1. Generate Copy Variants
    const copyResult = await copyService.generateVariants({
      brief: input.brief,
      productName: input.productName,
      targetAudience: input.targetAudience,
      desiredOutcome: input.desiredOutcome,
      styles: input.styles,
      toneKeywords: input.toneKeywords,
      callToActionType: input.callToActionType,
      campaignId: input.campaignId,
      adSetId: input.adSetId,
      adId: input.adId,
      actor: 'ai-agent',
      reason: input.reason
    });

    // 2. Generate Image (Optional)
    let imageResult = null;
    if (input.imagePrompt) {
      imageResult = await imageService.createImageGenerationTask({
        providerPayload: { prompt: input.imagePrompt },
        actor: 'ai-agent',
        reason: input.reason
      });
    }

    return { 
      ok: true, 
      result: {
        copyVariants: copyResult,
        imageTask: imageResult
      }
    };
  });
}
