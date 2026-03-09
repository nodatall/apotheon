const DEXSCREENER_BASE_URL = 'https://api.dexscreener.com';

function normalizeContract(contract) {
  const value = typeof contract === 'string' ? contract.trim() : '';
  if (!value) {
    return '';
  }

  return value.toLowerCase();
}

function normalizeChainSlug(chain) {
  const slug = typeof chain?.slug === 'string' ? chain.slug.trim().toLowerCase() : '';
  if (!slug) {
    return '';
  }

  const aliases = {
    'avalanche-c-chain': 'avalanche'
  };

  return aliases[slug] ?? slug;
}

function toFiniteNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function chooseBestPair(pairs) {
  let bestPair = null;
  let bestLiquidityUsd = -1;

  for (const pair of pairs) {
    const liquidityUsd = toFiniteNumber(pair?.liquidity?.usd) ?? 0;
    if (!bestPair || liquidityUsd > bestLiquidityUsd) {
      bestPair = pair;
      bestLiquidityUsd = liquidityUsd;
    }
  }

  return bestPair;
}

export function createDexscreenerClient({
  fetchImpl = fetch,
  baseUrl = DEXSCREENER_BASE_URL,
  timeoutMs = 8000
} = {}) {
  async function getPriceByContract({ chain, contract }) {
    const chainSlug = normalizeChainSlug(chain);
    const normalizedContract = normalizeContract(contract);
    if (!chainSlug || !normalizedContract) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = new URL(`/latest/dex/tokens/${normalizedContract}`, baseUrl);
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          accept: 'application/json'
        },
        signal: controller.signal
      });
      if (!response.ok) {
        return null;
      }

      const payload = await response.json().catch(() => null);
      const pairs = Array.isArray(payload?.pairs) ? payload.pairs : [];
      if (pairs.length === 0) {
        return null;
      }

      const chainPairs = pairs.filter((pair) => {
        const pairChainId =
          typeof pair?.chainId === 'string' ? pair.chainId.trim().toLowerCase() : '';
        return pairChainId === chainSlug;
      });
      if (chainPairs.length === 0) {
        return null;
      }

      const bestPair = chooseBestPair(chainPairs);
      const usdPrice = toFiniteNumber(bestPair?.priceUsd);
      if (usdPrice === null || usdPrice <= 0) {
        return null;
      }

      return usdPrice;
    } catch (_error) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    getPriceByContract
  };
}
