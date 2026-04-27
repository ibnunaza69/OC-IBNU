export type MetaWriteTargetType = 'campaign' | 'ad';
export type MetaWritableStatus = 'ACTIVE' | 'PAUSED';
export type MetaBudgetWriteTargetType = 'campaign';

export interface MetaStatusWriteRequest {
  targetType: MetaWriteTargetType;
  targetId: string;
  nextStatus: MetaWritableStatus;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}

export interface MetaBudgetWriteRequest {
  targetType: MetaBudgetWriteTargetType;
  targetId: string;
  nextDailyBudget: number;
  reason: string;
  dryRun?: boolean | undefined;
  actor?: string | undefined;
  secret?: string | undefined;
  approvalId?: string | undefined;
  approvalToken?: string | undefined;
}
