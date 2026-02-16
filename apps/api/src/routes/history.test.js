import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPortfolioRouter } from './portfolio.js';

const servers = [];

async function startServer(router) {
  const app = express();
  app.use('/api/portfolio', router);

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

test('history: returns daily totals from snapshot repository', async () => {
  const baseUrl = await startServer(
    createPortfolioRouter({
      snapshotsRepository: {
        getHistory: async () => [
          { snapshotDateUtc: '2026-02-12', totalUsdValue: 100 },
          { snapshotDateUtc: '2026-02-13', totalUsdValue: 125 }
        ]
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/history`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.totals.length, 2);
});

test('dashboard: returns latest snapshot totals and grouped rows', async () => {
  const baseUrl = await startServer(
    createPortfolioRouter({
      snapshotsRepository: {
        getLatestDashboardPayload: async () => ({
          latestSnapshot: {
            id: 'snapshot-1',
            snapshotDateUtc: '2026-02-13',
            status: 'partial',
            finishedAt: '2026-02-13T00:00:00.000Z',
            errorMessage: 'protocol read failed'
          },
          totals: {
            portfolioUsdValue: 150,
            tokenUsdValue: 100,
            protocolUsdValue: 50
          },
          rows: {
            tokens: [{ snapshotItemId: 'item-token-1', symbol: 'AAA', usdValue: 100 }],
            protocols: [{ snapshotItemId: 'item-protocol-1', symbol: 'stAAA', usdValue: 50 }]
          }
        }),
        getHistory: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.latestSnapshot.id, 'snapshot-1');
  assert.equal(body.data.totals.portfolioUsdValue, 150);
  assert.equal(body.data.rows.tokens.length, 1);
  assert.equal(body.data.rows.protocols.length, 1);
  assert.equal(body.data.jobs.snapshot.status, 'partial');
  assert.match(body.data.jobs.snapshot.errorMessage, /protocol read failed/i);
});

test('dashboard: prefers live wallet scan payload when available', async () => {
  const baseUrl = await startServer(
    createPortfolioRouter({
      snapshotsRepository: {
        getLatestDashboardPayload: async () => ({
          latestSnapshot: {
            id: 'snapshot-1',
            snapshotDateUtc: '2026-02-13',
            status: 'success',
            finishedAt: '2026-02-13T00:00:00.000Z',
            errorMessage: null
          },
          totals: {
            portfolioUsdValue: 10,
            tokenUsdValue: 10,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [{ snapshotItemId: 'snapshot-token-1', symbol: 'OLD', usdValue: 10 }],
            protocols: []
          }
        }),
        getHistory: async () => []
      },
      scansRepository: {
        getLatestDashboardPayloadFromScans: async () => ({
          latestSnapshot: null,
          latestLiveScan: {
            finishedAt: '2026-02-14T00:00:00.000Z'
          },
          hasLiveScans: true,
          totals: {
            portfolioUsdValue: 150,
            tokenUsdValue: 150,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [{ snapshotItemId: 'scan-token-1', symbol: 'NEW', usdValue: 150 }],
            protocols: []
          }
        })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.jobs.snapshot.status, 'live_scan');
  assert.equal(body.data.totals.portfolioUsdValue, 150);
  assert.equal(body.data.rows.tokens[0].symbol, 'NEW');
});

test('dashboard: uses live scan payload when scans exist but held rows are empty', async () => {
  const baseUrl = await startServer(
    createPortfolioRouter({
      snapshotsRepository: {
        getLatestDashboardPayload: async () => ({
          latestSnapshot: {
            id: 'snapshot-1',
            snapshotDateUtc: '2026-02-13',
            status: 'success',
            finishedAt: '2026-02-13T00:00:00.000Z',
            errorMessage: null
          },
          totals: {
            portfolioUsdValue: 999,
            tokenUsdValue: 999,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [{ snapshotItemId: 'snapshot-token-1', symbol: 'OLD', usdValue: 999 }],
            protocols: []
          }
        }),
        getHistory: async () => []
      },
      scansRepository: {
        getLatestDashboardPayloadFromScans: async () => ({
          latestSnapshot: null,
          latestLiveScan: {
            finishedAt: '2026-02-14T00:00:00.000Z'
          },
          hasLiveScans: true,
          totals: {
            portfolioUsdValue: 0,
            tokenUsdValue: 0,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [],
            protocols: []
          }
        })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.jobs.snapshot.status, 'live_scan');
  assert.equal(body.data.totals.portfolioUsdValue, 0);
  assert.equal(body.data.rows.tokens.length, 0);
});

test('dashboard: falls back to snapshot payload when no live scans exist', async () => {
  const baseUrl = await startServer(
    createPortfolioRouter({
      snapshotsRepository: {
        getLatestDashboardPayload: async () => ({
          latestSnapshot: {
            id: 'snapshot-1',
            snapshotDateUtc: '2026-02-13',
            status: 'success',
            finishedAt: '2026-02-13T00:00:00.000Z',
            errorMessage: null
          },
          totals: {
            portfolioUsdValue: 999,
            tokenUsdValue: 999,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [{ snapshotItemId: 'snapshot-token-1', symbol: 'OLD', usdValue: 999 }],
            protocols: []
          }
        }),
        getHistory: async () => []
      },
      scansRepository: {
        getLatestDashboardPayloadFromScans: async () => ({
          latestSnapshot: null,
          latestLiveScan: {
            finishedAt: null
          },
          hasLiveScans: false,
          totals: {
            portfolioUsdValue: 0,
            tokenUsdValue: 0,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [],
            protocols: []
          }
        })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.jobs.snapshot.status, 'success');
  assert.equal(body.data.totals.portfolioUsdValue, 999);
  assert.equal(body.data.rows.tokens[0].symbol, 'OLD');
});
