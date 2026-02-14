import { expect, test } from '@playwright/test';

// @live suites are excluded from CI and deterministic defaults.
test('@live E2E-LIVE-SMOKE-001: app shell loads against live runtime', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Apotheon' })).toBeVisible();
});
