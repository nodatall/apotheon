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
