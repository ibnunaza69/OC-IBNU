import { randomUUID } from 'node:crypto';

export type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;
export type HttpBody = JsonValue | URLSearchParams | FormData | string;

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: HttpBody;
  timeoutMs?: number;
}

export async function httpJson<T>(url: string, options: HttpRequestOptions = {}): Promise<{ requestId: string; status: number; data: T }> {
  const requestId = randomUUID();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);

  const headers: Record<string, string> = {
    ...(options.headers ?? {})
  };

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    signal: controller.signal
  };

  if (options.body !== undefined) {
    if (options.body instanceof URLSearchParams) {
      init.body = options.body.toString();
      if (!headers['content-type']) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
      }
    } else if (options.body instanceof FormData) {
      init.body = options.body;
    } else if (typeof options.body === 'string') {
      init.body = options.body;
      if (!headers['content-type']) {
        headers['content-type'] = 'text/plain';
      }
    } else {
      init.body = JSON.stringify(options.body);
      if (!headers['content-type']) {
        headers['content-type'] = 'application/json';
      }
    }
  } else if (!headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  try {
    const response = await fetch(url, init);
    const contentType = response.headers.get('content-type') || '';
    
    let data: unknown;
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { requestId, status: response.status, data: data as T };
  } finally {
    clearTimeout(timeoutId);
  }
}
