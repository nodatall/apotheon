import { expect, test } from '@playwright/test';
import { registerDeterministicApiMocks } from '../mocks/provider-fixtures';

test('E2E-NAV-HEALTH-001: required pages render and navigate', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');

  for (const navLabel of ['Dashboard', 'Assets', 'Protocols', 'History', 'Settings']) {
    await page.getByRole('button', { name: navLabel }).click();
    await expect(page.locator('h2, h3').first()).toBeVisible();
  }
});
