import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configService } from '../../config/settings.js';
import { SettingsRepository } from '../foundation/settings/settings.repository.js';

const ENV_PATH = resolve(process.cwd(), '.env');

export interface DashboardRuntimeConfigSnapshot {
  dashboardAuthEnabled: boolean;
  dashboardUsername: string | null;
  dashboardPasswordHashConfigured: boolean;
  dashboardCookieSecure: boolean;
  dashboardSessionTtlSeconds: number;
  dashboardLoginMaxAttempts: number;
  dashboardLoginBlockMinutes: number;
  metaAccessTokenConfigured: boolean;
  metaAdAccountId: string | null;
  brandName: string;
  metaPixelId: string | null;
  metaWriteEnabled: boolean;
  metaWriteApprovalRequired: boolean;
  metaAppId: string | null;
  metaAppSecretConfigured: boolean;
  metaOAuthRedirectUri: string | null;
  metaGraphApiVersion: string;
  kieApiKeyConfigured: boolean;
  kieCallbackUrl: string | null;
}

export interface DashboardRuntimeSecrets {
  metaAppId: string | null;
  metaAppSecret: string | null;
  metaOAuthRedirectUri: string | null;
  metaGraphApiVersion: string;
}

export interface DashboardSettingsUpdateInput {
  brandName?: string | null | undefined;
  metaPixelId?: string | null | undefined;
  dashboardUsername?: string | null | undefined;
  dashboardAuthEnabled?: boolean | undefined;
  dashboardCookieSecure?: boolean | undefined;
  dashboardSessionTtlSeconds?: number | undefined;
  dashboardLoginMaxAttempts?: number | undefined;
  dashboardLoginBlockMinutes?: number | undefined;
  metaAccessToken?: string | null | undefined;
  metaAdAccountId?: string | null | undefined;
  metaWriteEnabled?: boolean | undefined;
  metaWriteApprovalRequired?: boolean | undefined;
  metaAppId?: string | null | undefined;
  metaAppSecret?: string | null | undefined;
  metaOAuthRedirectUri?: string | null | undefined;
  metaGraphApiVersion?: string | null | undefined;
  kieApiKey?: string | null | undefined;
  kieCallbackUrl?: string | null | undefined;
}

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized)
    ? true
    : ['0', 'false', 'no', 'off'].includes(normalized)
      ? false
      : defaultValue;
}

