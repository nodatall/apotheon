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

test('wallet-scan-trigger: refresh failures surface actionable snapshot error', async () => {
  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-1', chainId: 'chain-1', address: '0xabc' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => null,
      getSnapshotItems: async () => []
    },
    universeRefreshService: {
      refreshChainById: async () => {
        throw new Error('upstream provider unavailable');
      }
    },
    scansRepository: {
      createScanRun: async () => ({}),
      updateScanRun: async () => ({}),
      upsertScanItem: async () => ({})
    },
    trackedTokensRepository: {
      upsertTrackedToken: async () => ({ id: 'token-1' })
    },
    balanceBatcher: {
      resolveBalances: async () => []
    }
  });

  await assert.rejects(
    () => service.runScan({ walletId: 'wallet-1' }),
    /No scan-eligible universe snapshot.*Universe refresh failed: upstream provider unavailable/i
  );
});

test('wallet-scan-trigger: scan fails when all token balance resolutions fail', async () => {
  const updateCalls = [];
  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-1', slug: 'ethereum', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({ id: 'wallet-1', chainId: 'chain-1', address: '0xabc' })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => ({ id: 'snapshot-1' }),
      getSnapshotItems: async () => [{ contractOrMint: '0xaaa', symbol: 'AAA' }]
    },
    scansRepository: {
      createScanRun: async (input) => ({ id: 'scan-1', ...input }),
      updateScanRun: async (_id, changes) => {
        updateCalls.push(changes);
        return { id: 'scan-1', ...changes };
      },
      upsertScanItem: async () => ({})
    },
    trackedTokensRepository: {
      upsertTrackedToken: async () => ({ id: 'token-1' })
    },
    balanceBatcher: {
      resolveBalances: async () => [
        {
          contractOrMint: '0xaaa',
          balanceRaw: '0x0',
          balanceNormalized: 0,
          resolutionError: true,
          resolutionErrorMessage: 'RPC call failed with HTTP 429'
        }
      ]
    }
  });

  await assert.rejects(
    () => service.runScan({ walletId: 'wallet-1' }),
    /Balance resolution failed for all scan tokens on chain: ethereum/i
  );
  assert.equal(updateCalls.at(-1)?.status, 'failed');
});
