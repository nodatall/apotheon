import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProtocolContractService } from './protocol-contract.service.js';

test('protocols: protocol contracts persist with validation status', async () => {
  const queries = [];

  const service = createProtocolContractService({
    pool: {
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.includes('INSERT INTO protocol_contracts')) {
          return {
            rows: [
              {
                id: 'protocol-1',
                chain_id: params[0],
                contract_address: params[1],
                label: params[2],
                category: params[3],
                abi_mapping: params[4],
                validation_status: params[5],
                validation_error: params[6],
                is_active: params[7],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }
            ]
          };
        }

        return { rows: [] };
      }
    },
    previewExecutor: async () => ({ ok: true })
  });

  const result = await service.createProtocolContract({
    chainId: 'chain-1',
    contractAddress: '0x123',
    label: 'Staking',
    category: 'staking',
    abiMapping: {
      positionRead: {
        function: 'balanceOf',
        args: ['$walletAddress'],
        returns: 'uint256'
      }
    }
  });

  assert.equal(result.validationStatus, 'valid');
  assert.equal(queries.length > 0, true);
});

test('protocols: invalid abi mappings are rejected before persistence', async () => {
  let insertAttempted = false;

  const service = createProtocolContractService({
    pool: {
      query: async (sql) => {
        if (sql.includes('INSERT INTO protocol_contracts')) {
          insertAttempted = true;
        }
        return { rows: [] };
      }
    },
    previewExecutor: async () => ({ ok: false, error: 'preview failed' })
  });

  await assert.rejects(
    () =>
      service.createProtocolContract({
        chainId: 'chain-1',
        contractAddress: '0x123',
        label: 'Broken',
        category: 'staking',
        abiMapping: {
          positionRead: {
            function: 'balanceOf',
            args: ['$walletAddress'],
            returns: 'uint256'
          }
        }
      }),
    /preview failed/i
  );

  assert.equal(insertAttempted, false);
});

test('protocols: default preview executor rejects unsupported runtime reads', async () => {
  let insertAttempted = false;

  const service = createProtocolContractService({
    pool: {
      query: async (sql) => {
        if (sql.includes('INSERT INTO protocol_contracts')) {
          insertAttempted = true;
        }
        return { rows: [] };
      }
    }
  });

  await assert.rejects(
    () =>
      service.createProtocolContract({
        chainId: 'chain-1',
        contractAddress: '0x123',
        label: 'Unsupported',
        category: 'staking',
        abiMapping: {
          positionRead: {
            function: 'customRead',
            args: ['$walletAddress'],
            returns: 'uint256'
          }
        }
      }),
    /Unsupported protocol read signature/i
  );

  assert.equal(insertAttempted, false);
});
