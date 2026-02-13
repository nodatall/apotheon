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

export function createUniverseRefreshService({
  chainsRepository,
  tokenUniverseRepository,
  birdeyeClient,
  targetSize = 200
}) {
  async function refreshChain({ chain, asOfDateUtc }) {
    const tokens = await birdeyeClient.fetchTopTokens({ chain, limit: targetSize });
    const rankedItems = toRankedItems(tokens);
    const status = rankedItems.length >= targetSize ? 'ready' : 'partial';

    const snapshot = await tokenUniverseRepository.upsertSnapshot({
      chainId: chain.id,
      asOfDateUtc,
      source: 'birdeye',
      status,
      itemCount: rankedItems.length,
      errorMessage: null
    });

    await tokenUniverseRepository.replaceSnapshotItems(snapshot.id, rankedItems);

    return {
      chainId: chain.id,
      snapshotId: snapshot.id,
      source: snapshot.source,
      status: snapshot.status,
      itemCount: snapshot.itemCount
    };
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

        const snapshot = await tokenUniverseRepository.upsertSnapshot({
          chainId: chain.id,
          asOfDateUtc,
          source: 'birdeye',
          status: 'failed',
          itemCount: 0,
          errorMessage: message
        });

        outcomes.push({
          chainId: chain.id,
          snapshotId: snapshot.id,
          source: snapshot.source,
          status: snapshot.status,
          itemCount: snapshot.itemCount,
          errorMessage: snapshot.errorMessage
        });
      }
    }

    return outcomes;
  }

  return {
    refreshAllChains,
    refreshChain
  };
}
