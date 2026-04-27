import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GoogleWriteService } from '../manage-campaigns/google-write.service.js';

/**
 * Google Ads API Agent Routes (Target Version: v24 - April 2026)
 * 
 * These routes act as the primary interface for AI agents to interact with
 * Google Ads. They handle the payload parsing, normalization, and orchestration
 * before sending requests to the underlying Google Ads API client.
 */
export async function registerGoogleAgentRoutes(app: FastifyInstance) {
  // Schema for AI agent requests
  const googleAgentCreateSchema = z.object({
    payload: z.any().describe('The raw payload to send to Google Ads API'),
    approvalToken: z.string().optional().describe('Token for write operations approval'),
    dryRun: z.boolean().optional().default(false).describe('If true, validates without making changes'),
    reason: z.string().min(5).default('AI Agent Request').describe('Reason provided by AI Agent for this action')
  });

  const statusSchema = z.object({
    status: z.enum(['ENABLED', 'PAUSED', 'REMOVED']).describe('Target status for the object'),
    reason: z.string().min(5).describe('Reason provided by AI Agent for this action'),
    dryRun: z.boolean().optional().default(false).describe('If true, validates without making changes')
  });

  const budgetSchema = z.object({
    amount: z.number().int().positive().describe('Budget amount in local currency (micros or full amount depending on mapper)'),
    reason: z.string().min(5).describe('Reason provided by AI Agent for this budget update'),
    dryRun: z.boolean().optional().default(false).describe('If true, validates without making changes')
  });

  const googleWriteService = new GoogleWriteService();

  // ---------------------------------------------------------
  // Google Ads Campaign Endpoints
  // ---------------------------------------------------------

  /**
   * POST /google/campaigns/create
   * Creates a new Google Ads campaign.
   */
  app.post('/google/campaigns/create', async (request, reply) => {
    const { payload, approvalToken, dryRun, reason } = googleAgentCreateSchema.parse(request.body);
    const result = await googleWriteService.createCampaign({ draft: payload, reason, ...(approvalToken ? { approvalToken } : {}), dryRun });
    return { ok: true, result };
  });

  /**
   * POST /google/adgroups/create
   * Creates a new Google Ads AdGroup.
   */
  app.post('/google/adgroups/create', async (request, reply) => {
    const { payload, approvalToken, dryRun, reason } = googleAgentCreateSchema.parse(request.body);
    const result = await googleWriteService.createAdGroup({ draft: payload, reason, ...(approvalToken ? { approvalToken } : {}), dryRun });
    return { ok: true, result };
  });

  /**
   * POST /google/ads/create
   * Creates a new Google Ad within an AdGroup.
   */
  app.post('/google/ads/create', async (request, reply) => {
    const { payload, approvalToken, dryRun, reason } = googleAgentCreateSchema.parse(request.body);
    const result = await googleWriteService.createAd({ draft: payload, reason, ...(approvalToken ? { approvalToken } : {}), dryRun });
    return { ok: true, result };
  });

  /**
   * POST /google/campaigns/:campaignId/status
   * Updates the status of an existing Google Ads campaign.
   */
  app.post('/google/campaigns/:campaignId/status', async (request, reply) => {
    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);
    const { status, reason, dryRun } = statusSchema.parse(request.body);
    const result = await googleWriteService.changeStatus({
      targetType: 'campaign',
      targetId: campaignId,
      nextStatus: status,
      reason,
      dryRun
    });
    return { ok: true, result };
  });

  /**
   * POST /google/campaigns/:campaignId/budget
   * Updates the budget of an existing Google Ads campaign.
   */
  app.post('/google/campaigns/:campaignId/budget', async (request, reply) => {
    const { campaignId } = z.object({ campaignId: z.string() }).parse(request.params);
    const { amount, reason, dryRun } = budgetSchema.parse(request.body);
    const result = await googleWriteService.changeCampaignBudget({
      targetType: 'campaign',
      targetId: campaignId,
      nextDailyBudget: amount,
      reason,
      dryRun
    });
    return { ok: true, result };
  });
}
