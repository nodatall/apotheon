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
          {
            snapshotDateUtc: '2026-02-12',
            totalUsdValue: 100,
            tokenUsdValue: 70,
            protocolUsdValue: 30
          },
          {
            snapshotDateUtc: '2026-02-13',
            totalUsdValue: 125,
            tokenUsdValue: 80,
            protocolUsdValue: 45
          }
        ]
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/history`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.totals.length, 2);
  assert.equal(body.data.totals[0].tokenUsdValue, 70);
  assert.equal(body.data.totals[0].protocolUsdValue, 30);
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

test('dashboard: hides assets with usd value below $5 after aggregation', async () => {
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
            portfolioUsdValue: 10.49,
            tokenUsdValue: 10.49,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [
              {
                snapshotItemId: 'agg-1',
                walletId: 'wallet-1',
                chainId: 'ethereum',
                contractOrMint: 'native:ethereum',
                symbol: 'ETH',
                quantity: 0.001,
                usdPrice: 3000,
                usdValue: 3,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'agg-2',
                walletId: 'wallet-2',
                chainId: 'ethereum',
                contractOrMint: 'native:ethereum',
                symbol: 'ETH',
                quantity: 0.001,
                usdPrice: 3000,
                usdValue: 3,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'dust-number',
                walletId: 'wallet-3',
                chainId: 'ethereum',
                contractOrMint: '0xdust',
                symbol: 'DUST',
                quantity: 100,
                usdPrice: 0.0499,
                usdValue: 4.99,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'dust-string',
                walletId: 'wallet-4',
                chainId: 'ethereum',
                contractOrMint: '0xstring',
                symbol: 'SSTR',
                quantity: '10',
                usdPrice: '0.45',
                usdValue: '4.50',
                valuationStatus: 'known'
              }
            ],
            protocols: []
          }
        }),
        getHistory: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.rows.tokens.length, 1);
  assert.equal(body.data.rows.tokens[0].symbol, 'ETH');
  assert.equal(body.data.rows.tokens[0].walletId, null);
  assert.equal(body.data.rows.tokens[0].usdValue, 6);
});

test('dashboard: hides unknown-valuation rows when a known row exists for the same symbol', async () => {
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
            portfolioUsdValue: 2000,
            tokenUsdValue: 2000,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [
              {
                snapshotItemId: 'known-1',
                walletId: 'wallet-1',
                chainId: 'ethereum',
                contractOrMint: 'native:ethereum',
                symbol: 'ETH',
                quantity: 1,
                usdPrice: 2000,
                usdValue: 2000,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'unknown-1',
                walletId: 'wallet-2',
                chainId: 'arbitrum',
                contractOrMint: 'native:arbitrum',
                symbol: 'ETH',
                quantity: 0.2,
                usdPrice: null,
                usdValue: null,
                valuationStatus: 'unknown'
              }
            ],
            protocols: []
          }
        }),
        getHistory: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.rows.tokens.length, 1);
  assert.equal(body.data.rows.tokens[0].symbol, 'ETH');
  assert.equal(body.data.rows.tokens[0].chainId, 'ethereum');
  assert.equal(body.data.rows.tokens[0].usdValue, 2000);
});

test('dashboard: keeps unknown-valuation rows when symbol has no known-valued counterpart', async () => {
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
            portfolioUsdValue: 2000,
            tokenUsdValue: 2000,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [
              {
                snapshotItemId: 'known-1',
                walletId: 'wallet-1',
                chainId: 'ethereum',
                contractOrMint: 'native:ethereum',
                symbol: 'ETH',
                quantity: 1,
                usdPrice: 2000,
                usdValue: 2000,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'unknown-1',
                walletId: 'wallet-2',
                chainId: 'beam',
                contractOrMint: '0xath',
                symbol: 'ATH',
                quantity: 1000,
                usdPrice: null,
                usdValue: null,
                valuationStatus: 'unknown'
              }
            ],
            protocols: []
          }
        }),
        getHistory: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.rows.tokens.length, 2);
  assert.equal(body.data.rows.tokens[0].symbol, 'ETH');
  assert.equal(body.data.rows.tokens[1].symbol, 'ATH');
  assert.equal(body.data.rows.tokens[1].usdValue, null);
});

test('dashboard: aggregation prefers known valuation status when usd value is present', async () => {
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
            portfolioUsdValue: 50,
            tokenUsdValue: 50,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [
              {
                snapshotItemId: 'known-avax',
                walletId: 'wallet-1',
                chainId: 'avalanche',
                contractOrMint: 'native:avalanche',
                symbol: 'AVAX',
                quantity: 1,
                usdPrice: 10,
                usdValue: 10,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'unknown-avax',
                walletId: 'wallet-2',
                chainId: 'avalanche',
                contractOrMint: 'native:avalanche',
                symbol: 'AVAX',
                quantity: 4,
                usdPrice: null,
                usdValue: null,
                valuationStatus: 'unknown'
              }
            ],
            protocols: []
          }
        }),
        getHistory: async () => []
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.rows.tokens.length, 1);
  assert.equal(body.data.rows.tokens[0].symbol, 'AVAX');
  assert.equal(body.data.rows.tokens[0].usdValue, 10);
  assert.equal(body.data.rows.tokens[0].valuationStatus, 'known');
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

test('dashboard: aggregates same-chain token rows across multiple wallets for live scan payload', async () => {
  const baseUrl = await startServer(
    createPortfolioRouter({
      snapshotsRepository: {
        getLatestDashboardPayload: async () => ({
          latestSnapshot: null,
          totals: {
            portfolioUsdValue: 0,
            tokenUsdValue: 0,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [],
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
            portfolioUsdValue: 329.09,
            tokenUsdValue: 329.09,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [
              {
                snapshotItemId: 'scan-item-1',
                walletId: 'wallet-1',
                chainId: 'eth-chain',
                assetRefId: 'token-eth',
                contractOrMint: 'native:ethereum',
                symbol: 'ETH',
                quantity: 0.137336,
                usdPrice: 1962.14,
                usdValue: 269.47,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'scan-item-2',
                walletId: 'wallet-2',
                chainId: 'eth-chain',
                assetRefId: 'token-eth',
                contractOrMint: 'native:ethereum',
                symbol: 'ETH',
                quantity: 0.030387,
                usdPrice: 1962.2,
                usdValue: 59.62,
                valuationStatus: 'known'
              }
            ],
            protocols: []
          }
        })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.rows.tokens.length, 1);
  assert.equal(body.data.rows.tokens[0].symbol, 'ETH');
  assert.equal(body.data.rows.tokens[0].walletId, null);
  assert.equal(body.data.rows.tokens[0].quantity, 0.167723);
  assert.ok(Math.abs(body.data.rows.tokens[0].usdValue - 329.09) < 1e-9);
  assert.ok(
    Math.abs(
      body.data.rows.tokens[0].usdPrice -
        body.data.rows.tokens[0].usdValue / body.data.rows.tokens[0].quantity
    ) < 1e-12
  );
});

test('dashboard: walletIds query scopes rows before aggregation', async () => {
  const baseUrl = await startServer(
    createPortfolioRouter({
      snapshotsRepository: {
        getLatestDashboardPayload: async () => ({
          latestSnapshot: null,
          totals: {
            portfolioUsdValue: 0,
            tokenUsdValue: 0,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [],
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
            portfolioUsdValue: 329.09,
            tokenUsdValue: 329.09,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [
              {
                snapshotItemId: 'scan-item-1',
                walletId: 'wallet-1',
                chainId: 'eth-chain',
                assetRefId: 'token-eth',
                contractOrMint: 'native:ethereum',
                symbol: 'ETH',
                quantity: 0.137336,
                usdPrice: 1962.14,
                usdValue: 269.47,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'scan-item-2',
                walletId: 'wallet-2',
                chainId: 'eth-chain',
                assetRefId: 'token-eth',
                contractOrMint: 'native:ethereum',
                symbol: 'ETH',
                quantity: 0.030387,
                usdPrice: 1962.2,
                usdValue: 59.62,
                valuationStatus: 'known'
              }
            ],
            protocols: []
          }
        })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard?walletIds=wallet-1`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.rows.tokens.length, 1);
  assert.equal(body.data.rows.tokens[0].symbol, 'ETH');
  assert.equal(body.data.rows.tokens[0].walletId, null);
  assert.equal(body.data.rows.tokens[0].quantity, 0.137336);
  assert.equal(body.data.rows.tokens[0].usdValue, 269.47);
});

