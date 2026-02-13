import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWalletScanService } from './wallet-scan.service.js';

test('wallet-scan-trigger: scan run references immutable universe snapshot id', async () => {
  const createdRuns = [];

  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-1', chainId: 'chain-1', address: '0xabc' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => ({ id: 'snapshot-immutable-1' }),
      getSnapshotItems: async () => []
    },
    scansRepository: {
      createScanRun: async (input) => {
        createdRuns.push(input);
        return { id: 'scan-1', ...input };
      },
      updateScanRun: async (id, changes) => ({ id, ...changes }),
      upsertScanItem: async () => ({})
    },
    trackedTokensRepository: {
      upsertTrackedToken: async () => ({ id: 'token-1' })
    },
    balanceBatcher: {
      resolveBalances: async () => []
    }
  });

  const result = await service.runScan({ walletId: 'wallet-1' });

  assert.equal(createdRuns[0].universeSnapshotId, 'snapshot-immutable-1');
  assert.equal(result.universeSnapshotId, 'snapshot-immutable-1');
});
