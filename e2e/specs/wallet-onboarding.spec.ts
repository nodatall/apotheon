import { expect, test } from '@playwright/test';
import { registerDeterministicApiMocks } from '../mocks/provider-fixtures';

test('E2E-WALLET-ADD-001: owner can add wallet and trigger initial scan', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();

  await page.getByLabel('Wallet chain').selectOption('chain-eth');
  await page.getByPlaceholder('Wallet address').fill('0x1234567890123456789012345678901234567890');
  await page.getByPlaceholder('Label').fill('Main');
  await page.getByRole('button', { name: 'Add Wallet' }).click();

  await expect(page.getByRole('heading', { name: 'Wallet Onboarding Outcome' })).toBeVisible();
  await expect(page.getByText(/scan:\s*failed/i)).toBeVisible();
  await expect(page.getByText(/needsUniverseRefresh:\s*yes/i)).toBeVisible();

  await page.locator('label:has-text("Active wallet for job actions") select').selectOption('wallet-1');
  await page.getByRole('button', { name: 'Re-Scan Selected Wallet' }).click();

  await expect(page.getByText(/Wallet Scan Job/i)).toBeVisible();
});
