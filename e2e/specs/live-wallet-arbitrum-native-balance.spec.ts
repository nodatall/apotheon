import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:4000';
const ARBITRUM_WALLET = '0x3BDDE7d9f8B3CC3583A41b5e12244924B371e17F';
const ETHEREUM_WALLET = '0x3Bd504FA02EA86Ec2Ad9C329Bc3796D82507703F';
const ETHEREUM_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ARBITRUM_RPC_ENDPOINTS = ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.llamarpc.com'];
const ETHEREUM_RPC_ENDPOINTS = ['https://eth.llamarpc.com', 'https://ethereum.publicnode.com'];
const MIN_EXPECTED_ETH = 0.00779;
const MIN_EXPECTED_USDC = 1000;

function parseNumericText(value: string) {
  const normalized = value.replaceAll(',', '').replace(/[^\d.-]/g, '');
  return Number(normalized);
}

async function rpcJsonCall(
  request: APIRequestContext,
  endpoints: string[],
  method: string,
  params: unknown[]
) {
  const failures: string[] = [];

  for (let round = 0; round < 2; round += 1) {
    for (const endpoint of endpoints) {
      try {
        const response = await request.post(endpoint, {
          data: {
            jsonrpc: '2.0',
            id: 1,
            method,
            params
          }
        });
        if (!response.ok()) {
          failures.push(`${endpoint}:http-${response.status()}`);
          continue;
        }
        const payload = await response.json();
        if (payload?.error || typeof payload?.result !== 'string') {
          failures.push(`${endpoint}:rpc-error`);
          continue;
        }
        return payload.result as string;
      } catch (error) {
        failures.push(`${endpoint}:${error instanceof Error ? error.message : 'unknown-error'}`);
      }
    }
  }

  throw new Error(`RPC call failed for ${method}. Attempts: ${failures.join(', ')}`);
}

async function fetchArbitrumNativeBalance(request: APIRequestContext) {
  const hexBalance = await rpcJsonCall(request, ARBITRUM_RPC_ENDPOINTS, 'eth_getBalance', [
    ARBITRUM_WALLET,
    'latest'
  ]);
  expect(typeof hexBalance).toBe('string');
  expect(hexBalance.startsWith('0x')).toBeTruthy();

  return Number(BigInt(hexBalance) / 1_000_000_000_000n) / 1_000_000;
}

async function fetchEthereumUsdcBalance(request: APIRequestContext) {
  const walletHex = ETHEREUM_WALLET.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const hexBalance = await rpcJsonCall(request, ETHEREUM_RPC_ENDPOINTS, 'eth_call', [
    {
      to: ETHEREUM_USDC,
      data: `0x70a08231${walletHex}`
    },
    'latest'
  ]);
  expect(typeof hexBalance).toBe('string');
  expect(hexBalance.startsWith('0x')).toBeTruthy();

  return Number(BigInt(hexBalance)) / 1_000_000;
}

async function findChainIdBySlug(request: APIRequestContext, slug: string) {
  const response = await request.get(`${API_BASE}/api/chains`);
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  const chains = Array.isArray(payload?.data) ? payload.data : [];
  const chain = chains.find((entry: { slug?: string }) => entry.slug === slug);

  expect(chain).toBeTruthy();
  return String(chain.id);
}

async function rescanExistingWallet(request: APIRequestContext, chainId: string, address: string) {
  const walletsResponse = await request.get(`${API_BASE}/api/wallets`);
  expect(walletsResponse.ok()).toBeTruthy();
  const walletsPayload = await walletsResponse.json();
  const wallets = Array.isArray(walletsPayload?.data) ? walletsPayload.data : [];

  const wallet = wallets.find(
    (item: { chainId?: string; address?: string }) =>
      item.chainId === chainId &&
      typeof item.address === 'string' &&
      item.address.toLowerCase() === address.toLowerCase()
  );

  expect(wallet).toBeTruthy();
  let latestError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const rescanResponse = await request.post(`${API_BASE}/api/wallets/${wallet.id}/rescan`);
    expect(rescanResponse.ok()).toBeTruthy();
    const rescanPayload = await rescanResponse.json();
    const status = rescanPayload?.data?.status;
    if (status === 'success' || status === 'partial') {
      return;
    }
    latestError = `status=${String(status)}`;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(`Wallet rescan did not complete successfully for ${address}: ${latestError}`);
}

