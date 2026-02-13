import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createChainsRouter } from './chains.js';
import { RpcUrlSafetyError } from '../services/chains/chain-validation.service.js';

const servers = [];

async function startTestServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/chains', router);

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

test('POST /api/chains returns 400 for SSRF-unsafe RPC URL', async () => {
  const baseUrl = await startTestServer(
    createChainsRouter({
      chainsRepository: {
        listChains: async () => [],
        createChain: async () => {
          throw new Error('should not be called');
        },
        setChainActive: async () => null
      },
      chainValidationService: {
        validateCustomChain: async () => {
          throw new RpcUrlSafetyError('RPC URL cannot target private-network IPs by default.');
        }
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/chains`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Unsafe Chain',
      slug: 'unsafe-chain',
      family: 'evm',
      chainId: 1,
      rpcUrl: 'http://127.0.0.1:8545'
    })
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /private-network/i);
});

test('POST /api/chains persists custom chain with validation status', async () => {
  const createdAt = new Date().toISOString();
  const baseUrl = await startTestServer(
    createChainsRouter({
      chainsRepository: {
        listChains: async () => [],
        setChainActive: async () => null,
        createChain: async (payload) => ({
          id: '8f23e006-bb20-4bd0-876b-2f5aaf8b1fdb',
          ...payload,
          createdAt,
          updatedAt: createdAt
        })
      },
      chainValidationService: {
        validateCustomChain: async () => ({
          validationStatus: 'invalid',
          validationError: 'RPC chainId mismatch. expected=10, observed=0x1'
        })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/chains`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Optimism Mirror',
      slug: 'optimism-mirror',
      family: 'evm',
      chainId: 10,
      rpcUrl: 'https://opt.example-rpc.dev'
    })
  });

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.validationStatus, 'invalid');
  assert.match(body.data.validationError, /chainId mismatch/i);
});

test('GET /api/chains returns chain list', async () => {
  const baseUrl = await startTestServer(
    createChainsRouter({
      chainsRepository: {
        listChains: async () => [
          {
            id: '0ff50d93-1d81-45e1-9f3c-6e39d2a80847',
            slug: 'ethereum',
            name: 'Ethereum',
            family: 'evm',
            chainId: 1,
            rpcUrl: 'https://cloudflare-eth.com',
            isBuiltin: true,
            isActive: true,
            validationStatus: 'pending',
            validationError: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        createChain: async () => {
          throw new Error('should not be called');
        },
        setChainActive: async () => null
      },
      chainValidationService: {
        validateCustomChain: async () => ({
          validationStatus: 'valid',
          validationError: null
        })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/chains`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(Array.isArray(body.data), true);
  assert.equal(body.data[0].slug, 'ethereum');
});