function parseNumber(value: string | undefined, defaultValue: number) {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

async function readEnvFile() {
  try {
    return await readFile(ENV_PATH, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

function parseEnv(raw: string) {
  const map = new Map<string, string>();
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    if (!line || /^\s*#/.test(line) || !line.includes('=')) {
      continue;
    }

    const index = line.indexOf('=');
    const key = line.slice(0, index);
    const value = line.slice(index + 1);
    map.set(key, value);
  }

  return { lines, map };
}

function upsertEnvLine(lines: string[], key: string, value: string) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  const nextLine = `${key}=${value}`;

  if (index === -1) {
    lines.push(nextLine);
    return;
  }

  lines[index] = nextLine;
}

function normalizeNullableString(value: string | null | undefined) {
  return value === undefined
    ? undefined
    : value === null
      ? ''
      : value.trim();
}

async function resolveDashboardRuntimeConfig(raw: string) {
  const { map } = parseEnv(raw);

  return {
    dashboardAuthEnabled: parseBoolean(map.get('DASHBOARD_AUTH_ENABLED'), true),
    dashboardUsername: map.get('DASHBOARD_USERNAME')?.trim() || null,
    dashboardPasswordHashConfigured: Boolean(map.get('DASHBOARD_PASSWORD_HASH')?.trim()),
    dashboardCookieSecure: parseBoolean(map.get('DASHBOARD_COOKIE_SECURE'), false),
    dashboardSessionTtlSeconds: parseNumber(map.get('DASHBOARD_SESSION_TTL_SECONDS'), 43200),
    dashboardLoginMaxAttempts: parseNumber(map.get('DASHBOARD_LOGIN_MAX_ATTEMPTS'), 5),
    dashboardLoginBlockMinutes: parseNumber(map.get('DASHBOARD_LOGIN_BLOCK_MINUTES'), 15),
    metaAccessTokenConfigured: Boolean(await configService.getMetaAccessToken() || map.get('META_ACCESS_TOKEN')?.trim()),
    metaAdAccountId: (await configService.getMetaAccountId()) || map.get('META_AD_ACCOUNT_ID')?.trim() || null,
    brandName: await configService.getBrandName(),
    metaPixelId: await configService.getMetaPixelId() || null,
    metaWriteEnabled: parseBoolean(map.get('META_WRITE_ENABLED'), false),
    metaWriteApprovalRequired: parseBoolean(map.get('META_WRITE_APPROVAL_REQUIRED'), true),
    metaAppId: map.get('META_APP_ID')?.trim() || null,
    metaAppSecretConfigured: Boolean(map.get('META_APP_SECRET')?.trim()),
    metaOAuthRedirectUri: map.get('META_OAUTH_REDIRECT_URI')?.trim() || null,
    metaGraphApiVersion: map.get('META_GRAPH_API_VERSION')?.trim() || 'v25.0',
    kieApiKeyConfigured: Boolean(map.get('KIE_API_KEY')?.trim()),
    kieCallbackUrl: map.get('KIE_CALLBACK_URL')?.trim() || null
  } satisfies DashboardRuntimeConfigSnapshot;
}

export async function getDashboardRuntimeConfig() {
  const raw = await readEnvFile();
  return await resolveDashboardRuntimeConfig(raw);
}

export async function getDashboardRuntimeSecrets() {
  const raw = await readEnvFile();
  const { map } = parseEnv(raw);

  return {
    metaAppId: map.get('META_APP_ID')?.trim() || null,
    metaAppSecret: map.get('META_APP_SECRET')?.trim() || null,
    metaOAuthRedirectUri: map.get('META_OAUTH_REDIRECT_URI')?.trim() || null,
    metaGraphApiVersion: map.get('META_GRAPH_API_VERSION')?.trim() || 'v25.0'
  } satisfies DashboardRuntimeSecrets;
}

export async function updateDashboardRuntimeConfig(input: DashboardSettingsUpdateInput) {
  const raw = await readEnvFile();
  const { lines } = parseEnv(raw);
  const settingsRepo = new SettingsRepository();

  if (input.brandName !== undefined) {
    await settingsRepo.set('BRAND_NAME', input.brandName?.trim() || 'My Brand');
  }

  if (input.metaPixelId !== undefined) {
    const value = input.metaPixelId?.trim() ?? '';
    if (value) {
      await settingsRepo.set('META_PIXEL_ID', value);
    } else {
      await settingsRepo.delete('META_PIXEL_ID');
    }
  }

  const nullableDashboardUsername = normalizeNullableString(input.dashboardUsername);
  if (nullableDashboardUsername !== undefined) {
    upsertEnvLine(lines, 'DASHBOARD_USERNAME', nullableDashboardUsername);
  }

  if (input.dashboardAuthEnabled !== undefined) {
    upsertEnvLine(lines, 'DASHBOARD_AUTH_ENABLED', String(input.dashboardAuthEnabled));
  }

  if (input.dashboardCookieSecure !== undefined) {
    upsertEnvLine(lines, 'DASHBOARD_COOKIE_SECURE', String(input.dashboardCookieSecure));
  }

  if (input.dashboardSessionTtlSeconds !== undefined) {
    upsertEnvLine(lines, 'DASHBOARD_SESSION_TTL_SECONDS', String(input.dashboardSessionTtlSeconds));
  }

  if (input.dashboardLoginMaxAttempts !== undefined) {
    upsertEnvLine(lines, 'DASHBOARD_LOGIN_MAX_ATTEMPTS', String(input.dashboardLoginMaxAttempts));
  }

  if (input.dashboardLoginBlockMinutes !== undefined) {
    upsertEnvLine(lines, 'DASHBOARD_LOGIN_BLOCK_MINUTES', String(input.dashboardLoginBlockMinutes));
  }

  const nullableMetaAccessToken = normalizeNullableString(input.metaAccessToken);
  if (nullableMetaAccessToken !== undefined) {
    if (nullableMetaAccessToken) {
      await settingsRepo.set('META_ACCESS_TOKEN', nullableMetaAccessToken);
    } else {
      await settingsRepo.delete('META_ACCESS_TOKEN');
    }
  }

  const nullableMetaAdAccountId = normalizeNullableString(input.metaAdAccountId);
  if (nullableMetaAdAccountId !== undefined) {
    if (nullableMetaAdAccountId) {
      await settingsRepo.set('META_AD_ACCOUNT_ID', nullableMetaAdAccountId);
    } else {
      await settingsRepo.delete('META_AD_ACCOUNT_ID');
    }
  }

  if (input.metaWriteEnabled !== undefined) {
    upsertEnvLine(lines, 'META_WRITE_ENABLED', String(input.metaWriteEnabled));
  }

  if (input.metaWriteApprovalRequired !== undefined) {
    upsertEnvLine(lines, 'META_WRITE_APPROVAL_REQUIRED', String(input.metaWriteApprovalRequired));
  }

  const nullableMetaAppId = normalizeNullableString(input.metaAppId);
  if (nullableMetaAppId !== undefined) {
    upsertEnvLine(lines, 'META_APP_ID', nullableMetaAppId);
  }

  const nullableMetaAppSecret = normalizeNullableString(input.metaAppSecret);
  if (nullableMetaAppSecret !== undefined) {
    upsertEnvLine(lines, 'META_APP_SECRET', nullableMetaAppSecret);
  }

  const nullableMetaOAuthRedirectUri = normalizeNullableString(input.metaOAuthRedirectUri);
  if (nullableMetaOAuthRedirectUri !== undefined) {
    upsertEnvLine(lines, 'META_OAUTH_REDIRECT_URI', nullableMetaOAuthRedirectUri);
  }

  const nullableMetaGraphApiVersion = normalizeNullableString(input.metaGraphApiVersion);
  if (nullableMetaGraphApiVersion !== undefined) {
    upsertEnvLine(lines, 'META_GRAPH_API_VERSION', nullableMetaGraphApiVersion || 'v25.0');
  }

  const nullableKieApiKey = normalizeNullableString(input.kieApiKey);
  if (nullableKieApiKey !== undefined) {
    upsertEnvLine(lines, 'KIE_API_KEY', nullableKieApiKey);
  }

  const nullableKieCallbackUrl = normalizeNullableString(input.kieCallbackUrl);
  if (nullableKieCallbackUrl !== undefined) {
    upsertEnvLine(lines, 'KIE_CALLBACK_URL', nullableKieCallbackUrl);
  }

  await writeFile(ENV_PATH, `${lines.join('\n').replace(/\n+$/,'')}\n`, 'utf8');
  return getDashboardRuntimeConfig();
}
