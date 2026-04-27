import { configService } from '../../../config/settings.js';
import { AppError } from '../../../lib/errors.js';
import { httpJson } from '../../../lib/http.js';
import { AuditRepository } from '../../foundation/audit/audit.repository.js';
import { CredentialsStateRepository } from '../../foundation/credentials/credentials.repository.js';
import { ProviderRequestLogRepository } from '../../foundation/provider-logs/provider-request-log.repository.js';
import { mapKieError } from '../shared/provider-errors.js';
import type {
  KieRunwayVideoCreateResponse,
  KieRunwayVideoDetailResponse,
  KieTaskCreateResponse,
  KieTaskDetailResponse
} from './kie.types.js';

const KIE_API_BASE_URL = 'https://api.kie.ai';

export class KieClient {
  private readonly credentialsRepository = new CredentialsStateRepository();
  private readonly requestLogRepository = new ProviderRequestLogRepository();
  private readonly auditRepository = new AuditRepository();

  private async getAuthHeaders() {
    const apiKey = await configService.getKieApiKey();
    if (!apiKey) {
      await this.credentialsRepository.setState({
        provider: 'kie',
        subject: 'default',
        isValid: false,
        invalidReason: 'KIE_API_KEY is not configured'
      });

      await this.auditRepository.create({
        operationType: 'kie.read',
        actor: 'system',
        targetType: 'kie-auth',
        targetId: 'default',
        status: 'failed',
        reason: 'KIE_API_KEY is not configured',
        metadata: {
          normalizedErrorCode: 'AUTH_INVALID'
        }
      });

      throw new AppError('KIE_API_KEY is not configured', 'AUTH_INVALID', 500);
    }

    return {
      Authorization: `Bearer ${apiKey}`
    };
  }

