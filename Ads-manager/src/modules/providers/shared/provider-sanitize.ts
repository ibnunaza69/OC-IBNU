function sanitizeUrlString(value: string) {
  try {
    const url = new URL(value);
    if (url.searchParams.has('access_token')) {
      url.searchParams.set('access_token', '[REDACTED]');
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function sanitizeProviderPayload<T>(payload: T): T {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeProviderPayload(item)) as T;
  }

  if (payload && typeof payload === 'object') {
    const entries = Object.entries(payload as Record<string, unknown>).map(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('token') || lowerKey.includes('secret') || lowerKey.includes('password') || lowerKey.includes('authorization')) {
        return [key, '[REDACTED]'];
      }

      if (typeof value === 'string') {
        if (key === 'next' || value.includes('access_token=')) {
          return [key, sanitizeUrlString(value)];
        }
        if (value.length > 2000 && !value.includes(' ')) {
          return [key, '[TRUNCATED_LONG_STRING]'];
        }
      }

      return [key, sanitizeProviderPayload(value)];
    });

    return Object.fromEntries(entries) as T;
  }

  return payload;
}
