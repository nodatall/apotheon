import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createUniverseRefreshService } from './universe-refresh.service.js';
import { createUniverseRouter } from '../../routes/universe.js';

const servers = [];

async function startTestServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/universe', router);

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

test('refreshAllChains keeps previous active snapshot when both sources fail', async () => {
  let failedWrites = 0;

  const service = createUniverseRefreshService({
    chainsRepository: {
      listChains: async () => [{ id: 'chain-1', slug: 'base', family: 'evm', isActive: true }]
    },
    tokenUniverseRepository: {
      getSnapshotByChainAndDate: async () => null,
      getLatestScanEligibleSnapshot: async () => ({
        id: 'snapshot-prev-ready',
        status: 'ready'
      }),
      upsertSnapshot: async (input) => {
        failedWrites += 1;
        return {
          id: 'snapshot-failed',
          ...input
        };
      },
      replaceSnapshotItems: async () => {}
    },
    birdeyeClient: {
      fetchTopTokens: async () => {
        throw new Error('birdeye unavailable');
      }
    },
    coingeckoClient: {
      fetchTopTokens: async () => {
        throw new Error('coingecko unavailable');
      }
    }
  });

  const outcomes = await service.refreshAllChains({ asOfDateUtc: '2026-02-13' });

  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, 'failed');
  assert.equal(outcomes[0].activeSnapshotId, 'snapshot-prev-ready');
  assert.equal(failedWrites, 1);
});

test('refreshAllChains does not overwrite same-day scan-eligible snapshot on failure', async () => {
  let upsertCalled = false;

  const service = createUniverseRefreshService({
    chainsRepository: {
      listChains: async () => [{ id: 'chain-1', slug: 'base', family: 'evm', isActive: true }]
    },
    tokenUniverseRepository: {
      getSnapshotByChainAndDate: async () => ({
        id: 'snapshot-same-day-partial',
        source: 'coingecko_fallback',
        status: 'partial',
        itemCount: 42
      }),
      getLatestScanEligibleSnapshot: async () => ({
        id: 'snapshot-same-day-partial'
      }),
      upsertSnapshot: async () => {
        upsertCalled = true;
      },
      replaceSnapshotItems: async () => {}
    },
    birdeyeClient: {
      fetchTopTokens: async () => {
        throw new Error('birdeye unavailable');
      }
    },
    coingeckoClient: {
      fetchTopTokens: async () => {
        throw new Error('coingecko unavailable');
      }
    }
  });

  const outcomes = await service.refreshAllChains({ asOfDateUtc: '2026-02-13' });

  assert.equal(outcomes[0].status, 'partial');
  assert.equal(outcomes[0].activeSnapshotId, 'snapshot-same-day-partial');
  assert.equal(upsertCalled, false);
});

test('GET /api/universe/:chainId/active returns partial snapshots as scan-eligible', async () => {
  const baseUrl = await startTestServer(
    createUniverseRouter({
      tokenUniverseRepository: {
        getLatestScanEligibleSnapshot: async () => ({
          id: 'snapshot-partial'
        }),
        getSnapshotWithItems: async () => ({
          id: 'snapshot-partial',
          status: 'partial',
          source: 'coingecko_fallback',
          itemCount: 99,
          items: [{ rank: 1, contractOrMint: '0xabc' }]
        }),
        getLatestSnapshotByChain: async () => null
      },
      universeRefreshService: {
        refreshChainById: async () => ({})
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/universe/chain-1/active`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.data.status, 'partial');
  assert.equal(body.data.items.length, 1);
});
