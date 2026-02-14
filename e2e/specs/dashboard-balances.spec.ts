import { expect, test } from '@playwright/test';
import { registerDeterministicApiMocks } from '../mocks/provider-fixtures';

test('E2E-DASHBOARD-BAL-001: dashboard shows grouped token and protocol balances', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Portfolio Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Token Positions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Protocol Positions' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'AAA', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Staking', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: /unknown/i }).first()).toBeVisible();
});
