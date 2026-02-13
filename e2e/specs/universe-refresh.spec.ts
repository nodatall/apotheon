import { expect, test } from '@playwright/test';
import { registerDeterministicApiMocks } from '../mocks/provider-fixtures';

test('E2E-UNIVERSE-SCAN-001: universe refresh is available in settings', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('label:has-text("Active chain for job actions") select').selectOption('chain-eth');
  await page.getByRole('button', { name: 'Refresh Selected Chain Universe' }).click();

  await expect(page.getByText(/Universe Job/i)).toBeVisible();
});

test('E2E-UNIVERSE-SCAN-002: fallback status is still visible to operator', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('label:has-text("Active chain for job actions") select').selectOption('chain-eth');

  await expect(page.getByText(/status: partial/i)).toBeVisible();
});
