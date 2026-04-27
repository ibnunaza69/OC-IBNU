export function formatDateTime(value?: string | null) {
  if (!value) {
    return '—'
  }

  try {
    return new Date(value).toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: false,
      timeZone: 'UTC'
    })
  } catch {
    return value
  }
}

export function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

export function toneFromStatus(status?: string | boolean | null) {
  if (typeof status === 'boolean') {
    return status ? 'success' : 'error'
  }

  switch ((status ?? '').toString().toLowerCase()) {
    case 'up':
    case 'valid':
    case 'configured':
    case 'active':
    case 'succeeded':
    case 'success':
    case 'enabled':
      return 'success'
    case 'queued':
    case 'running':
    case 'pending':
    case 'processing':
      return 'warning'
    case 'invalid':
    case 'failed':
    case 'error':
    case 'down':
      return 'error'
    default:
      return 'neutral'
  }
}
