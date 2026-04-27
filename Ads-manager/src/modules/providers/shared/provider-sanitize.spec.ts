import { describe, it, expect } from 'vitest';
import { sanitizeProviderPayload } from './provider-sanitize';

describe('sanitizeProviderPayload', () => {
  it('should redact sensitive keys', () => {
    const payload = {
      accessToken: 'my-super-secret-token',
      API_SECRET: 'my-api-secret',
      userPassword: 'my-password',
      Authorization: 'Bearer token123',
      normalKey: 'normalValue',
    };

    const sanitized = sanitizeProviderPayload(payload);

    expect(sanitized).toEqual({
      accessToken: '[REDACTED]',
      API_SECRET: '[REDACTED]',
      userPassword: '[REDACTED]',
      Authorization: '[REDACTED]',
      normalKey: 'normalValue',
    });
  });

  it('should redact access_token in URL strings', () => {
    const payload = {
      next: 'https://example.com/callback?access_token=12345&other=67890',
      someUrl: 'https://example.com/api?access_token=secret_token',
      normalUrl: 'https://example.com/api?other=67890',
      invalidUrl: 'not-a-url?access_token=123',
    };

    const sanitized = sanitizeProviderPayload(payload);

    expect(sanitized).toEqual({
      next: 'https://example.com/callback?access_token=%5BREDACTED%5D&other=67890',
      someUrl: 'https://example.com/api?access_token=%5BREDACTED%5D',
      normalUrl: 'https://example.com/api?other=67890',
      invalidUrl: 'not-a-url?access_token=123',
    });
  });

  it('should truncate very long strings without spaces', () => {
    const longString = 'a'.repeat(2001);
    const longStringWithSpaces = 'a'.repeat(1000) + ' ' + 'a'.repeat(1001);
    
    const payload = {
      longVal: longString,
      longWithSpace: longStringWithSpaces,
      shortVal: 'short string',
    };

    const sanitized = sanitizeProviderPayload(payload);

    expect(sanitized).toEqual({
      longVal: '[TRUNCATED_LONG_STRING]',
      longWithSpace: longStringWithSpaces,
      shortVal: 'short string',
    });
  });

  it('should handle nested objects', () => {
    const payload = {
      level1: {
        token: 'secret',
        level2: {
          normal: 'value',
          secret: 'hidden',
        },
      },
    };

    const sanitized = sanitizeProviderPayload(payload);

    expect(sanitized).toEqual({
      level1: {
        token: '[REDACTED]',
        level2: {
          normal: 'value',
          secret: '[REDACTED]',
        },
      },
    });
  });

  it('should handle arrays of objects', () => {
    const payload = [
      { id: 1, token: 'secret1' },
      { id: 2, password: 'secret2' },
      'normal-string',
      ['nested-array', { apiSecret: 'secret3' }]
    ];

    const sanitized = sanitizeProviderPayload(payload);

    expect(sanitized).toEqual([
      { id: 1, token: '[REDACTED]' },
      { id: 2, password: '[REDACTED]' },
      'normal-string',
      ['nested-array', { apiSecret: '[REDACTED]' }]
    ]);
  });

  it('should return primitive values unchanged', () => {
    expect(sanitizeProviderPayload('string')).toBe('string');
    expect(sanitizeProviderPayload(123)).toBe(123);
    expect(sanitizeProviderPayload(true)).toBe(true);
    expect(sanitizeProviderPayload(null)).toBe(null);
    expect(sanitizeProviderPayload(undefined)).toBe(undefined);
  });
});
