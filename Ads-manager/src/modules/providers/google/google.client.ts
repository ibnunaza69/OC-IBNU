import { env } from '../../../config/env.js';
import { AppError } from '../../../lib/errors.js';
import { type HttpBody, httpJson } from '../../../lib/http.js';
import { AuditRepository } from '../../foundation/audit/audit.repository.js';
import { CredentialsStateRepository } from '../../foundation/credentials/credentials.repository.js';
import { ProviderRequestLogRepository } from '../../foundation/provider-logs/provider-request-log.repository.js';

const GOOGLE_OAUTH2_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ADS_API_VERSION = 'v24';
const GOOGLE_ADS_BASE_URL = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

interface GoogleRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: HttpBody;
  headers?: Record<string, string>;
  logPayload?: unknown;
}

export class GoogleAdsClient {
  private readonly credentialsRepository = new CredentialsStateRepository();
  private readonly requestLogRepository = new ProviderRequestLogRepository();
  private readonly auditRepository = new AuditRepository();
  
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
      throw new AppError('Google Ads credentials (client id, secret, refresh token) are not fully configured', 'AUTH_INVALID', 500);
    }

    const response = await httpJson<{ access_token: string; expires_in: number }>(GOOGLE_OAUTH2_URL, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token'
      })
    });

    if (!String(response.status).startsWith('2') || !response.data?.access_token) {
      throw new AppError('Failed to refresh Google Ads access token', 'AUTH_INVALID', response.status, { data: response.data });
    }

    this.accessToken = response.data.access_token;
    // expires_in is usually 3600 seconds, substract 60s for safety margin
    this.tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;

    return this.accessToken;
  }

  private async request<T>(
    path: string,
    context: { objectType?: string; objectId?: string } = {},
    options: GoogleRequestOptions = {},
    operationType: 'google.read' | 'google.write' = 'google.read'
  ) {
    if (!env.GOOGLE_DEVELOPER_TOKEN || !env.GOOGLE_LOGIN_CUSTOMER_ID) {
      throw new AppError('GOOGLE_DEVELOPER_TOKEN or GOOGLE_LOGIN_CUSTOMER_ID is not configured', 'AUTH_INVALID', 500);
    }

    const token = await this.getAccessToken();
    const url = `${GOOGLE_ADS_BASE_URL}${path}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'developer-token': env.GOOGLE_DEVELOPER_TOKEN,
      'login-customer-id': env.GOOGLE_LOGIN_CUSTOMER_ID,
      ...options.headers
    };

    if (options.body && !(options.body instanceof URLSearchParams || options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const requestOptions = {
      method: options.method ?? 'GET',
      headers,
      ...(options.body === undefined ? {} : { body: options.body instanceof URLSearchParams || options.body instanceof FormData ? options.body : JSON.stringify(options.body) })
    };

    const response = await httpJson<T & { error?: any }>(url, requestOptions);
    const loggedPayload = options.logPayload ?? options.body;

    await this.requestLogRepository.create({
      requestId: response.requestId,
      provider: 'google-ads',
      endpoint: path,
      method: options.method ?? 'GET',
      statusCode: response.status,
      objectType: context.objectType,
      objectId: context.objectId,
      payload: loggedPayload,
      responseBody: response.data
    });

    if (!String(response.status).startsWith('2')) {
      const errorMessage = response.data?.error?.message ?? 'Unknown Google Ads API Error';
      
      await this.auditRepository.create({
        operationType,
        actor: 'system',
        targetType: context.objectType ?? 'google-resource',
        targetId: context.objectId ?? path,
        status: 'failed',
        reason: errorMessage,
        metadata: {
          endpoint: path,
          requestId: response.requestId,
          statusCode: response.status,
          method: options.method ?? 'GET'
        }
      });

      throw new AppError(errorMessage, 'UNKNOWN_ERROR', response.status, { providerResponse: response.data });
    }

    await this.credentialsRepository.setState({
      provider: 'google-ads',
      subject: env.GOOGLE_LOGIN_CUSTOMER_ID,
      isValid: true,
      invalidReason: null
    });

    await this.auditRepository.create({
      operationType,
      actor: 'system',
      targetType: context.objectType ?? 'google-resource',
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
      data: response.data
    };
  }

  async get<T>(path: string, context: { objectType?: string; objectId?: string } = {}) {
    return this.request<T>(path, context, { method: 'GET' }, 'google.read');
  }

  async post<T>(path: string, body: HttpBody, context: { objectType?: string; objectId?: string } = {}) {
    return this.request<T>(path, context, { method: 'POST', body }, 'google.write');
  }

  // --- Helper Methods ---

  async search(customerId: string, query: string) {
    return this.post<any>(`/customers/${customerId}/googleAds:search`, { query }, {
      objectType: 'search',
      objectId: customerId
    });
  }

  async mutateCampaigns(customerId: string, operations: any[]) {
    return this.post<any>(`/customers/${customerId}/campaigns:mutate`, { operations }, {
      objectType: 'campaign-mutate',
      objectId: customerId
    });
  }

  async mutateAdGroups(customerId: string, operations: any[]) {
    return this.post<any>(`/customers/${customerId}/adGroups:mutate`, { operations }, {
      objectType: 'adgroup-mutate',
      objectId: customerId
    });
  }

  async mutateAdGroupAds(customerId: string, operations: any[]) {
    return this.post<any>(`/customers/${customerId}/adGroupAds:mutate`, { operations }, {
      objectType: 'adgroup-ad-mutate',
      objectId: customerId
    });
  }
}