import 'dotenv/config';
import { defineConfig } from '@playwright/test';

const port = Number(process.env.SMOKE_TEST_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://metaads:metaads@127.0.0.1:5432/meta_ads_dev';
const smokeDashboardUsername = process.env.SMOKE_DASHBOARD_USERNAME ?? 'smoke-admin';
const smokeDashboardPassword = process.env.SMOKE_DASHBOARD_PASSWORD ?? 'smoke-pass-123';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run build && node dist/server.js',
    url: `${baseURL}/dashboard/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'error',
      DATABASE_URL: databaseUrl,
      DASHBOARD_AUTH_ENABLED: 'true',
      DASHBOARD_USERNAME: smokeDashboardUsername,
      DASHBOARD_PASSWORD: smokeDashboardPassword,
      DASHBOARD_SESSION_SECRET: process.env.DASHBOARD_SESSION_SECRET ?? 'smoke-dashboard-session-secret-1234567890',
      DASHBOARD_COOKIE_SECURE: 'false'
    }
  }
});
