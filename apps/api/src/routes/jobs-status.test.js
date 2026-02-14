import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createUniverseRouter } from './universe.js';
import { createWalletsRouter } from './wallets.js';
import { createSnapshotsRouter } from './snapshots.js';

const servers = [];

async function startServer(configure) {
  const app = express();
  app.use(express.json());
  configure(app);

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

test('jobs-status: universe, wallet scan, and snapshot status endpoints return status payload', async () => {
  const baseUrl = await startServer((app) => {
    app.use(
      '/api/universe',
      createUniverseRouter({
        tokenUniverseRepository: {
          getLatestSnapshotByChain: async () => ({
            status: 'partial',
            source: 'birdeye',
            errorMessage: 'timeout',
            asOfDateUtc: '2026-02-13'
          }),
          getLatestScanEligibleSnapshot: async () => null,
          getSnapshotWithItems: async () => null
        },
        universeRefreshService: {
          refreshChainById: async () => ({})
        }
      })
    );

    app.use(
      '/api/wallets',
      createWalletsRouter({
        chainsRepository: {
          getChainById: async () => null
        },
        walletsRepository: {
          listWallets: async () => []
        },
        scansRepository: {
          getLatestScanByWallet: async () => ({ status: 'failed', errorMessage: 'rpc error' })
        },
        walletScanService: {
          runScan: async () => ({}),
          rescanWallet: async () => ({})
        }
      })
    );

    app.use(
      '/api/snapshots',
      createSnapshotsRouter({
        dailySnapshotService: {
          runDailySnapshot: async () => ({})
        },
        snapshotsRepository: {
          getLatestDailySnapshot: async () => ({
            status: 'success',
            snapshotDateUtc: '2026-02-13',
            errorMessage: null,
            finishedAt: '2026-02-13T01:00:00.000Z'
          }),
          getSnapshotItems: async () => [],
          getDailySnapshotByDate: async () => null
        }
      })
    );
  });

  const [universe, wallet, snapshot] = await Promise.all([
    fetch(`${baseUrl}/api/universe/chain-1/jobs/status`),
    fetch(`${baseUrl}/api/wallets/wallet-1/jobs/status`),
    fetch(`${baseUrl}/api/snapshots/jobs/status`)
  ]);

  assert.equal(universe.status, 200);
  assert.equal(wallet.status, 200);
  assert.equal(snapshot.status, 200);
});
