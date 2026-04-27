import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { GoogleAdsClient } from '../providers/google/google.client.js';

export class GoogleWriteService {
  private readonly googleClient = new GoogleAdsClient();

  async createCampaign(input: { draft: any; reason: string; approvalToken?: string; dryRun?: boolean }) {
    if (input.dryRun) {
      return { ok: true, mode: 'dry-run', draft: input.draft, message: 'Dry run successful' };
    }
    
    const customerId = env.GOOGLE_LOGIN_CUSTOMER_ID;
    if (!customerId) {
      throw new AppError('GOOGLE_LOGIN_CUSTOMER_ID is not configured', 'AUTH_INVALID', 500);
    }

    const response = await this.googleClient.mutateCampaigns(customerId, [
      { create: input.draft }
    ]);
    
    return { ok: true, mode: 'live', result: response.data };
  }

  async createAdGroup(input: { draft: any; reason: string; approvalToken?: string; dryRun?: boolean }) {
    if (input.dryRun) {
      return { ok: true, mode: 'dry-run', draft: input.draft, message: 'Dry run successful' };
    }
    
    const customerId = env.GOOGLE_LOGIN_CUSTOMER_ID;
    if (!customerId) {
      throw new AppError('GOOGLE_LOGIN_CUSTOMER_ID is not configured', 'AUTH_INVALID', 500);
    }

    const response = await this.googleClient.mutateAdGroups(customerId, [
      { create: input.draft }
    ]);
    
    return { ok: true, mode: 'live', result: response.data };
  }

  async createAd(input: { draft: any; reason: string; approvalToken?: string; dryRun?: boolean }) {
    if (input.dryRun) {
      return { ok: true, mode: 'dry-run', draft: input.draft, message: 'Dry run successful' };
    }
    
    const customerId = env.GOOGLE_LOGIN_CUSTOMER_ID;
    if (!customerId) {
      throw new AppError('GOOGLE_LOGIN_CUSTOMER_ID is not configured', 'AUTH_INVALID', 500);
    }

    const response = await this.googleClient.mutateAdGroupAds(customerId, [
      { create: input.draft }
    ]);
    
    return { ok: true, mode: 'live', result: response.data };
  }

  async changeStatus(input: { targetType: string; targetId: string; nextStatus: string; reason: string; dryRun?: boolean }) {
    if (input.dryRun) {
      return { ok: true, mode: 'dry-run', targetId: input.targetId, nextStatus: input.nextStatus, message: 'Dry run successful' };
    }
    
    const customerId = env.GOOGLE_LOGIN_CUSTOMER_ID;
    if (!customerId) {
      throw new AppError('GOOGLE_LOGIN_CUSTOMER_ID is not configured', 'AUTH_INVALID', 500);
    }

    let response;
    if (input.targetType === 'campaign') {
      response = await this.googleClient.mutateCampaigns(customerId, [
        {
          update: {
            resourceName: `customers/${customerId}/campaigns/${input.targetId}`,
            status: input.nextStatus
          },
          updateMask: 'status'
        }
      ]);
    } else {
      throw new AppError(`Target type ${input.targetType} is not supported for status change yet`, 'VALIDATION_ERROR', 400);
    }
    
    return { ok: true, mode: 'live', result: response.data };
  }

  async changeCampaignBudget(input: { targetType: string; targetId: string; nextDailyBudget: number; reason: string; dryRun?: boolean }) {
    if (input.dryRun) {
      return { ok: true, mode: 'dry-run', targetId: input.targetId, nextDailyBudget: input.nextDailyBudget, message: 'Dry run successful' };
    }
    
    const customerId = env.GOOGLE_LOGIN_CUSTOMER_ID;
    if (!customerId) {
      throw new AppError('GOOGLE_LOGIN_CUSTOMER_ID is not configured', 'AUTH_INVALID', 500);
    }

    if (input.targetType === 'campaign') {
      // In Google Ads API, budget is often a separate resource (CampaignBudget).
      // If the targetId is actually the campaign resource name, we would first need to get the budget resource name,
      // or if targetId is the budget ID:
      const response = await this.googleClient.post(`/customers/${customerId}/campaignBudgets:mutate`, {
        operations: [
          {
            update: {
              resourceName: `customers/${customerId}/campaignBudgets/${input.targetId}`,
              amountMicros: input.nextDailyBudget
            },
            updateMask: 'amountMicros'
          }
        ]
      }, { objectType: 'campaign-budget-mutate', objectId: input.targetId });

      return { ok: true, mode: 'live', result: response.data };
    } else {
      throw new AppError(`Target type ${input.targetType} is not supported for budget change yet`, 'VALIDATION_ERROR', 400);
    }
  }
}