  async getTask(taskId: string) {
    const response = await httpJson<KieTaskDetailResponse>(`${KIE_API_BASE_URL}/api/v1/gpt4o-image/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: await this.getAuthHeaders()
    });

    await this.requestLogRepository.create({
      requestId: response.requestId,
      provider: 'kie',
      endpoint: `/api/v1/gpt4o-image/record-info?taskId=${taskId}`,
      method: 'GET',
      statusCode: response.status,
      objectType: 'kie-task',
      objectId: taskId,
      responseBody: response.data
    });

    if (!String(response.status).startsWith('2') || response.data.code !== 200) {
      const error = mapKieError(response.status, response.data);

      await this.credentialsRepository.setState({
        provider: 'kie',
        subject: 'default',
        isValid: false,
        invalidReason: error.message
      });

      await this.auditRepository.create({
        operationType: 'kie.read',
        actor: 'system',
        targetType: 'kie-task',
        targetId: taskId,
        status: 'failed',
        reason: error.message,
        metadata: {
          endpoint: '/api/v1/gpt4o-image/record-info',
          requestId: response.requestId,
          normalizedErrorCode: error.code,
          statusCode: response.status,
          providerCode: response.data.code
        }
      });

      throw error;
    }

    await this.credentialsRepository.setState({
      provider: 'kie',
      subject: 'default',
      isValid: true,
      invalidReason: null
    });

    await this.auditRepository.create({
      operationType: 'kie.read',
      actor: 'system',
      targetType: 'kie-task',
      targetId: taskId,
      status: 'success',
      metadata: {
        endpoint: '/api/v1/gpt4o-image/record-info',
        requestId: response.requestId,
        statusCode: response.status,
        providerCode: response.data.code
      }
    });

    return response;
  }

  async createImageTask(payload: Record<string, unknown>) {
    const response = await httpJson<KieTaskCreateResponse>(`${KIE_API_BASE_URL}/api/v1/gpt4o-image/generate`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: payload
    });

    await this.requestLogRepository.create({
      requestId: response.requestId,
      provider: 'kie',
      endpoint: '/api/v1/gpt4o-image/generate',
      method: 'POST',
      objectType: 'kie-task',
      statusCode: response.status,
      payload,
      responseBody: response.data
    });

    if (!String(response.status).startsWith('2') || response.data.code !== 200) {
      const error = mapKieError(response.status, response.data);

      await this.credentialsRepository.setState({
        provider: 'kie',
        subject: 'default',
        isValid: false,
        invalidReason: error.message
      });

      await this.auditRepository.create({
        operationType: 'kie.write',
        actor: 'system',
        targetType: 'kie-task',
        targetId: 'create',
        status: 'failed',
        reason: error.message,
        metadata: {
          endpoint: '/api/v1/gpt4o-image/generate',
          requestId: response.requestId,
          normalizedErrorCode: error.code,
          statusCode: response.status,
          providerCode: response.data.code
        }
      });

      throw error;
    }

    await this.credentialsRepository.setState({
      provider: 'kie',
      subject: 'default',
      isValid: true,
      invalidReason: null
    });

    await this.auditRepository.create({
      operationType: 'kie.write',
      actor: 'system',
      targetType: 'kie-task',
      targetId: response.data.data?.taskId ?? 'unknown',
      status: 'success',
      metadata: {
        endpoint: '/api/v1/gpt4o-image/generate',
        requestId: response.requestId,
        statusCode: response.status,
        providerCode: response.data.code
      }
    });

    return response;
  }

  async createRunwayVideoTask(payload: Record<string, unknown>) {
    const response = await httpJson<KieRunwayVideoCreateResponse>(`${KIE_API_BASE_URL}/api/v1/runway/generate`, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: payload
    });

    await this.requestLogRepository.create({
      requestId: response.requestId,
      provider: 'kie',
      endpoint: '/api/v1/runway/generate',
      method: 'POST',
      objectType: 'kie-runway-video-task',
      statusCode: response.status,
      payload,
      responseBody: response.data
    });

    if (!String(response.status).startsWith('2') || response.data.code !== 200) {
      const error = mapKieError(response.status, response.data);

      await this.credentialsRepository.setState({
        provider: 'kie',
        subject: 'default',
        isValid: false,
        invalidReason: error.message
      });

      await this.auditRepository.create({
        operationType: 'kie.write',
        actor: 'system',
        targetType: 'kie-runway-video-task',
        targetId: 'create',
        status: 'failed',
        reason: error.message,
        metadata: {
          endpoint: '/api/v1/runway/generate',
          requestId: response.requestId,
          normalizedErrorCode: error.code,
          statusCode: response.status,
          providerCode: response.data.code
        }
      });

      throw error;
    }

    await this.credentialsRepository.setState({
      provider: 'kie',
      subject: 'default',
      isValid: true,
      invalidReason: null
    });

    await this.auditRepository.create({
      operationType: 'kie.write',
      actor: 'system',
      targetType: 'kie-runway-video-task',
      targetId: response.data.data?.taskId ?? 'unknown',
      status: 'success',
      metadata: {
        endpoint: '/api/v1/runway/generate',
        requestId: response.requestId,
        statusCode: response.status,
        providerCode: response.data.code
      }
    });

    return response;
  }

  async getRunwayVideoTask(taskId: string) {
    const response = await httpJson<KieRunwayVideoDetailResponse>(`${KIE_API_BASE_URL}/api/v1/runway/record-detail?taskId=${encodeURIComponent(taskId)}`, {
      headers: await this.getAuthHeaders()
    });

    await this.requestLogRepository.create({
      requestId: response.requestId,
      provider: 'kie',
      endpoint: `/api/v1/runway/record-detail?taskId=${taskId}`,
      method: 'GET',
      statusCode: response.status,
      objectType: 'kie-runway-video-task',
      objectId: taskId,
      responseBody: response.data
    });

    if (!String(response.status).startsWith('2') || response.data.code !== 200) {
      const error = mapKieError(response.status, response.data);

      await this.credentialsRepository.setState({
        provider: 'kie',
        subject: 'default',
        isValid: false,
        invalidReason: error.message
      });

      await this.auditRepository.create({
        operationType: 'kie.read',
        actor: 'system',
        targetType: 'kie-runway-video-task',
        targetId: taskId,
        status: 'failed',
        reason: error.message,
        metadata: {
          endpoint: '/api/v1/runway/record-detail',
          requestId: response.requestId,
          normalizedErrorCode: error.code,
          statusCode: response.status,
          providerCode: response.data.code
        }
      });

      throw error;
    }

    await this.credentialsRepository.setState({
      provider: 'kie',
      subject: 'default',
      isValid: true,
      invalidReason: null
    });

    await this.auditRepository.create({
      operationType: 'kie.read',
      actor: 'system',
      targetType: 'kie-runway-video-task',
      targetId: taskId,
      status: 'success',
      metadata: {
        endpoint: '/api/v1/runway/record-detail',
        requestId: response.requestId,
        statusCode: response.status,
        providerCode: response.data.code
      }
    });

    return response;
  }
}
