import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageGenerationService } from './image-generation.service.js';
import { AppError } from '../../lib/errors.js';

vi.mock('../../config/env.js', () => ({
  env: {
    KIE_CALLBACK_URL: 'https://callback.url',
  },
}));

const mockAuditCreate = vi.fn();
vi.mock('../foundation/audit/audit.repository.js', () => ({
  AuditRepository: vi.fn().mockImplementation(() => ({
    create: mockAuditCreate,
  })),
}));

const mockAssetFindById = vi.fn();
const mockAssetUpsert = vi.fn();
const mockAssetUpdateById = vi.fn();
vi.mock('./asset.repository.js', () => ({
  AssetLibraryRepository: vi.fn().mockImplementation(() => ({
    findById: mockAssetFindById,
    upsert: mockAssetUpsert,
    updateById: mockAssetUpdateById,
  })),
}));

const mockTaskCreate = vi.fn();
const mockTaskFindById = vi.fn();
const mockTaskFindByProviderTaskId = vi.fn();
const mockTaskUpdateById = vi.fn();
vi.mock('./task.repository.js', () => ({
  AssetGenerationTaskRepository: vi.fn().mockImplementation(() => ({
    create: mockTaskCreate,
    findById: mockTaskFindById,
    findByProviderTaskId: mockTaskFindByProviderTaskId,
    updateById: mockTaskUpdateById,
  })),
}));

const mockKieClient = {
  createImageTask: vi.fn(),
  getTask: vi.fn(),
};
vi.mock('../providers/kie/kie.client.js', () => ({
  KieClient: vi.fn().mockImplementation(() => mockKieClient),
}));

vi.mock('./image-asset-metadata.js', () => ({
  fetchImageAssetMetadata: vi.fn().mockResolvedValue({
    mimeType: 'image/jpeg',
    width: 1024,
    height: 1024,
    thumbnailUrl: 'https://thumb.url',
    byteSize: 12345,
    filename: 'test.jpg',
    sourceUrl: 'https://source.url',
  }),
}));

