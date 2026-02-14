import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniverseRefreshService } from './universe-refresh.service.js';

test('refreshChain persists ranked birdeye snapshot with source birdeye', async () => {
  const persisted = {
    snapshot: null,
    items: null
  };

  const service = createUniverseRefreshService({
    chainsRepository: {
      listChains: async () => []
    },
    tokenUniverseRepository: {
      upsertSnapshot: async (input) => {
        persisted.snapshot = input;
        return {
          id: '81ed4ec1-d1de-4ddf-87cb-27340ec19439',
          ...input
        };
      },
      replaceSnapshotItems: async (_snapshotId, items) => {
        persisted.items = items;
      }
    },
    birdeyeClient: {
      fetchTopTokens: async () => [
        {
          contractOrMint: '0xaaa',
          symbol: 'AAA',
          marketCapUsd: 100
        },
        {
          contractOrMint: '0xbbb',
          symbol: 'BBB',
          marketCapUsd: 50
        }
      ]
    },
    targetSize: 2
  });

  const result = await service.refreshChain({
    chain: {
      id: '7bdc95fe-7d4d-4e4c-99e1-8970222af223',
      slug: 'ethereum',
      family: 'evm',
      isActive: true
    },
    asOfDateUtc: '2026-02-13'
  });

  assert.equal(result.source, 'birdeye');
  assert.equal(result.status, 'ready');
  assert.equal(persisted.snapshot.source, 'birdeye');
  assert.equal(persisted.snapshot.itemCount, 2);
  assert.equal(persisted.items[0].rank, 1);
  assert.equal(persisted.items[1].rank, 2);
});

test('refreshAllChains skips inactive chains and stores failed snapshots', async () => {
  const upsertCalls = [];

  const service = createUniverseRefreshService({
    chainsRepository: {
      listChains: async () => [
        { id: 'active-1', slug: 'ethereum', family: 'evm', isActive: true },
        { id: 'inactive-1', slug: 'base', family: 'evm', isActive: false }
      ]
    },
    tokenUniverseRepository: {
      upsertSnapshot: async (input) => {
        upsertCalls.push(input);
        return {
          id: `${input.chainId}-snapshot`,
          ...input
        };
      },
      getSnapshotByChainAndDate: async () => null,
      getLatestScanEligibleSnapshot: async () => ({
        id: 'previous-active'
      }),
      replaceSnapshotItems: async () => {}
    },
    birdeyeClient: {
      fetchTopTokens: async () => {
        throw new Error('provider timeout');
      }
    }
  });

  const outcomes = await service.refreshAllChains({ asOfDateUtc: '2026-02-13' });

  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, 'failed');
  assert.equal(outcomes[0].chainId, 'active-1');
  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].status, 'failed');
  assert.equal(upsertCalls[0].source, 'birdeye');
});
