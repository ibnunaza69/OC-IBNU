import { AppError, type NormalizedErrorCode } from '../../../lib/errors.js';
import type { MetaApiErrorShape } from '../meta/meta.types.js';

export function mapMetaError(status: number, payload: MetaApiErrorShape | unknown): AppError {
  const metaPayload = payload as MetaApiErrorShape;
  const message = metaPayload?.error?.message ?? 'Meta request failed';
  const code = metaPayload?.error?.code;

  let normalized: NormalizedErrorCode = 'REMOTE_TEMPORARY_FAILURE';

  if (status === 401 || code === 190) {
    normalized = 'AUTH_EXPIRED';
  } else if (status === 403 || code === 10 || code === 200) {
    normalized = 'PERMISSION_DENIED';
  } else if (status === 404) {
    normalized = 'RESOURCE_NOT_FOUND';
  } else if (status === 429 || code === 4 || code === 17 || code === 341) {
    normalized = 'RATE_LIMITED';
  } else if (status === 400 || status === 422) {
    normalized = 'VALIDATION_ERROR';
  }

  return new AppError(message, normalized, status, payload);
}

export function mapKieError(status: number, payload: unknown): AppError {
  const body = payload as { code?: number; msg?: string } | undefined;
  const message = body?.msg ?? 'KIE request failed';

  let normalized: NormalizedErrorCode = 'REMOTE_TEMPORARY_FAILURE';

  if (status === 401 || body?.code === 401) {
    normalized = 'AUTH_INVALID';
  } else if (status === 402 || body?.code === 402) {
    normalized = 'INSUFFICIENT_CREDITS';
  } else if (status === 404 || body?.code === 404) {
    normalized = 'RESOURCE_NOT_FOUND';
  } else if (status === 429 || body?.code === 429) {
    normalized = 'RATE_LIMITED';
  } else if (status === 400 || status === 422 || body?.code === 422) {
    normalized = 'VALIDATION_ERROR';
  }

  return new AppError(message, normalized, status, payload);
}