describe('ImageGenerationService', () => {
  let service: ImageGenerationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ImageGenerationService();
  });

  describe('createImageGenerationTask', () => {
    it('should throw if reason is too short', async () => {
      await expect(
        service.createImageGenerationTask({
          providerPayload: { prompt: 'cat' },
          reason: 'abc', // < 5 chars
        })
      ).rejects.toThrow(/Reason is required/);
    });

    it('should throw if providerPayload is not an object', async () => {
      await expect(
        service.createImageGenerationTask({
          providerPayload: [] as any,
          reason: 'Valid reason',
        })
      ).rejects.toThrow(/providerPayload must be an object/);
    });

    it('should create an image generation task successfully', async () => {
      mockKieClient.createImageTask.mockResolvedValue({
        data: { data: { taskId: 'kie_task_1' } },
        requestId: 'req_1',
        status: 200,
      });

      mockTaskCreate.mockResolvedValue({
        id: 'task_1',
        providerTaskId: 'kie_task_1',
        taskType: 'image-generate',
      });

      const result = await service.createImageGenerationTask({
        providerPayload: { prompt: 'a cute cat' },
        reason: 'Generate cute cat image',
        enqueuePolling: true,
      });

      expect(result.ok).toBe(true);
      expect(result.mode).toBe('live');
      expect(result.provider).toBe('kie');
      expect(mockKieClient.createImageTask).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'a cute cat', callBackUrl: 'https://callback.url' })
      );
      expect(mockTaskCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          providerTaskId: 'kie_task_1',
          status: 'submitted',
        })
      );
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'asset.image.generate',
          status: 'success',
        })
      );
    });

    it('should handle dryRun mode', async () => {
      const result = await service.createImageGenerationTask({
        providerPayload: { prompt: 'a cute cat' },
        reason: 'Preview generation',
        dryRun: true,
      });

      expect(result.ok).toBe(true);
      expect(result.mode).toBe('dry-run');
      expect(mockKieClient.createImageTask).not.toHaveBeenCalled();
      expect(mockTaskCreate).not.toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'asset.image.generate-preview',
          status: 'pending',
        })
      );
    });
  });

  describe('refreshKieImageTask', () => {
    it('should refresh and update task status on success', async () => {
      mockTaskFindById.mockResolvedValue({
        id: 'task_1',
        provider: 'kie',
        providerTaskId: 'kie_task_1',
        taskType: 'image-generate',
        normalizedInput: { payload: { prompt: 'test' } },
      });

      mockKieClient.getTask.mockResolvedValue({
        data: {
          data: {
            taskId: 'kie_task_1',
            status: 'success',
            successFlag: 1,
            response: { resultUrls: ['https://image.url'] },
          },
        },
        requestId: 'req_2',
        status: 200,
      });

      mockTaskUpdateById.mockResolvedValue({
        id: 'task_1',
        providerTaskId: 'kie_task_1',
        taskType: 'image-generate',
        status: 'succeeded',
        normalizedInput: { payload: { prompt: 'test' } },
      });

      mockAssetUpsert.mockResolvedValue({
        id: 'asset_1',
        assetType: 'image',
        originalUrl: 'https://image.url',
      });

      mockAssetFindById.mockResolvedValue({
        id: 'asset_1',
        assetType: 'image',
        originalUrl: 'https://image.url',
        metadata: {},
      });

      mockAssetUpdateById.mockResolvedValue({
        id: 'asset_1',
        assetType: 'image',
        mimeType: 'image/jpeg',
      });

      const result = await service.refreshKieImageTask({
        taskId: 'task_1',
        actor: 'user-1',
      });

      expect(result.ok).toBe(true);
      expect(result.remote.status).toBe('success');
      expect(result.remote.resultUrls).toContain('https://image.url');
      expect(mockKieClient.getTask).toHaveBeenCalledWith('kie_task_1');
      expect(mockTaskUpdateById).toHaveBeenCalledWith(
        'task_1',
        expect.objectContaining({ status: 'succeeded' })
      );
      expect(mockAssetUpsert).toHaveBeenCalled();
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'asset.image.poll',
          status: 'success',
        })
      );
    });

    it('should handle failed task refresh', async () => {
      mockTaskFindById.mockResolvedValue({
        id: 'task_1',
        provider: 'kie',
        providerTaskId: 'kie_task_1',
      });

      mockKieClient.getTask.mockResolvedValue({
        data: {
          data: {
            taskId: 'kie_task_1',
            status: 'failed',
            errorCode: 500,
            errorMessage: 'Internal Error',
          },
        },
        requestId: 'req_3',
        status: 200,
      });

      mockTaskUpdateById.mockResolvedValue({
        id: 'task_1',
        providerTaskId: 'kie_task_1',
        status: 'failed',
      });

      const result = await service.refreshKieImageTask({ taskId: 'task_1' });

      expect(result.ok).toBe(true);
      expect(result.remote.status).toBe('failed');
      expect(mockTaskUpdateById).toHaveBeenCalledWith(
        'task_1',
        expect.objectContaining({ status: 'failed', errorMessage: 'Internal Error' })
      );
      expect(mockAssetUpsert).not.toHaveBeenCalled();
    });
  });

  describe('ingestKieCallback', () => {
    it('should process successful callback', async () => {
      mockTaskFindByProviderTaskId.mockResolvedValue({
        id: 'task_1',
        providerTaskId: 'kie_task_1',
        normalizedInput: {},
      });

      mockTaskUpdateById.mockResolvedValue({
        id: 'task_1',
        providerTaskId: 'kie_task_1',
        status: 'succeeded',
        normalizedInput: {},
      });

      mockAssetUpsert.mockResolvedValue({
        id: 'asset_1',
        assetType: 'image',
        originalUrl: 'https://image.url',
      });

      mockAssetFindById.mockResolvedValue({
        id: 'asset_1',
        assetType: 'image',
        originalUrl: 'https://image.url',
        metadata: {},
      });

      mockAssetUpdateById.mockResolvedValue({
        id: 'asset_1',
        assetType: 'image',
      });

      const payload = {
        taskId: 'kie_task_1',
        status: 'success',
        response: { resultUrls: ['https://image.url'] },
      };

      const result = await service.ingestKieCallback(payload);

      expect(result.ok).toBe(true);
      expect(mockTaskUpdateById).toHaveBeenCalledWith(
        'task_1',
        expect.objectContaining({ status: 'succeeded' })
      );
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'asset.image.callback',
          status: 'success',
        })
      );
    });

    it('should ignore unknown tasks', async () => {
      mockTaskFindByProviderTaskId.mockResolvedValue(null);

      const payload = { taskId: 'unknown_task' };
      const result = await service.ingestKieCallback(payload);

      expect(result.ok).toBe(false);
      expect(result.status).toBe('ignored');
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'asset.image.callback',
          status: 'failed',
        })
      );
    });
  });
});
