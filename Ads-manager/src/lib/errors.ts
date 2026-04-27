export type NormalizedErrorCode =
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_CREDITS'
  | 'REMOTE_TEMPORARY_FAILURE'
  | 'RESOURCE_NOT_FOUND'
  | 'POLICY_REJECTED'
  | 'UNKNOWN_ERROR';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: NormalizedErrorCode = 'UNKNOWN_ERROR',
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}
