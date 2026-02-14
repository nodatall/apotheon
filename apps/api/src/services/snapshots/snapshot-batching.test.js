import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDailySnapshotService } from './daily-snapshot.service.js';

test('snapshot-batching: valuation pipeline is invoked with batched position arrays', async () => {
  const valuationCalls = [];

  const service = createDailySnapshotService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      listWallets: async () => [{ id: 'wallet-1', chainId: 'chain-1' }]
    },
    scansRepository: {
      getLatestSuccessfulScanItemsByWallet: async () =>
        Array.from({ length: 5 }).map((_, index) => ({
          contractOrMint: `0x${index}`,
          balanceNormalized: 1,
          tokenId: `token-${index}`
        }))
    },
    snapshotsRepository: {
      getDailySnapshotByDate: async () => null,
      upsertDailySnapshot: async (payload) => ({ id: 'snapshot-1', ...payload }),
      upsertSnapshotItem: async () => ({})
    },
    valuationService: {
      valuatePositions: async ({ positions }) => {
        valuationCalls.push(positions.length);
        return positions.map((position) => ({
          ...position,
          usdPrice: 1,
          usdValue: position.quantity,
          valuationStatus: 'known'
        }));
      }
    }
  });

  await service.runDailySnapshot({ snapshotDateUtc: '2026-02-13' });
  assert.equal(valuationCalls.length, 1);
  assert.equal(valuationCalls[0], 5);
});
