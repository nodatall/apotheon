import { expect, test } from '@playwright/test';
import { registerDeterministicApiMocks } from '../mocks/provider-fixtures';

const ABI_MAPPING = `{
  "positionRead": {
    "function": "balanceOf",
    "args": ["$walletAddress"],
    "returns": "uint256"
  }
}`;

test('E2E-PROTOCOL-ABI-001: valid abi mapping can be saved', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Protocols' }).click();
  await page.locator('section:has-text("Add Protocol Contract") select').selectOption('chain-eth');
  await page.getByLabel('Contract Address').fill('0xPROTOCOL');
  await page.getByLabel('Label').fill('Staking Vault');
  await page.getByLabel('ABI Mapping JSON').fill(ABI_MAPPING);
  await page.getByRole('button', { name: 'Save Protocol' }).click();

  await expect(page.getByText('Staking Vault')).toBeVisible();
});

test('E2E-PROTOCOL-ABI-002: invalid payload surfaces actionable feedback', async ({ page }) => {
  await registerDeterministicApiMocks(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Protocols' }).click();
  await page.locator('section:has-text("Add Protocol Contract") select').selectOption('chain-eth');
  await page.getByLabel('Contract Address').fill('0xBAD');
  await page.getByLabel('Label').fill('Broken Mapping');
  await page.getByLabel('ABI Mapping JSON').fill('{"oops":true}');
  await page.getByRole('button', { name: 'Save Protocol' }).click();

  await expect(page.getByText(/invalid abi mapping|must be/i)).toBeVisible();
});
