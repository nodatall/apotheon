import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWalletScanService } from './wallet-scan.service.js';

test('wallet-rescan: repeated rescans create traceable runs without duplicate tracked tokens', async () => {
  let runIndex = 0;
  const trackedByContract = new Map();

  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-1', chainId: 'chain-1', address: '0xabc' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => ({ id: 'snapshot-1' }),
      getSnapshotItems: async () => [{ contractOrMint: '0xAAA', symbol: 'AAA' }]
    },
    scansRepository: {
      createScanRun: async (input) => {
        runIndex += 1;
        return { id: `scan-${runIndex}`, ...input };
      },
      updateScanRun: async (id, changes) => ({ id, ...changes }),
      upsertScanItem: async () => ({})
    },
    trackedTokensRepository: {
      upsertTrackedToken: async ({ contractOrMint }) => {
        if (!trackedByContract.has(contractOrMint)) {
          trackedByContract.set(contractOrMint, { id: `token-${trackedByContract.size + 1}` });
        }
        return trackedByContract.get(contractOrMint);
      }
    },
    balanceBatcher: {
      resolveBalances: async () => [{ contractOrMint: '0xAAA', balanceRaw: '1', balanceNormalized: 1 }]
    }
  });

  const first = await service.rescanWallet({ walletId: 'wallet-1' });
  const second = await service.rescanWallet({ walletId: 'wallet-1' });

  assert.notEqual(first.scanRun.id, second.scanRun.id);
  assert.equal(trackedByContract.size, 1);
});
