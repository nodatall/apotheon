import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWalletsRouter } from './wallets.js';

const servers = [];

async function startServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/wallets', router);

  await new Promise((resolve) => {
    const server = app.listen(0, () => {
      servers.push(server);
      resolve();
    });
  });

  const server = servers[servers.length - 1];
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        })
    )
  );
});

test('wallets: rejects invalid address for chain family', async () => {
  const baseUrl = await startServer(
    createWalletsRouter({
      chainsRepository: {
        getChainById: async () => ({ id: 'c1', family: 'evm' })
      },
      walletsRepository: {
        createWallet: async () => ({})
      },
      walletScanService: {
        runScan: async () => ({})
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/wallets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chainId: 'c1',
      address: 'not-an-evm-address'
    })
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /invalid/i);
});

test('wallets: blocks duplicate wallet with 409', async () => {
  const duplicateError = new Error('duplicate');
  duplicateError.code = '23505';

  const baseUrl = await startServer(
    createWalletsRouter({
      chainsRepository: {
        getChainById: async () => ({ id: 'c1', family: 'evm' })
      },
      walletsRepository: {
        createWallet: async () => {
          throw duplicateError;
        }
      },
      walletScanService: {
        runScan: async () => ({})
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/wallets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chainId: 'c1',
      address: '0x1234567890123456789012345678901234567890'
    })
  });

  assert.equal(response.status, 409);
});

test('wallets: normalizes evm address casing before persistence', async () => {
  let savedAddress = null;

  const baseUrl = await startServer(
    createWalletsRouter({
      chainsRepository: {
        getChainById: async () => ({ id: 'c1', family: 'evm' })
      },
      walletsRepository: {
        createWallet: async ({ address }) => {
          savedAddress = address;
          return { id: 'wallet-1', chainId: 'c1', address };
        }
      },
      scansRepository: {
        getLatestScanByWallet: async () => null
      },
      walletScanService: {
        runScan: async () => ({ scanRun: { id: 'scan-1', status: 'success' }, universeSnapshotId: 'snapshot-1' })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/wallets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chainId: 'c1',
      address: '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD'
    })
  });

  assert.equal(response.status, 201);
  assert.equal(savedAddress, '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
});

test('wallets: returns onboarding hints when initial scan fails', async () => {
  const baseUrl = await startServer(
    createWalletsRouter({
      chainsRepository: {
        getChainById: async () => ({ id: 'c1', family: 'evm' })
      },
      walletsRepository: {
        createWallet: async ({ address }) => ({ id: 'wallet-1', chainId: 'c1', address })
      },
      scansRepository: {
        getLatestScanByWallet: async () => null
      },
      walletScanService: {
        runScan: async () => {
          throw new Error('No scan-eligible universe snapshot for chain: c1');
        }
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/wallets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chainId: 'c1',
      address: '0x1234567890123456789012345678901234567890'
    })
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.scanStatus, 'failed');
  assert.match(body.data.scanError, /No scan-eligible universe snapshot/i);
  assert.equal(body.data.needsUniverseRefresh, true);
  assert.equal(body.data.canRescan, true);
});

test('wallets: onboarding-status returns latest scan state and hints', async () => {
  const baseUrl = await startServer(
    createWalletsRouter({
      chainsRepository: {
        getChainById: async () => ({ id: 'c1', family: 'evm' })
      },
      walletsRepository: {
        getWalletById: async (id) => ({ id, chainId: 'c1', address: '0xabc' }),
        createWallet: async () => ({})
      },
      scansRepository: {
        getLatestScanByWallet: async () => ({
          status: 'failed',
          errorMessage: 'No scan-eligible universe snapshot for chain: c1'
        })
      },
      walletScanService: {
        runScan: async () => ({})
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/wallets/wallet-1/onboarding-status`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.walletId, 'wallet-1');
  assert.equal(body.data.scanStatus, 'failed');
  assert.equal(body.data.needsUniverseRefresh, true);
  assert.equal(body.data.canRescan, true);
});

test('wallets: activation endpoint toggles wallet active state', async () => {
  const baseUrl = await startServer(
    createWalletsRouter({
      chainsRepository: {
        getChainById: async () => ({ id: 'c1', family: 'evm' })
      },
      walletsRepository: {
        setWalletActive: async (id, isActive) => ({ id, chainId: 'c1', isActive })
      },
      scansRepository: {
        getLatestScanByWallet: async () => null
      },
      walletScanService: {
        runScan: async () => ({})
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/wallets/wallet-1/activation`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ isActive: false })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.id, 'wallet-1');
  assert.equal(body.data.isActive, false);
});

test('wallets: restores inactive wallet when same address is re-added', async () => {
  let createCalled = false;
  let reactivateCalled = false;

  const baseUrl = await startServer(
    createWalletsRouter({
      chainsRepository: {
        getChainById: async () => ({ id: 'c1', family: 'evm' })
      },
      walletsRepository: {
        getWalletByChainAndAddress: async () => ({
          id: 'wallet-1',
          chainId: 'c1',
          address: '0x1234567890123456789012345678901234567890',
          label: 'old label',
          isActive: false
        }),
        reactivateWallet: async (_id, { label }) => {
          reactivateCalled = true;
          return {
            id: 'wallet-1',
            chainId: 'c1',
            address: '0x1234567890123456789012345678901234567890',
            label: label ?? 'old label',
            isActive: true
          };
        },
        createWallet: async () => {
          createCalled = true;
          return {};
        }
      },
      scansRepository: {
        getLatestScanByWallet: async () => null
      },
      walletScanService: {
        runScan: async () => ({
          scanRun: { id: 'scan-restore', status: 'success' },
          universeSnapshotId: 'snapshot-1'
        })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/wallets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chainId: 'c1',
      address: '0x1234567890123456789012345678901234567890',
      label: 'restored wallet'
    })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.id, 'wallet-1');
  assert.equal(body.data.isActive, true);
  assert.equal(body.data.label, 'restored wallet');
  assert.equal(body.data.walletUniverseScanId, 'scan-restore');
  assert.equal(createCalled, false);
  assert.equal(reactivateCalled, true);
});

test('wallets: all-chains add keeps only chains with balances and skips incompatible formats', async () => {
  const createdWallets = [];
  const deactivatedWalletIds = [];

  const baseUrl = await startServer(
    createWalletsRouter({
      chainsRepository: {
        listChains: async () => [
          { id: 'eth-chain', name: 'Ethereum', family: 'evm', isActive: true },
          { id: 'arb-chain', name: 'Arbitrum', family: 'evm', isActive: true },
          { id: 'sol-chain', name: 'Solana', family: 'solana', isActive: true },
          { id: 'inactive-chain', name: 'Inactive', family: 'evm', isActive: false }
        ],
        getChainById: async () => null
      },
      walletsRepository: {
        getWalletByChainAndAddress: async () => null,
        createWallet: async ({ chainId, address, label }) => {
          const wallet = { id: `wallet-${chainId}`, chainId, address, label, isActive: true };
          createdWallets.push(wallet);
          return wallet;
        },
        setWalletActive: async (id, isActive) => {
          if (isActive === false) {
            deactivatedWalletIds.push(id);
          }
          return { id, isActive };
        }
      },
      scansRepository: {
        getLatestScanByWallet: async () => null
      },
      walletScanService: {
        runScan: async ({ walletId }) => {
          if (walletId === 'wallet-eth-chain') {
            return {
              scanRun: { id: 'scan-eth', status: 'success' },
              universeSnapshotId: 'snapshot-eth',
              heldTokenCount: 2
            };
          }

          return {
            scanRun: { id: 'scan-arb', status: 'success' },
            universeSnapshotId: 'snapshot-arb',
            heldTokenCount: 0
          };
        }
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/wallets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chainId: '__all__',
      address: '0x1234567890123456789012345678901234567890',
      label: 'multi-chain'
    })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.checkedChainCount, 3);
  assert.equal(body.data.added.length, 1);
  assert.equal(body.data.added[0].chainId, 'eth-chain');
  assert.equal(body.data.added[0].heldTokenCount, 2);

  assert.equal(createdWallets.length, 2);
  assert.deepEqual(
    body.data.skipped.map((item) => [item.chainId, item.reason]),
    [
      ['arb-chain', 'no_token_balances'],
      ['sol-chain', 'invalid_address_format']
    ]
  );
  assert.deepEqual(deactivatedWalletIds, ['wallet-arb-chain']);
});
