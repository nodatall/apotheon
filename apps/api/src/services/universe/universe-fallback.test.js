import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniverseRefreshService } from './universe-refresh.service.js';
import { createCoinGeckoClient } from './universe-sources/coingecko.client.js';
import { EnvConfigError, loadRuntimeEnv } from '../../config/env.js';

test('CoinGecko client derives ordered per-chain universe using markets + platform mapping', async () => {
  const calls = [];
  const client = createCoinGeckoClient({
    apiKey: 'test-key',
    fetchImpl: async (url) => {
      const fullUrl = String(url);
      calls.push(fullUrl);

      if (fullUrl.includes('/coins/markets')) {
        return {
          ok: true,
          json: async () => [
            { id: 'coin-a', symbol: 'aaa', name: 'Coin A', market_cap: 1000 },
            { id: 'coin-b', symbol: 'bbb', name: 'Coin B', market_cap: 900 },
            { id: 'coin-c', symbol: 'ccc', name: 'Coin C', market_cap: 800 }
          ]
        };
      }

      if (fullUrl.includes('/coins/coin-a')) {
        return {
          ok: true,
          json: async () => ({
            platforms: { 'arbitrum-one': '0xaaa' }
          })
        };
      }

      if (fullUrl.includes('/coins/coin-b')) {
        return {
          ok: true,
          json: async () => ({
            platforms: {}
          })
        };
      }

      return {
        ok: true,
        json: async () => ({
          platforms: { 'arbitrum-one': '0xccc' }
        })
      };
    }
  });

  const tokens = await client.fetchTopTokens({
    chain: { slug: 'arbitrum', family: 'evm' },
    limit: 2
  });

  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].contractOrMint, '0xaaa');
  assert.equal(tokens[1].contractOrMint, '0xccc');
  assert.equal(tokens[0].rank, 1);
  assert.equal(tokens[1].rank, 2);
  assert.ok(calls.some((entry) => entry.includes('/coins/markets')));
});

test('refreshChain uses coingecko fallback when birdeye fails', async () => {
  const writtenSnapshots = [];

  const service = createUniverseRefreshService({
    chainsRepository: {
      listChains: async () => []
    },
    tokenUniverseRepository: {
      upsertSnapshot: async (input) => {
        writtenSnapshots.push(input);
        return {
          id: 'snapshot-1',
          ...input
        };
      },
      replaceSnapshotItems: async () => {}
    },
    birdeyeClient: {
      fetchTopTokens: async () => {
        throw new Error('birdeye unsupported');
      }
    },
    coingeckoClient: {
      fetchTopTokens: async () => [
        {
          contractOrMint: '0xabc',
          symbol: 'ABC'
        }
      ]
    },
    targetSize: 200
  });

  const outcome = await service.refreshChain({
    chain: {
      id: 'chain-1',
      slug: 'arbitrum',
      family: 'evm',
      isActive: true
    },
    asOfDateUtc: '2026-02-13'
  });

  assert.equal(outcome.source, 'coingecko_fallback');
  assert.equal(writtenSnapshots[0].source, 'coingecko_fallback');
  assert.equal(outcome.status, 'partial');
});

test('CoinGecko client preserves /api/v3 base path when building request URLs', async () => {
  const calls = [];
  const client = createCoinGeckoClient({
    apiKey: 'test-key',
    baseUrl: 'https://pro-api.coingecko.com/api/v3',
    fetchImpl: async (url) => {
      const fullUrl = String(url);
      calls.push(fullUrl);

      if (fullUrl.includes('/coins/markets')) {
        return {
          ok: true,
          json: async () => [{ id: 'coin-a', symbol: 'aaa', name: 'Coin A', market_cap: 1 }]
        };
      }

      return {
        ok: true,
        json: async () => ({ platforms: { ethereum: '0xaaa' } })
      };
    }
  });

  await client.fetchTopTokens({
    chain: { slug: 'ethereum', family: 'evm' },
    limit: 1
  });

  assert.ok(calls.every((url) => url.includes('/api/v3/')));
});

test('CoinGecko client uses demo api-key header for demo key mode', async () => {
  const seenHeaders = [];
  const client = createCoinGeckoClient({
    apiKey: 'demo-key',
    keyMode: 'demo',
    baseUrl: 'https://api.coingecko.com/api/v3',
    fetchImpl: async (_url, init) => {
      seenHeaders.push(init?.headers ?? {});
      if (String(_url).includes('/coins/markets')) {
        return {
          ok: true,
          json: async () => [{ id: 'coin-a', symbol: 'aaa', name: 'Coin A', market_cap: 1 }]
        };
      }
      return {
        ok: true,
        json: async () => ({ platforms: { ethereum: '0xaaa' } })
      };
    }
  });

  const tokens = await client.fetchTopTokens({
    chain: { slug: 'ethereum', family: 'evm' },
    limit: 1
  });

  assert.equal(tokens.length, 1);
  assert.ok(seenHeaders.every((headers) => 'x-cg-demo-api-key' in headers));
});

test('runtime env reports incompatible CoinGecko base URL and key mode', () => {
  assert.throws(
    () =>
      loadRuntimeEnv({
        PORT: '4000',
        COINGECKO_API_KEY: 'test-key',
        COINGECKO_BASE_URL: 'https://pro-api.coingecko.com/api/v3',
        COINGECKO_KEY_MODE: 'demo'
      }),
    (error) =>
      error instanceof EnvConfigError &&
      /incompatible with pro-api\.coingecko\.com/i.test(error.message)
  );
});
