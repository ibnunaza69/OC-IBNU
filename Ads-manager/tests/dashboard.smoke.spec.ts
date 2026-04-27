import { expect, test, type Page } from '@playwright/test';

const dashboardUsername = process.env.SMOKE_DASHBOARD_USERNAME ?? 'smoke-admin';
const dashboardPassword = process.env.SMOKE_DASHBOARD_PASSWORD ?? 'smoke-pass-123';

async function login(page: Page) {
  await page.goto('/dashboard/login');
  await expect(page.getByTestId('login-form')).toBeVisible();

  await page.getByTestId('login-username').fill(dashboardUsername);
  await page.getByTestId('login-password').fill(dashboardPassword);
  await page.getByTestId('login-submit').click();

  await expect(page).toHaveURL(/\/dashboard(\/overview)?$/);
  await expect(page.getByTestId('overview-page')).toBeVisible();
}

test('unauthenticated protected route redirects to login', async ({ page }) => {
  await page.goto('/dashboard/campaigns');
  await expect(page).toHaveURL(/\/dashboard\/login$/);
  await expect(page.getByTestId('login-form')).toBeVisible();
});

test('authenticated dashboard smoke: login, routes, and basic SPA interactions', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Refresh dashboard' }).click();
  await expect(page.getByTestId('overview-page')).toBeVisible();

  await page.goto('/dashboard/campaigns');
  await expect(page.getByTestId('campaigns-page')).toBeVisible();
  await page.getByTestId('campaigns-search').fill('promo');
  await page.getByTestId('campaigns-search').clear();

  const campaignWriteOps = page.getByTestId('campaign-write-ops');
  if (await campaignWriteOps.count()) {
    await expect(campaignWriteOps).toBeVisible();
    await page.getByTestId('campaign-write-reason').fill('Smoke test dashboard write UI');
    await page.getByTestId('campaign-write-reason').clear();
  }

  await page.goto('/dashboard/creatives');
  await expect(page.getByTestId('creatives-page')).toBeVisible();
  await page.getByTestId('creatives-search').fill('video');
  await page.getByTestId('creatives-search').clear();

  await page.goto('/dashboard/workflows');
  await expect(page.getByTestId('workflows-page')).toBeVisible();
  await page.getByTestId('workflows-refresh').click();
  await expect(page.getByTestId('workflows-page')).toBeVisible();

  const workflowItems = page.locator('[data-testid^="workflow-item-"]');
  if (await workflowItems.count()) {
    await workflowItems.first().click();
  }

  await page.goto('/dashboard/settings');
  await expect(page.getByTestId('settings-page')).toBeVisible();
  await page.getByTestId('settings-reason').fill('Smoke test only - do not submit');
  await page.getByTestId('settings-reason').clear();

  await page.getByTestId('nav-overview').click();
  await expect(page.getByTestId('overview-page')).toBeVisible();
});