test('dashboard: polygon native alias rows are deduped and do not double-count value', async () => {
  const baseUrl = await startServer(
    createPortfolioRouter({
      snapshotsRepository: {
        getLatestDashboardPayload: async () => ({
          latestSnapshot: null,
          totals: {
            portfolioUsdValue: 0,
            tokenUsdValue: 0,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [],
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
            portfolioUsdValue: 17.73,
            tokenUsdValue: 17.73,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [
              {
                snapshotItemId: 'scan-poly-native',
                scanId: 'scan-1',
                walletId: 'wallet-1',
                chainId: 'polygon-chain',
                contractOrMint: 'native:polygon',
                symbol: 'MATIC',
                quantity: 80.723081,
                usdPrice: 0.1098,
                usdValue: 8.86,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'scan-poly-alias',
                scanId: 'scan-1',
                walletId: 'wallet-1',
                chainId: 'polygon-chain',
                contractOrMint: '0x0000000000000000000000000000000000001010',
                symbol: 'POL',
                quantity: 80.723081,
                usdPrice: 0.1099,
                usdValue: 8.87,
                valuationStatus: 'known'
              }
            ],
            protocols: []
          }
        })
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.rows.tokens.length, 1);
  assert.equal(body.data.rows.tokens[0].symbol, 'POL');
  assert.equal(body.data.rows.tokens[0].contractOrMint, 'native:polygon');
  assert.equal(body.data.rows.tokens[0].quantity, 80.723081);
  assert.equal(body.data.rows.tokens[0].usdValue, 8.87);
});

test('dashboard: aggregates same-chain token rows across multiple wallets for snapshot payload', async () => {
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
            portfolioUsdValue: 30,
            tokenUsdValue: 30,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [
              {
                snapshotItemId: 'snapshot-token-1',
                walletId: 'wallet-1',
                chainId: 'chain-1',
                contractOrMint: '0xabc',
                symbol: 'AAA',
                quantity: 2,
                usdPrice: 5,
                usdValue: 10,
                valuationStatus: 'known'
              },
              {
                snapshotItemId: 'snapshot-token-2',
                walletId: 'wallet-2',
                chainId: 'chain-1',
                contractOrMint: '0xabc',
                symbol: 'AAA',
                quantity: 4,
                usdPrice: 5,
                usdValue: 20,
                valuationStatus: 'known'
              }
            ],
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
  assert.equal(body.data.rows.tokens.length, 1);
  assert.equal(body.data.rows.tokens[0].symbol, 'AAA');
  assert.equal(body.data.rows.tokens[0].walletId, null);
  assert.equal(body.data.rows.tokens[0].quantity, 6);
  assert.equal(body.data.rows.tokens[0].usdValue, 30);
  assert.equal(body.data.rows.tokens[0].usdPrice, 5);
});

test('dashboard: enriches token rows with icon URLs when token icon service is provided', async () => {
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
            portfolioUsdValue: 100,
            tokenUsdValue: 100,
            protocolUsdValue: 0
          },
          rows: {
            tokens: [
              {
                snapshotItemId: 'snapshot-token-1',
                symbol: 'AAA',
                usdValue: 100,
                contractOrMint: '0xabc',
                chainId: 'chain-1'
              }
            ],
            protocols: []
          }
        }),
        getHistory: async () => []
      },
      tokenIconService: {
        enrichTokenRows: async (rows) =>
          rows.map((row) => ({
            ...row,
            iconUrl: 'https://icons.example/token.png'
          }))
      }
    })
  );

  const response = await fetch(`${baseUrl}/api/portfolio/dashboard`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.rows.tokens[0].iconUrl, 'https://icons.example/token.png');
});
