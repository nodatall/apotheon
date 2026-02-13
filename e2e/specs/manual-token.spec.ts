import { expect, test } from '@playwright/test';
import { registerDeterministicApiMocks } from '../mocks/provider-fixtures';

test('E2E-TOKEN-MANUAL-001: owner can add manual token with overrides', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Assets' }).click();
  await page.locator('section:has-text("Add Manual Token") select').selectOption('chain-eth');
  await page.locator('section:has-text("Add Manual Token") input').first().fill('0xAAA');
  await page.locator('section:has-text("Add Manual Token") input').nth(1).fill('AAA');
  await page.getByRole('button', { name: 'Add Token' }).click();

  await expect(page.getByText('0xAAA')).toBeVisible();
});
