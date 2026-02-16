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