async function refreshUniverse(request: APIRequestContext, chainId: string) {
  const response = await request.post(`${API_BASE}/api/universe/${chainId}/refresh`, {
    data: {}
  });
  if (response.ok()) {
    return;
  }

  const activeSnapshot = await request.get(`${API_BASE}/api/universe/${chainId}/active`);
  if (activeSnapshot.ok()) {
    return;
  }

  throw new Error(`Universe refresh failed for chain ${chainId} (status ${response.status()}).`);
}

async function addOrRescanWallet({
  page,
  request,
  chainLabel,
  chainId,
  address,
  label
}: {
  page: Page;
  request: APIRequestContext;
  chainLabel: string;
  chainId: string;
  address: string;
  label: string;
}) {
  const addWalletSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Add Wallet' })
  });
  const addWalletForm = addWalletSection.locator('form');
  await addWalletForm.locator('select').first().selectOption({ label: chainLabel });
  await addWalletForm.getByLabel('Wallet address').fill(address);
  await addWalletForm.getByLabel('Label (optional)').fill(label);
  await addWalletForm.getByRole('button', { name: 'Add Wallet' }).click();

  await refreshUniverse(request, chainId);
  await rescanExistingWallet(request, chainId, address);
  await page.reload();
}

// @live suites are excluded from CI and deterministic defaults.
test('@live E2E-LIVE-WALLET-ARB-001: add arbitrum + ethereum wallets and load ETH + USDC balances', async ({
  page,
  request
}) => {
  test.setTimeout(180_000);

  const [arbitrumChainId, ethereumChainId, expectedNativeEth, expectedUsdc] = await Promise.all([
    findChainIdBySlug(request, 'arbitrum'),
    findChainIdBySlug(request, 'ethereum'),
    fetchArbitrumNativeBalance(request),
    fetchEthereumUsdcBalance(request)
  ]);

  await page.goto('/');

  await addOrRescanWallet({
    page,
    request,
    chainLabel: 'Arbitrum',
    chainId: arbitrumChainId,
    address: ARBITRUM_WALLET,
    label: 'Live Arbitrum E2E'
  });

  await addOrRescanWallet({
    page,
    request,
    chainLabel: 'Ethereum',
    chainId: ethereumChainId,
    address: ETHEREUM_WALLET,
    label: 'Live Ethereum E2E'
  });

  const assetValuesSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Asset Values' })
  });

  const ethRow = assetValuesSection
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: 'ETH', exact: true }) })
    .first();

  await expect(ethRow).toBeVisible({ timeout: 90_000 });

  const quantityText = (await ethRow.locator('td').nth(1).textContent())?.trim() ?? '';
  const quantity = parseNumericText(quantityText);
  expect(Number.isFinite(quantity)).toBeTruthy();
  expect(quantity).toBeGreaterThan(MIN_EXPECTED_ETH);
  expect(Math.abs(quantity - expectedNativeEth)).toBeLessThan(0.005);

  await expect(ethRow.locator('td').nth(3)).toContainText(/known/i);

  const usdcRow = assetValuesSection
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name: 'USDC', exact: true }) })
    .first();

  await expect(usdcRow).toBeVisible({ timeout: 90_000 });

  const usdcQuantityText = (await usdcRow.locator('td').nth(1).textContent())?.trim() ?? '';
  const usdcQuantity = parseNumericText(usdcQuantityText);
  expect(Number.isFinite(usdcQuantity)).toBeTruthy();
  expect(usdcQuantity).toBeGreaterThan(MIN_EXPECTED_USDC);
  expect(Math.abs(usdcQuantity - expectedUsdc)).toBeLessThan(5);
  await expect(usdcRow.locator('td').nth(3)).toContainText(/known/i);
});
