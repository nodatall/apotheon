function normalizeContractOrMint(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function createManualTokenService({ trackedTokensRepository, metadataClient = null }) {
  async function resolveMetadata({ chain, contractOrMint }) {
    if (!metadataClient) {
      return {
        symbol: null,
        name: null,
        decimals: null
      };
    }

    try {
      const metadata = await metadataClient.fetchTokenMetadata({ chain, contractOrMint });
      return {
        symbol: metadata?.symbol ?? null,
        name: metadata?.name ?? null,
        decimals: Number.isInteger(metadata?.decimals) ? metadata.decimals : null
      };
    } catch (_error) {
      return {
        symbol: null,
        name: null,
        decimals: null
      };
    }
  }

  async function registerManualToken({ chain, contractOrMint, symbol, name, decimals }) {
    const normalized = normalizeContractOrMint(contractOrMint);
    if (!normalized) {
      throw new Error('contractOrMint is required.');
    }

    const autoMetadata = await resolveMetadata({ chain, contractOrMint: normalized });

    const hasOverride = symbol !== undefined || name !== undefined || decimals !== undefined;
    const metadataSource = hasOverride ? 'manual_override' : 'auto';

    return trackedTokensRepository.upsertTrackedToken({
      chainId: chain.id,
      contractOrMint: normalized,
      symbol: symbol ?? autoMetadata.symbol,
      name: name ?? autoMetadata.name,
      decimals: decimals ?? autoMetadata.decimals,
      metadataSource,
      trackingSource: 'manual'
    });
  }

  return {
    registerManualToken
  };
}
