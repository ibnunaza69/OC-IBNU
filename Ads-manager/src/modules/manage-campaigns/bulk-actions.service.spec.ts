import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BulkActionsService } from './bulk-actions.service.js';

const changeStatus = vi.fn();
vi.mock('../meta-write/meta-write.service.js', () => ({
  MetaWriteService: vi.fn(() => ({ changeStatus })),
}));

const deleteCampaign = vi.fn();
const deleteAdSet = vi.fn();
vi.mock('./manage-campaigns-cleanup.service.js', () => ({
  ManageCampaignsCleanupService: vi.fn(() => ({ deleteCampaign, deleteAdSet })),
}));

const duplicateCampaign = vi.fn();
vi.mock('./duplicate-write.service.js', () => ({
  DuplicateWriteService: vi.fn(() => ({ duplicateCampaign })),
}));

describe('BulkActionsService', () => {
  let service: BulkActionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BulkActionsService();
  });

  it('bulkChangeStatus runs changeStatus per target and aggregates results', async () => {
    changeStatus.mockResolvedValueOnce({ ok: true, mode: 'dry-run' });
    changeStatus.mockRejectedValueOnce(new Error('boom'));

    const result = await service.bulkChangeStatus({
      targetType: 'campaign',
      targetIds: ['c1', 'c2'],
      nextStatus: 'PAUSED',
      reason: 'bulk pause test',
      dryRun: true,
    });

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0]?.status).toBe('success');
    expect(result.results[1]?.status).toBe('failed');
    expect(result.results[1]?.error?.message).toBe('boom');
  });

  it('bulkChangeStatus deduplicates target IDs', async () => {
    changeStatus.mockResolvedValue({ ok: true });

    const result = await service.bulkChangeStatus({
      targetType: 'campaign',
      targetIds: ['c1', 'c1', 'c1'],
      nextStatus: 'PAUSED',
      reason: 'dedup test',
      dryRun: true,
    });

    expect(result.total).toBe(1);
    expect(changeStatus).toHaveBeenCalledTimes(1);
  });

  it('bulkDelete routes campaign vs adset correctly', async () => {
    deleteCampaign.mockResolvedValue({ ok: true });
    deleteAdSet.mockResolvedValue({ ok: true });

    await service.bulkDelete({
      targetType: 'campaign',
      targetIds: ['c1'],
      reason: 'cleanup test',
      dryRun: true,
    });
    await service.bulkDelete({
      targetType: 'adset',
      targetIds: ['a1'],
      reason: 'cleanup test',
      dryRun: true,
    });

    expect(deleteCampaign).toHaveBeenCalledTimes(1);
    expect(deleteAdSet).toHaveBeenCalledTimes(1);
  });

  it('bulkDuplicateCampaigns forwards status + deepCopy options', async () => {
    duplicateCampaign.mockResolvedValue({ ok: true });

    await service.bulkDuplicateCampaigns({
      sourceCampaignIds: ['src1', 'src2'],
      statusOption: 'PAUSED',
      deepCopy: true,
      reason: 'bulk dup test',
      dryRun: true,
    });

    expect(duplicateCampaign).toHaveBeenCalledTimes(2);
    const firstCall = duplicateCampaign.mock.calls[0]?.[0];
    expect(firstCall.draft.sourceCampaignId).toBe('src1');
    expect(firstCall.draft.statusOption).toBe('PAUSED');
    expect(firstCall.draft.deepCopy).toBe(true);
  });
});
