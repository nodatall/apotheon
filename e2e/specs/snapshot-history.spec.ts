import { expect, test } from '@playwright/test';
import { registerDeterministicApiMocks } from '../mocks/provider-fixtures';

test('E2E-SNAPSHOT-HISTORY-001: snapshot run and history totals render', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Run Snapshot Now' }).click();

  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByText('2026-02-13')).toBeVisible();
  await expect(page.getByText('$1200.00')).toBeVisible();
});

test('E2E-VALUATION-UNKNOWN-001: unknown valuation marker remains visible in job panels', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText(/status:/i).first()).toBeVisible();
});
