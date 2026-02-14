const DEFAULT_BIRDEYE_BASE_URL = 'https://public-api.birdeye.so';

function resolveBirdeyeChainCode(chain) {
  if (chain.family === 'solana') {
    return 'solana';
  }

  const mapping = {
    ethereum: 'ethereum',
    base: 'base',
    arbitrum: 'arbitrum',
    optimism: 'optimism',
    polygon: 'polygon',
    bsc: 'bsc',
    avalanche: 'avalanche'
  };

  return mapping[chain.slug] ?? null;
}

function normalizeTokenRows(rows, limit) {
  return rows.slice(0, limit).map((row, index) => ({
    rank: index + 1,
    contractOrMint: row.address || row.tokenAddress || row.mintAddress,
    symbol: row.symbol || null,
    name: row.name || null,
    decimals: Number.isInteger(row.decimals) ? row.decimals : null,
    marketCapUsd: typeof row.marketCap === 'number' ? row.marketCap : null,
    sourcePayloadHash: null
  }));
}

export function createBirdeyeClient({
  fetchImpl = fetch,
  apiKey = process.env.BIRDEYE_API_KEY || null,
  baseUrl = DEFAULT_BIRDEYE_BASE_URL,
  timeoutMs = 10000
} = {}) {
  const resolvedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  async function fetchTopTokens({ chain, limit = 200 }) {
    if (!resolvedApiKey) {
      throw new Error('Birdeye API key is not configured.');
    }

    const chainCode = resolveBirdeyeChainCode(chain);
    if (!chainCode) {
      throw new Error(`Birdeye does not support chain slug "${chain.slug}".`);
    }

    const url = new URL('/defi/v3/token/list', baseUrl);
    url.searchParams.set('chain', chainCode);
    url.searchParams.set('sort_by', 'market_cap');
    url.searchParams.set('sort_type', 'desc');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', '0');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'X-API-KEY': resolvedApiKey
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`Birdeye request failed with HTTP ${response.status}.`);
      }

      const body = await response.json();
      const rows = Array.isArray(body?.data?.tokens)
        ? body.data.tokens
        : Array.isArray(body?.data?.items)
          ? body.data.items
          : [];

      const normalized = normalizeTokenRows(rows, limit).filter(
        (item) => typeof item.contractOrMint === 'string' && item.contractOrMint.length > 0
      );

      if (normalized.length === 0) {
        throw new Error('Birdeye returned no token rows for requested chain.');
      }

      return normalized;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    fetchTopTokens
  };
}
