import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWalletScanService } from './wallet-scan.service.js';

test('auto-track: only positive balances become auto-tracked', async () => {
  const trackedContracts = [];
  const upsertedItems = [];

  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-1', chainId: 'chain-1', address: '0xabc' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => ({ id: 'snapshot-1' }),
      getSnapshotItems: async () => [
        { contractOrMint: '0xA', symbol: 'A' },
        { contractOrMint: '0xB', symbol: 'B' }
      ]
    },
    scansRepository: {
      createScanRun: async (input) => ({ id: 'scan-1', ...input }),
      updateScanRun: async (id, changes) => ({ id, ...changes }),
      upsertScanItem: async (item) => {
        upsertedItems.push(item);
        return item;
      }
    },
    trackedTokensRepository: {
      upsertTrackedToken: async ({ contractOrMint }) => {
        trackedContracts.push(contractOrMint);
        return { id: `token-${contractOrMint}` };
      }
    },
    balanceBatcher: {
      resolveBalances: async () => [
        { contractOrMint: '0xA', balanceRaw: '5', balanceNormalized: 5 },
        { contractOrMint: '0xB', balanceRaw: '0', balanceNormalized: 0 }
      ]
    }
  });

  const result = await service.runScan({ walletId: 'wallet-1' });

  assert.equal(result.autoTrackedCount, 1);
  assert.deepEqual(trackedContracts, ['0xA']);
  assert.equal(upsertedItems.find((item) => item.contractOrMint === '0xA').autoTrackedFlag, true);
  assert.equal(upsertedItems.find((item) => item.contractOrMint === '0xB').autoTrackedFlag, false);
});
