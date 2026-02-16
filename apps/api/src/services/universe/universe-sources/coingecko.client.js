const DEFAULT_COINGECKO_BASE_URL = 'https://pro-api.coingecko.com/api/v3';

function resolveCoinGeckoPlatform(chain) {
  if (chain.family === 'solana') {
    return 'solana';
  }

  const platformBySlug = {
    ethereum: 'ethereum',
    base: 'base',
    arbitrum: 'arbitrum-one',
    optimism: 'optimistic-ethereum',
    polygon: 'polygon-pos',
    bsc: 'binance-smart-chain',
    avalanche: 'avalanche'
  };

  return platformBySlug[chain.slug] ?? null;
}

function normalizeAddress(address) {
  if (typeof address !== 'string') {
    return null;
  }

  const trimmed = address.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

async function mapWithConcurrency(items, mapper, concurrency) {
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const output = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return output;
}

function resolveKeyMode({ baseUrl, keyMode }) {
  if (keyMode && keyMode !== 'auto') {
    return keyMode;
  }

  const host = new URL(baseUrl).host.toLowerCase();
  return host === 'pro-api.coingecko.com' ? 'pro' : 'demo';
}

function resolveApiKeyHeader({ baseUrl, keyMode }) {
  const mode = resolveKeyMode({ baseUrl, keyMode });
  return mode === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';
}

export function createCoinGeckoClient({
  fetchImpl = fetch,
  apiKey = process.env.COINGECKO_API_KEY || '',
  baseUrl = DEFAULT_COINGECKO_BASE_URL,
  timeoutMs = 15000,
  platformFetchConcurrency = 8,
  keyMode = 'auto'
} = {}) {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('CoinGecko API key is required.');
  }
  const apiKeyHeader = resolveApiKeyHeader({ baseUrl, keyMode });

  async function requestJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          [apiKeyHeader]: apiKey
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`CoinGecko request failed with HTTP ${response.status}.`);
      }

      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchMarkets(limit) {
    const perPage = Math.min(250, Math.max(limit, 1));
    const url = new URL('/coins/markets', baseUrl);
    url.searchParams.set('vs_currency', 'usd');
    url.searchParams.set('order', 'market_cap_desc');
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', '1');
    url.searchParams.set('sparkline', 'false');

    return requestJson(url);
  }

  async function fetchCoinPlatforms(coinId) {
    const url = new URL(`/coins/${coinId}`, baseUrl);
    url.searchParams.set('localization', 'false');
    url.searchParams.set('tickers', 'false');
    url.searchParams.set('market_data', 'false');
    url.searchParams.set('community_data', 'false');
    url.searchParams.set('developer_data', 'false');
    url.searchParams.set('sparkline', 'false');

    return requestJson(url);
  }

  async function fetchTopTokens({ chain, limit = 200 }) {
    const platform = resolveCoinGeckoPlatform(chain);
    if (!platform) {
      throw new Error(`CoinGecko fallback unsupported for chain slug "${chain.slug}".`);
    }

    const markets = await fetchMarkets(limit * 3);
    if (!Array.isArray(markets) || markets.length === 0) {
      throw new Error('CoinGecko markets response returned zero rows.');
    }

    const candidateMarkets = markets.filter((market) => Boolean(market?.id));
    const coins = await mapWithConcurrency(
      candidateMarkets,
      async (market) => fetchCoinPlatforms(market.id),
      platformFetchConcurrency
    );

    const tokens = [];
    for (let index = 0; index < candidateMarkets.length; index += 1) {
      if (tokens.length >= limit) {
        break;
      }

      const market = candidateMarkets[index];
      const coin = coins[index];
      const contractOrMint = normalizeAddress(coin?.platforms?.[platform]);
      if (!contractOrMint) {
        continue;
      }
      const normalizedContractOrMint =
        chain.family === 'evm' ? contractOrMint.toLowerCase() : contractOrMint;

      tokens.push({
        rank: tokens.length + 1,
        contractOrMint: normalizedContractOrMint,
        symbol: typeof market.symbol === 'string' ? market.symbol.toUpperCase() : null,
        name: typeof market.name === 'string' ? market.name : null,
        decimals: null,
        marketCapUsd: typeof market.market_cap === 'number' ? market.market_cap : null,
        sourcePayloadHash: null
      });
    }

    if (tokens.length === 0) {
      throw new Error(`CoinGecko fallback found zero contract-mapped tokens for ${platform}.`);
    }

    return tokens;
  }

  return {
    fetchTopTokens
  };
}
