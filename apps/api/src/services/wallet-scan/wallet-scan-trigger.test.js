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

test('wallet-scan-trigger: uses tracked-token fallback snapshot when refresh fails on unsupported chain', async () => {
  const upsertSnapshotCalls = [];
  const createdRuns = [];
  const service = createWalletScanService({
    chainsRepository: {
      getChainById: async () => ({ id: 'chain-ronin', slug: 'ronin', family: 'evm' })
    },
    walletsRepository: {
      getWalletById: async () => ({
        id: 'wallet-1',
        chainId: 'chain-ronin',
        address: '0x1234567890123456789012345678901234567890'
      })
    },
    tokenUniverseRepository: {
      getLatestScanEligibleSnapshot: async () => null,
      getSnapshotItems: async () => [],
      upsertSnapshot: async (input) => {
        upsertSnapshotCalls.push(input);
        return { id: 'snapshot-fallback-1', ...input };
      },
      replaceSnapshotItems: async () => []
    },
    universeRefreshService: {
      refreshChainById: async () => {
        throw new Error('fallback provider unsupported for chain');
      }
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
      countTrackedTokensByChain: async () => 1,
      listTrackedTokens: async () => [
        {
          id: 'token-usdc',
          chainId: 'chain-ronin',
          contractOrMint: '0x0b7007c13325c48911f73a2dad5fa5dcbf808adc',
          symbol: 'USDC',
          decimals: 6
        }
      ],
      upsertTrackedToken: async () => ({ id: 'token-usdc' })
    },
    balanceBatcher: {
      resolveBalances: async () => [
        {
          contractOrMint: '0x0b7007c13325c48911f73a2dad5fa5dcbf808adc',
          balanceRaw: '1000000',
          balanceNormalized: 1,
          resolutionError: false
        }
      ]
    }
  });

  const outcome = await service.runScan({ walletId: 'wallet-1' });

  assert.equal(upsertSnapshotCalls.length, 1);
  assert.equal(upsertSnapshotCalls[0].chainId, 'chain-ronin');
  assert.equal(upsertSnapshotCalls[0].status, 'partial');
  assert.equal(createdRuns[0].universeSnapshotId, 'snapshot-fallback-1');
  assert.equal(outcome.universeSnapshotId, 'snapshot-fallback-1');
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
