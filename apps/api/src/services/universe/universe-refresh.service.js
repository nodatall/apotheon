function toUtcDateString(value) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function toRankedItems(rawItems) {
  return rawItems.map((item, index) => ({
    rank: index + 1,
    contractOrMint: item.contractOrMint,
    symbol: item.symbol ?? null,
    name: item.name ?? null,
    decimals: item.decimals ?? null,
    marketCapUsd: item.marketCapUsd ?? null,
    sourcePayloadHash: item.sourcePayloadHash ?? null
  }));
}

function isScanEligible(status) {
  return status === 'ready' || status === 'partial';
}

export function createUniverseRefreshService({
  chainsRepository,
  tokenUniverseRepository,
  birdeyeClient = null,
  coingeckoClient,
  targetSize = 200
}) {
  if (!coingeckoClient?.fetchTopTokens) {
    throw new Error('CoinGecko client is required for universe refresh.');
  }

  async function persistSnapshot({
    chain,
    asOfDateUtc,
    source,
    rankedItems,
    errorMessage = null
  }) {
    const status =
      errorMessage !== null
        ? 'failed'
        : rankedItems.length >= targetSize
          ? 'ready'
          : 'partial';

    const snapshot = await tokenUniverseRepository.upsertSnapshot({
      chainId: chain.id,
      asOfDateUtc,
      source,
      status,
      itemCount: rankedItems.length,
      errorMessage
    });

    await tokenUniverseRepository.replaceSnapshotItems(snapshot.id, rankedItems);
    const activeSnapshot =
      snapshot.status === 'failed'
        ? await tokenUniverseRepository.getLatestScanEligibleSnapshot(chain.id)
        : snapshot;

    return {
      chainId: chain.id,
      snapshotId: snapshot.id,
      source: snapshot.source,
      status: snapshot.status,
      itemCount: snapshot.itemCount,
      errorMessage: snapshot.errorMessage,
      activeSnapshotId: activeSnapshot?.id ?? null
      };
  }

  async function refreshWithCoinGecko({ chain, asOfDateUtc }) {
    const tokens = await coingeckoClient.fetchTopTokens({
      chain,
      limit: targetSize
    });
    const rankedItems = toRankedItems(tokens);
    return persistSnapshot({
      chain,
      asOfDateUtc,
      source: 'coingecko_fallback',
      rankedItems
    });
  }

  async function refreshChain({ chain, asOfDateUtc }) {
    if (!birdeyeClient?.fetchTopTokens) {
      try {
        return refreshWithCoinGecko({
          chain,
          asOfDateUtc
        });
      } catch (coingeckoError) {
        const message =
          coingeckoError instanceof Error ? coingeckoError.message : 'unknown coingecko error';
        throw new Error(`Universe refresh failed. coingecko=${message}`);
      }
    }

    try {
      const tokens = await birdeyeClient.fetchTopTokens({ chain, limit: targetSize });
      const rankedItems = toRankedItems(tokens);

      return persistSnapshot({
        chain,
        asOfDateUtc,
        source: 'birdeye',
        rankedItems
      });
    } catch (birdeyeError) {
      try {
        return refreshWithCoinGecko({
          chain,
          asOfDateUtc
        });
      } catch (coingeckoError) {
        const birdeyeMessage =
          birdeyeError instanceof Error ? birdeyeError.message : 'unknown birdeye error';
        const fallbackMessage =
          coingeckoError instanceof Error ? coingeckoError.message : 'unknown coingecko error';

        throw new Error(
          `Universe refresh failed. birdeye=${birdeyeMessage}; coingecko=${fallbackMessage}`
        );
      }
    }
  }

  async function handleDualSourceFailure({ chain, asOfDateUtc, errorMessage }) {
    const existingSameDate = await tokenUniverseRepository.getSnapshotByChainAndDate(
      chain.id,
      asOfDateUtc
    );

    if (existingSameDate && isScanEligible(existingSameDate.status)) {
      return {
        chainId: chain.id,
        snapshotId: existingSameDate.id,
        source: existingSameDate.source,
        status: existingSameDate.status,
        itemCount: existingSameDate.itemCount,
        errorMessage,
        activeSnapshotId: existingSameDate.id
      };
    }

    return persistSnapshot({
      chain,
      asOfDateUtc,
      source: existingSameDate?.source ?? 'coingecko_fallback',
      rankedItems: [],
      errorMessage
    });
  }

  async function refreshChainById({ chainId, asOfDateUtc }) {
    const chains = await chainsRepository.listChains();
    const chain = chains.find((item) => item.id === chainId);

    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    return refreshChain({
      chain,
      asOfDateUtc: asOfDateUtc ?? toUtcDateString(new Date())
    });
  }

  async function refreshAllChains({ asOfDateUtc = toUtcDateString(new Date()) } = {}) {
    const chains = await chainsRepository.listChains();
    const activeChains = chains.filter((chain) => chain.isActive);

    const outcomes = [];
    for (const chain of activeChains) {
      try {
        outcomes.push(await refreshChain({ chain, asOfDateUtc }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown universe refresh failure';

        outcomes.push(
          await handleDualSourceFailure({
            chain,
            asOfDateUtc,
            errorMessage: message
          })
        );
      }
    }

    return outcomes;
  }

  return {
    refreshAllChains,
    refreshChain,
    refreshChainById
  };
}
