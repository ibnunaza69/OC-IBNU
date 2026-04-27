import 'dotenv/config';
import { z } from 'zod';

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => value === '' ? undefined : value, schema);

const booleanFromEnv = (defaultValue = false) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();

      if (['1', 'true', 'yes', 'on'].includes(normalized)) {
        return true;
      }

      if (['0', 'false', 'no', 'off'].includes(normalized)) {
        return false;
      }
    }

    return value;
  }, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1).default('postgres://metaads:metaads@127.0.0.1:5432/meta_ads_dev'),
  BRAND_NAME: emptyToUndefined(z.string().min(1).optional()),
  META_ACCESS_TOKEN: emptyToUndefined(z.string().min(1).optional()),
  META_AD_ACCOUNT_ID: emptyToUndefined(z.string().min(1).optional()),
  META_PIXEL_ID: emptyToUndefined(z.string().min(1).optional()),
  META_APP_ID: emptyToUndefined(z.string().min(1).optional()),
  META_APP_SECRET: emptyToUndefined(z.string().min(1).optional()),
  META_OAUTH_REDIRECT_URI: emptyToUndefined(z.string().url().optional()),
  META_GRAPH_API_VERSION: emptyToUndefined(z.string().min(2).optional()),
  META_SYNC_HIERARCHY_CRON: emptyToUndefined(z.string().min(1).optional()),
  META_VERIFICATION_RUNNER_CRON: emptyToUndefined(z.string().min(1).optional()),
  META_VERIFICATION_RUNNER_CONFIG_JSON: emptyToUndefined(z.string().min(1).optional()),
  META_WRITE_ENABLED: booleanFromEnv(false).default(false),
  META_WRITE_SECRET: emptyToUndefined(z.string().min(1).optional()),
  META_WRITE_APPROVAL_REQUIRED: booleanFromEnv(true).default(true),
  META_WRITE_APPROVAL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  META_BUDGET_MAX_ABSOLUTE_DELTA: z.coerce.number().int().positive().default(500000),
  META_BUDGET_MAX_PERCENT_DELTA: z.coerce.number().positive().default(50),
  KIE_API_KEY: emptyToUndefined(z.string().min(1).optional()),
  KIE_CALLBACK_URL: emptyToUndefined(z.string().url().optional()),
  GOOGLE_DEVELOPER_TOKEN: emptyToUndefined(z.string().min(1).optional()),
  GOOGLE_CLIENT_ID: emptyToUndefined(z.string().min(1).optional()),
  GOOGLE_CLIENT_SECRET: emptyToUndefined(z.string().min(1).optional()),
  GOOGLE_REFRESH_TOKEN: emptyToUndefined(z.string().min(1).optional()),
  GOOGLE_LOGIN_CUSTOMER_ID: emptyToUndefined(z.string().min(1).optional()),
  DASHBOARD_AUTH_ENABLED: booleanFromEnv(true).default(true),
  DASHBOARD_USERNAME: emptyToUndefined(z.string().min(1).max(128).optional()),
  DASHBOARD_PASSWORD: emptyToUndefined(z.string().min(8).optional()),
  DASHBOARD_PASSWORD_HASH: emptyToUndefined(z.string().min(16).optional()),
  DASHBOARD_SESSION_SECRET: emptyToUndefined(z.string().min(32).optional()),
  DASHBOARD_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(43200),
  DASHBOARD_COOKIE_SECURE: booleanFromEnv(false).default(false),
  DASHBOARD_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  DASHBOARD_LOGIN_BLOCK_MINUTES: z.coerce.number().int().positive().default(15)
}).superRefine((value, ctx) => {
  if (!value.DASHBOARD_AUTH_ENABLED) {
    return;
  }

  if (!value.DASHBOARD_USERNAME) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DASHBOARD_USERNAME is required when dashboard auth is enabled',
      path: ['DASHBOARD_USERNAME']
    });
  }

  if (!value.DASHBOARD_PASSWORD && !value.DASHBOARD_PASSWORD_HASH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Set DASHBOARD_PASSWORD_HASH or DASHBOARD_PASSWORD when dashboard auth is enabled',
      path: ['DASHBOARD_PASSWORD_HASH']
    });
  }

  if (!value.DASHBOARD_SESSION_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'DASHBOARD_SESSION_SECRET is required when dashboard auth is enabled',
      path: ['DASHBOARD_SESSION_SECRET']
    });
  }
});

export type AppEnv = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
