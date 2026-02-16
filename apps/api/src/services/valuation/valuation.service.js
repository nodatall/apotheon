function chunk(values, size) {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
}

export function createValuationService({
  coingeckoClient = null,
  dexFallbackClient = null,
  batchSize = 100
} = {}) {
  async function fetchPricesWithFallback({ chain, contracts }) {
    const prices = new Map();
    const uniqueContracts = [
      ...new Set(
        contracts
          .map((contract) => String(contract || '').trim().toLowerCase())
          .filter((contract) => contract.length > 0)
      )
    ];

    for (const group of chunk(uniqueContracts, batchSize)) {
      let primary = {};
      if (coingeckoClient?.getPricesByContracts) {
        primary = await coingeckoClient.getPricesByContracts({ chain, contracts: group });
      }

      const missingContracts = [];
      for (const contract of group) {
        const primaryValue = primary?.[contract] ?? primary?.[contract.toLowerCase()] ?? null;
        if (typeof primaryValue === 'number') {
          prices.set(contract, primaryValue);
          continue;
        }

        missingContracts.push(contract);
      }

      if (dexFallbackClient?.getPriceByContract && missingContracts.length > 0) {
        const fallbackResults = await Promise.allSettled(
          missingContracts.map((contract) => dexFallbackClient.getPriceByContract({ chain, contract }))
        );

        for (let index = 0; index < fallbackResults.length; index += 1) {
          const outcome = fallbackResults[index];
          if (outcome.status === 'fulfilled' && typeof outcome.value === 'number') {
            prices.set(missingContracts[index], outcome.value);
          }
        }
      }
    }

    return prices;
  }

  async function valuatePositions({ chain, positions }) {
    const contracts = positions.map((position) => position.contractOrMint);
    const prices = await fetchPricesWithFallback({ chain, contracts });

    return positions.map((position) => {
      const key = String(position.contractOrMint).toLowerCase();
      const usdPrice = prices.get(key);

      if (typeof usdPrice !== 'number') {
        return {
          ...position,
          usdPrice: null,
          usdValue: null,
          valuationStatus: 'unknown'
        };
      }

      return {
        ...position,
        usdPrice,
        usdValue: Number(position.quantity) * usdPrice,
        valuationStatus: 'known'
      };
    });
  }

  return {
    fetchPricesWithFallback,
    valuatePositions
  };
}
