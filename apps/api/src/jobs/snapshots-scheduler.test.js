import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from './scheduler.js';

test('snapshots-scheduler: refreshes target chains, syncs catalog, rescans wallets, and forces snapshot', async () => {
  const refreshCalls = [];
  const rescannedWalletIds = [];
  const scheduler = createScheduler({
    chainsRepository: {
      listChains: async () => [
        { id: 'chain-1', slug: 'ethereum', family: 'evm', isActive: true },
        { id: 'chain-2', slug: 'base', family: 'evm', isActive: true }
      ]
    },
    walletsRepository: {
      listWallets: async () => [
        { id: 'wallet-1', chainId: 'chain-1' },
        { id: 'wallet-2', chainId: 'chain-2' }
      ]
    },
    walletScanService: {
      rescanWallet: async ({ walletId }) => {
        rescannedWalletIds.push(walletId);
      }
    },
    universeRefreshService: {
      refreshChainById: async ({ chainId }) => {
        refreshCalls.push(chainId);
        return { chainId, snapshotId: `snapshot-${chainId}`, status: 'ready' };
      }
    },
    tokenUniverseRepository: {
      getSnapshotItems: async () => [
        { contractOrMint: '0xaaa', symbol: 'AAA', name: 'Token AAA', decimals: 18 }
      ]
    },
    trackedTokensRepository: {
      upsertTrackedTokensBatch: async ({ tokens }) => tokens
    },
    dailySnapshotService: {
      runDailySnapshot: async ({ force, snapshotDateUtc }) => ({ force, snapshotDateUtc })
    },
    now: () => new Date('2026-02-13T00:00:00.000Z')
  });

  const result = await scheduler.runAutoScanCycle();

  assert.equal(result.skipped, false);
  assert.equal(result.status, 'success');
  assert.deepEqual(refreshCalls, ['chain-1', 'chain-2']);
  assert.deepEqual(rescannedWalletIds, ['wallet-1', 'wallet-2']);
  assert.equal(result.snapshot.force, true);
  assert.equal(result.snapshot.snapshotDateUtc, '2026-02-13');
});

test('snapshots-scheduler: skips overlapping cycle ticks', async () => {
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => {
    releaseRefresh = resolve;
  });

  const scheduler = createScheduler({
    chainsRepository: {
      listChains: async () => [{ id: 'chain-1', slug: 'ethereum', family: 'evm', isActive: true }]
    },
    walletsRepository: {
      listWallets: async () => [{ id: 'wallet-1', chainId: 'chain-1' }]
    },
    walletScanService: {
      rescanWallet: async () => {}
    },
    universeRefreshService: {
      refreshChainById: async () => {
        await refreshGate;
        return { snapshotId: 'snapshot-1', status: 'ready' };
      }
    },
    tokenUniverseRepository: {
      getSnapshotItems: async () => []
    },
    trackedTokensRepository: {
      upsertTrackedTokensBatch: async () => []
    },
    dailySnapshotService: {
      runDailySnapshot: async () => ({})
    },
    now: () => new Date('2026-02-13T00:00:00.000Z')
  });

  const firstRun = scheduler.runAutoScanCycle();
  const secondRun = await scheduler.runAutoScanCycle();

  assert.equal(secondRun.skipped, true);
  assert.equal(secondRun.reason, 'in_progress');

  releaseRefresh();
  await firstRun;
});

test('snapshots-scheduler: skips unsupported chain families in auto-scan cycle', async () => {
  const refreshCalls = [];
  const scheduler = createScheduler({
    chainsRepository: {
      listChains: async () => [
        { id: 'chain-1', slug: 'ethereum', family: 'evm', isActive: true },
        { id: 'chain-2', slug: 'solana', family: 'solana', isActive: true }
      ]
    },
    walletsRepository: {
      listWallets: async () => [
        { id: 'wallet-1', chainId: 'chain-1' },
        { id: 'wallet-2', chainId: 'chain-2' }
      ]
    },
    walletScanService: {
      rescanWallet: async () => {}
    },
    universeRefreshService: {
      refreshChainById: async ({ chainId }) => {
        refreshCalls.push(chainId);
        return { snapshotId: `snapshot-${chainId}`, status: 'ready' };
      }
    },
    tokenUniverseRepository: {
      getSnapshotItems: async () => []
    },
    trackedTokensRepository: {
      upsertTrackedTokensBatch: async () => []
    },
    dailySnapshotService: {
      runDailySnapshot: async () => ({})
    },
    now: () => new Date('2026-02-13T00:00:00.000Z')
  });

  const result = await scheduler.runAutoScanCycle();
  assert.deepEqual(refreshCalls, ['chain-1']);
  assert.equal(result.chainOutcomes.length, 2);
  const solanaOutcome = result.chainOutcomes.find((outcome) => outcome.chainId === 'chain-2');
  assert.equal(solanaOutcome.status, 'skipped');
  assert.equal(solanaOutcome.reason, 'unsupported_family');
});

test('snapshots-scheduler: continues rescans when universe refresh fails for a chain', async () => {
  const rescannedWalletIds = [];
  const scheduler = createScheduler({
    chainsRepository: {
      listChains: async () => [{ id: 'chain-1', slug: 'ronin', family: 'evm', isActive: true }]
    },
    walletsRepository: {
      listWallets: async () => [{ id: 'wallet-1', chainId: 'chain-1' }]
    },
    walletScanService: {
      rescanWallet: async ({ walletId }) => {
        rescannedWalletIds.push(walletId);
      }
    },
    universeRefreshService: {
      refreshChainById: async () => {
        throw new Error('unsupported universe source');
      }
    },
    tokenUniverseRepository: {
      getSnapshotItems: async () => []
    },
    trackedTokensRepository: {
      upsertTrackedTokensBatch: async () => []
    },
    dailySnapshotService: {
      runDailySnapshot: async () => ({})
    },
    now: () => new Date('2026-02-13T00:00:00.000Z')
  });

  const result = await scheduler.runAutoScanCycle();
  assert.deepEqual(rescannedWalletIds, ['wallet-1']);
  assert.equal(result.chainOutcomes[0].status, 'partial');
  assert.match(result.chainOutcomes[0].refreshErrorMessage, /unsupported universe source/i);
});
