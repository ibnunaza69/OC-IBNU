export interface AuditEvent {
  operationType: string;
  actor: string;
  targetType: string;
  targetId: string;
  status: 'pending' | 'success' | 'failed';
  reason?: string;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: Record<string, unknown>;
}
