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
