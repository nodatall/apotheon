import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createAssetsRouter } from './assets.js';

const servers = [];

async function startServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/assets', router);

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

test('assets: adding manual token with walletId triggers immediate wallet rescan', async () => {
  const baseUrl = await startServer(
    createAssetsRouter({
      chainsRepository: {
        getChainById: async (chainId) => ({ id: chainId, family: 'evm' })
      },
      walletsRepository: {
        getWalletById: async (walletId) => ({ id: walletId, chainId: 'chain-1' })
      },
      manualTokenService: {
        registerManualToken: async () => ({
          id: 'token-1',
          chainId: 'chain-1',
          contractOrMint: '0xabc'
        })
      },
      walletScanService: {
        rescanWallet: async () => ({
          scanRun: {
            id: 'scan-1',
            status: 'success'
          }
        })
      },
      trackedTokensRepository: {
        listTrackedTokens: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/assets/tokens`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      chainId: 'chain-1',
      walletId: 'wallet-1',
      contractOrMint: '0xabc'
    })
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.walletScanId, 'scan-1');
  assert.equal(body.data.walletScanStatus, 'success');
  assert.equal(body.data.walletScanError, null);
});

test('assets: adding manual token with walletId returns failed scan status when rescan fails', async () => {
  const baseUrl = await startServer(
    createAssetsRouter({
      chainsRepository: {
        getChainById: async (chainId) => ({ id: chainId, family: 'evm' })
      },
      walletsRepository: {
        getWalletById: async (walletId) => ({ id: walletId, chainId: 'chain-1' })
      },
      manualTokenService: {
        registerManualToken: async () => ({
          id: 'token-wallet-fail',
          chainId: 'chain-1',
          contractOrMint: '0xdead'
        })
      },
      walletScanService: {
        rescanWallet: async () => {
          throw new Error('scan unavailable');
        }
      },
      trackedTokensRepository: {
        listTrackedTokens: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/assets/tokens`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      chainId: 'chain-1',
      walletId: 'wallet-1',
      contractOrMint: '0xdead'
    })
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.id, 'token-wallet-fail');
  assert.equal(body.data.walletScanStatus, 'failed');
  assert.equal(body.data.walletScanError, 'scan unavailable');
  assert.equal(body.data.scanSummary, null);
});

test('assets: rejects walletId that does not belong to chainId', async () => {
  const baseUrl = await startServer(
    createAssetsRouter({
      chainsRepository: {
        getChainById: async (chainId) => ({ id: chainId, family: 'evm' })
      },
      walletsRepository: {
        getWalletById: async (walletId) => ({ id: walletId, chainId: 'chain-2' })
      },
      manualTokenService: {
        registerManualToken: async () => ({})
      },
      walletScanService: {
        rescanWallet: async () => ({})
      },
      trackedTokensRepository: {
        listTrackedTokens: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/assets/tokens`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      chainId: 'chain-1',
      walletId: 'wallet-1',
      contractOrMint: '0xabc'
    })
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /walletId must belong to the provided chainId/i);
});

test('assets: adding manual token without walletId rescans all active wallets on the chain', async () => {
  const rescannedWalletIds = [];
  const baseUrl = await startServer(
    createAssetsRouter({
      chainsRepository: {
        getChainById: async (chainId) => ({ id: chainId, family: 'evm' })
      },
      walletsRepository: {
        getWalletById: async () => null,
        listWallets: async ({ chainId }) => [
          { id: `${chainId}-wallet-1` },
          { id: `${chainId}-wallet-2` }
        ]
      },
      manualTokenService: {
        registerManualToken: async () => ({
          id: 'token-1',
          chainId: 'chain-1',
          contractOrMint: '0xabc'
        })
      },
      walletScanService: {
        rescanWallet: async ({ walletId }) => {
          rescannedWalletIds.push(walletId);
          return {
            scanRun: {
              id: `scan-${walletId}`,
              status: 'success'
            }
          };
        }
      },
      trackedTokensRepository: {
        listTrackedTokens: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/assets/tokens`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      chainId: 'chain-1',
      contractOrMint: '0xabc'
    })
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(rescannedWalletIds, ['chain-1-wallet-1', 'chain-1-wallet-2']);
  assert.equal(body.data.walletScanStatus, 'success');
  assert.equal(body.data.walletScanError, null);
  assert.equal(body.data.scanSummary.mode, 'chain_wallets');
  assert.equal(body.data.scanSummary.attemptedWalletCount, 2);
  assert.equal(body.data.scanSummary.failedWalletCount, 0);
});

test('assets: adding manual token without walletId still succeeds when wallet listing fails', async () => {
  const baseUrl = await startServer(
    createAssetsRouter({
      chainsRepository: {
        getChainById: async (chainId) => ({ id: chainId, family: 'evm' })
      },
      walletsRepository: {
        getWalletById: async () => null,
        listWallets: async () => {
          throw new Error('wallet lookup unavailable');
        }
      },
      manualTokenService: {
        registerManualToken: async () => ({
          id: 'token-2',
          chainId: 'chain-1',
          contractOrMint: '0xdef'
        })
      },
      walletScanService: {
        rescanWallet: async () => {
          throw new Error('should not be called when wallet list fails');
        }
      },
      trackedTokensRepository: {
        listTrackedTokens: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/assets/tokens`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      chainId: 'chain-1',
      contractOrMint: '0xdef'
    })
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.id, 'token-2');
  assert.equal(body.data.walletScanStatus, 'failed');
  assert.equal(body.data.walletScanError, 'wallet lookup unavailable');
  assert.equal(body.data.scanSummary.mode, 'chain_wallets');
  assert.equal(body.data.scanSummary.attemptedWalletCount, 0);
  assert.equal(body.data.scanSummary.failedWalletCount, 0);
});

test('assets: activation endpoint toggles tracked token active state', async () => {
  const baseUrl = await startServer(
    createAssetsRouter({
      chainsRepository: {
        getChainById: async (chainId) => ({ id: chainId, family: 'evm' })
      },
      walletsRepository: {
        getWalletById: async (walletId) => ({ id: walletId, chainId: 'chain-1' })
      },
      manualTokenService: {
        registerManualToken: async () => ({})
      },
      walletScanService: {
        rescanWallet: async () => ({})
      },
      trackedTokensRepository: {
        listTrackedTokens: async () => [],
        setTrackedTokenActive: async (id, isActive) => ({ id, isActive })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/assets/tokens/token-1/activation`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ isActive: false })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.id, 'token-1');
  assert.equal(body.data.isActive, false);
});
