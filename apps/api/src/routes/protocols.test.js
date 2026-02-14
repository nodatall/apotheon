import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createProtocolsRouter } from './protocols.js';
import { AbiMappingValidationError } from '../services/protocols/abi-mapping-validator.js';

const servers = [];

async function startServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/protocols', router);

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

test('protocols route: returns 400 for invalid abi mapping payloads', async () => {
  const baseUrl = await startServer(
    createProtocolsRouter({
      chainsRepository: {
        getChainById: async () => ({ id: 'c1', family: 'evm' })
      },
      protocolContractService: {
        createProtocolContract: async () => {
          throw new AbiMappingValidationError('abiMapping.positionRead.function must be a non-empty string.');
        },
        listProtocolContracts: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/protocols/contracts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chainId: 'c1',
      contractAddress: '0xABC',
      label: 'Broken',
      category: 'staking',
      abiMapping: {
        positionRead: {
          function: '',
          args: [],
          returns: 'uint256'
        }
      }
    })
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /non-empty string/i);
});
