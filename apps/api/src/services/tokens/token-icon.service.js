const EVM_NATIVE_SYMBOL_BY_SLUG = {
  ethereum: 'ETH',
  arbitrum: 'ETH',
  base: 'ETH',
  optimism: 'ETH',
  polygon: 'MATIC',
  bsc: 'BNB',
  avalanche: 'AVAX',
  ronin: 'RON'
};

function resolveNativeSymbol(chain) {
  if (chain.family === 'solana') {
    return 'SOL';
  }

  if (chain.family !== 'evm') {
    return null;
  }

  return EVM_NATIVE_SYMBOL_BY_SLUG[chain.slug] ?? 'ETH';
}

function normalizeContractForChain(chain, contractOrMint) {
  const value = typeof contractOrMint === 'string' ? contractOrMint.trim() : '';
  if (!value || value.startsWith('native:')) {
    return '';
  }

  return chain.family === 'evm' ? value.toLowerCase() : value;
}

function isNativeRow(chain, row) {
  const contractValue = typeof row.contractOrMint === 'string' ? row.contractOrMint.trim() : '';
  if (contractValue.startsWith('native:')) {
    return true;
  }

  if (contractValue.length > 0) {
    return false;
  }

  const nativeSymbol = resolveNativeSymbol(chain);
  const rowSymbol = typeof row.symbol === 'string' ? row.symbol.trim().toUpperCase() : '';
  return Boolean(nativeSymbol && rowSymbol && rowSymbol === nativeSymbol);
}

function toChainId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function toCacheKey(chainId, tokenRef) {
  return `${chainId}:${tokenRef}`;
}

export function createTokenIconService({
  chainsRepository,
  coingeckoClient,
  cacheTtlMs = 6 * 60 * 60 * 1000
} = {}) {
  const iconCache = new Map();

  async function enrichTokenRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    if (safeRows.length === 0 || !chainsRepository?.getChainById) {
      return safeRows;
    }

    const chainIdSet = new Set(safeRows.map((row) => toChainId(row.chainId)).filter(Boolean));
    const chainEntries = await Promise.all(
      [...chainIdSet].map(async (chainId) => [chainId, await chainsRepository.getChainById(chainId)])
    );
    const chainById = new Map(chainEntries.filter(([, chain]) => Boolean(chain)));

    const now = Date.now();
    const contractLookupsByChainId = new Map();
    const nativeLookupsByChainId = new Set();

    for (const row of safeRows) {
      const chainId = toChainId(row.chainId);
      const chain = chainById.get(chainId);
      if (!chain) {
        continue;
      }

      if (isNativeRow(chain, row)) {
        const nativeCacheKey = toCacheKey(chainId, 'native');
        const cachedNative = iconCache.get(nativeCacheKey);
        if (!cachedNative || cachedNative.expiresAt <= now) {
          nativeLookupsByChainId.add(chainId);
        }
        continue;
      }

      const normalizedContract = normalizeContractForChain(chain, row.contractOrMint);
      if (!normalizedContract) {
        continue;
      }

      const key = toCacheKey(chainId, normalizedContract);
      const cached = iconCache.get(key);
      if (cached && cached.expiresAt > now) {
        continue;
      }

      const pending = contractLookupsByChainId.get(chainId) ?? new Set();
      pending.add(normalizedContract);
      contractLookupsByChainId.set(chainId, pending);
    }

    for (const chainId of nativeLookupsByChainId.values()) {
      const chain = chainById.get(chainId);
      if (!chain) {
        continue;
      }

      let imageUrl = null;
      try {
        imageUrl = await coingeckoClient?.getNativeCoinImage?.({ chain });
      } catch (_error) {
        imageUrl = null;
      }

      iconCache.set(toCacheKey(chainId, 'native'), {
        imageUrl: typeof imageUrl === 'string' ? imageUrl : null,
        expiresAt: now + cacheTtlMs
      });
    }

    for (const [chainId, contracts] of contractLookupsByChainId.entries()) {
      const chain = chainById.get(chainId);
      if (!chain) {
        continue;
      }

      let imageMap = {};
      try {
        imageMap = await coingeckoClient?.getTokenImagesByContracts?.({
          chain,
          contracts: [...contracts]
        });
      } catch (_error) {
        imageMap = {};
      }

      for (const contract of contracts) {
        const key = toCacheKey(chainId, contract);
        const imageUrl = typeof imageMap[contract] === 'string' ? imageMap[contract] : null;
        iconCache.set(key, {
          imageUrl,
          expiresAt: now + cacheTtlMs
        });
      }
    }

    return safeRows.map((row) => {
      const chainId = toChainId(row.chainId);
      const chain = chainById.get(chainId);
      if (!chain) {
        return { ...row, iconUrl: null };
      }

      if (isNativeRow(chain, row)) {
        const cacheEntry = iconCache.get(toCacheKey(chainId, 'native'));
        return {
          ...row,
          iconUrl: typeof cacheEntry?.imageUrl === 'string' ? cacheEntry.imageUrl : null
        };
      }

      const normalizedContract = normalizeContractForChain(chain, row.contractOrMint);
      if (!normalizedContract) {
        return { ...row, iconUrl: null };
      }

      const cacheEntry = iconCache.get(toCacheKey(chainId, normalizedContract));
      return {
        ...row,
        iconUrl: typeof cacheEntry?.imageUrl === 'string' ? cacheEntry.imageUrl : null
      };
    });
  }

  return {
    enrichTokenRows
  };
}
