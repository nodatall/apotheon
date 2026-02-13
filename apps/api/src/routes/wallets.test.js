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
