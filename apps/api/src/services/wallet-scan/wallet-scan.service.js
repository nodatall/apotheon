import { normalizeAddressForChain } from '../shared/address-normalization.js';

function nowIso() {
  return new Date().toISOString();
}

const UNKNOWN_VALUATION = {
  usdValue: null,
  valuationStatus: 'unknown'
};

const EVM_NATIVE_ASSETS = {
  ethereum: {
    symbol: 'ETH',
    wrappedContract: '0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2'
  },
  arbitrum: {
    symbol: 'ETH',
    wrappedContract: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
  },
  base: {
    symbol: 'ETH',
    wrappedContract: '0x4200000000000000000000000000000000000006'
  },
  optimism: {
    symbol: 'ETH',
    wrappedContract: '0x4200000000000000000000000000000000000006'
  },
  polygon: {
    symbol: 'MATIC',
    wrappedContract: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'
  },
  bsc: {
    symbol: 'BNB',
    wrappedContract: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
  },
  avalanche: {
    symbol: 'AVAX',
    wrappedContract: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'
  }
};

function resolveNativeAssetConfig(chain) {
  if (chain.family === 'solana') {
    return {
      symbol: 'SOL',
      wrappedContract: null,
      decimals: 9
    };
  }

  if (chain.family !== 'evm') {
    return null;
  }

  const config = EVM_NATIVE_ASSETS[chain.slug];
  if (!config) {
    return {
      symbol: 'ETH',
      wrappedContract: null,
      decimals: 18
    };
  }

  return {
    ...config,
    decimals: 18
  };
}

function buildNativeScanToken(chain) {
  const native = resolveNativeAssetConfig(chain);
  if (!native?.symbol) {
    return null;
  }

  const nativeRef = normalizeAddressForChain({
    family: chain.family,
    address: `native:${chain.slug || chain.id}`
  });
  const valuationContractOrMint = native.wrappedContract
    ? normalizeAddressForChain({
        family: chain.family,
        address: native.wrappedContract
      })
    : nativeRef;

  return {
    contractOrMint: nativeRef,
    symbol: native.symbol,
    name: `${native.symbol} Native`,
    decimals: Number.isInteger(native.decimals) ? native.decimals : 18,
    trackedTokenId: null,
    isNative: true,
    valuationContractOrMint
  };
}

function mergeTokenMetadata(existing, next) {
  if (!existing) {
    return { ...next };
  }

  return {
    ...existing,
    contractOrMint: existing.contractOrMint || next.contractOrMint,
    symbol: existing.symbol ?? next.symbol ?? null,
    name: existing.name ?? next.name ?? null,
    decimals: existing.decimals ?? next.decimals ?? null,
    trackedTokenId: next.trackedTokenId ?? existing.trackedTokenId ?? null,
    isNative: Boolean(existing.isNative || next.isNative),
    valuationContractOrMint:
      existing.valuationContractOrMint ?? next.valuationContractOrMint ?? existing.contractOrMint
  };
}

export function createWalletScanService({
  chainsRepository,
  walletsRepository,
  tokenUniverseRepository,
  scansRepository,
  trackedTokensRepository,
  balanceBatcher,
  universeRefreshService = null,
  valuationService = null
}) {
  async function getScanEligibleSnapshot(chainId) {
    let snapshot = await tokenUniverseRepository.getLatestScanEligibleSnapshot(chainId);
    if (snapshot) {
      return snapshot;
    }

    if (!universeRefreshService?.refreshChainById) {
      return null;
    }

    let refreshError = null;
    try {
      await universeRefreshService.refreshChainById({ chainId });
    } catch (error) {
      refreshError = error;
    }

    snapshot = await tokenUniverseRepository.getLatestScanEligibleSnapshot(chainId);
    if (!snapshot && refreshError) {
      throw new Error(
        `No scan-eligible universe snapshot for chain: ${chainId}. Universe refresh failed: ${
          refreshError instanceof Error ? refreshError.message : String(refreshError)
        }`
      );
    }
    return snapshot;
  }

  function mergeScanTokens({ chain, universeItems, trackedTokens }) {
    const merged = new Map();

    const nativeToken = buildNativeScanToken(chain);
    if (nativeToken) {
      merged.set(
        nativeToken.contractOrMint,
        mergeTokenMetadata(merged.get(nativeToken.contractOrMint), nativeToken)
      );
    }

    for (const item of universeItems) {
      const normalizedContract = normalizeAddressForChain({
        family: chain.family,
        address: item.contractOrMint
      });
      if (!normalizedContract) {
        continue;
      }

      merged.set(
        normalizedContract,
        mergeTokenMetadata(merged.get(normalizedContract), {
          contractOrMint: normalizedContract,
          symbol: item.symbol ?? null,
          name: item.name ?? null,
          decimals: Number.isInteger(item.decimals) ? item.decimals : null,
          trackedTokenId: null,
          isNative: false,
          valuationContractOrMint: normalizedContract
        })
      );
    }

    for (const tracked of trackedTokens) {
      const normalizedContract = normalizeAddressForChain({
        family: chain.family,
        address: tracked.contractOrMint
      });
      if (!normalizedContract) {
        continue;
      }

      merged.set(
        normalizedContract,
        mergeTokenMetadata(merged.get(normalizedContract), {
          contractOrMint: normalizedContract,
          symbol: tracked.symbol ?? null,
          name: tracked.name ?? null,
          decimals: Number.isInteger(tracked.decimals) ? tracked.decimals : null,
          trackedTokenId: tracked.id,
          isNative: merged.get(normalizedContract)?.isNative === true,
          valuationContractOrMint: merged.get(normalizedContract)?.valuationContractOrMint ?? normalizedContract
        })
      );
    }

    return merged;
  }

  async function resolveHeldTokenValuations({ chain, balances }) {
    const valuationByContract = new Map();
    const heldPositions = balances
      .filter((balance) => Number(balance.balanceNormalized) > 0)
      .map((balance) => ({
        contractOrMint: balance.contractOrMint,
        valuationContractOrMint: balance.valuationContractOrMint ?? balance.contractOrMint,
        quantity: Number(balance.balanceNormalized)
      }));

    if (heldPositions.length === 0 || !valuationService?.valuatePositions) {
      return valuationByContract;
    }

    try {
      const valued = await valuationService.valuatePositions({
        chain,
        positions: heldPositions
      });

      for (const item of valued) {
        const normalizedContract = normalizeAddressForChain({
          family: chain.family,
          address: item.contractOrMint
        });

        if (!normalizedContract) {
          continue;
        }

        valuationByContract.set(normalizedContract, {
          usdValue: item.usdValue ?? null,
          valuationStatus: item.valuationStatus === 'known' ? 'known' : 'unknown'
        });
      }
    } catch (_error) {
      return valuationByContract;
    }

    return valuationByContract;
  }

  async function runScan({ walletId }) {
    const wallet = await walletsRepository.getWalletById(walletId);
    if (!wallet) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    const chain = await chainsRepository.getChainById(wallet.chainId);
    if (!chain) {
      throw new Error(`Chain not found for wallet: ${wallet.chainId}`);
    }

    const snapshot = await getScanEligibleSnapshot(wallet.chainId);
    if (!snapshot) {
      throw new Error(`No scan-eligible universe snapshot for chain: ${wallet.chainId}`);
    }

    const run = await scansRepository.createScanRun({
      walletId: wallet.id,
      chainId: wallet.chainId,
      universeSnapshotId: snapshot.id,
      status: 'running',
      startedAt: nowIso()
    });

    try {
      const [universeItems, trackedTokens] = await Promise.all([
        tokenUniverseRepository.getSnapshotItems(snapshot.id),
        trackedTokensRepository.listTrackedTokens
          ? trackedTokensRepository.listTrackedTokens({ chainId: wallet.chainId })
          : []
      ]);
      const scanTokensByAddress = mergeScanTokens({
        chain,
        universeItems,
        trackedTokens
      });
      const scanTokens = Array.from(scanTokensByAddress.values());
      const balances = await balanceBatcher.resolveBalances({
        chain,
        walletAddress: wallet.address,
        tokens: scanTokens.map((item) => ({
          contractOrMint: item.contractOrMint,
          symbol: item.symbol,
          name: item.name,
          decimals: item.decimals,
          isNative: item.isNative === true,
          valuationContractOrMint: item.valuationContractOrMint ?? item.contractOrMint
        }))
      });
      const failedResolutionCount = balances.filter((balance) => balance.resolutionError === true).length;
      if (balances.length > 0 && failedResolutionCount === balances.length) {
        throw new Error(`Balance resolution failed for all scan tokens on chain: ${chain.slug || chain.id}`);
      }
      const valuationByContract = await resolveHeldTokenValuations({ chain, balances });

      let autoTrackedCount = 0;
      let unknownValuationCount = 0;
      for (const balance of balances) {
        const normalizedContract = normalizeAddressForChain({
          family: chain.family,
          address: balance.contractOrMint
        });
        if (!normalizedContract) {
          continue;
        }
        const tokenMetadata = scanTokensByAddress.get(normalizedContract);
        const heldFlag = Number(balance.balanceNormalized) > 0;
        let tokenId = tokenMetadata?.trackedTokenId ?? null;
        let autoTrackedFlag = false;

        if (heldFlag && !tokenId) {
          const token = await trackedTokensRepository.upsertTrackedToken({
            chainId: wallet.chainId,
            contractOrMint: normalizedContract,
            symbol: tokenMetadata?.symbol ?? null,
            name: tokenMetadata?.name ?? null,
            decimals: tokenMetadata?.decimals ?? null,
            metadataSource: 'auto',
            trackingSource: 'scan'
          });
          tokenId = token.id;
          autoTrackedFlag = true;
          autoTrackedCount += 1;
        }

        const valuation = heldFlag
          ? valuationByContract.get(normalizedContract) ?? UNKNOWN_VALUATION
          : UNKNOWN_VALUATION;

        if (heldFlag && valuation.valuationStatus !== 'known') {
          unknownValuationCount += 1;
        }

        await scansRepository.upsertScanItem({
          scanId: run.id,
          tokenId,
          contractOrMint: normalizedContract,
          balanceRaw: balance.balanceRaw,
          balanceNormalized: balance.balanceNormalized,
          heldFlag,
          autoTrackedFlag,
          usdValue: valuation.usdValue,
          valuationStatus: valuation.valuationStatus
        });
      }

      const status = unknownValuationCount > 0 ? 'partial' : 'success';
      const completedRun = await scansRepository.updateScanRun(run.id, {
        status,
        finishedAt: nowIso(),
        errorMessage: null
      });

      return {
        scanRun: completedRun,
        autoTrackedCount,
        universeSnapshotId: snapshot.id
      };
    } catch (error) {
      await scansRepository.updateScanRun(run.id, {
        status: 'failed',
        finishedAt: nowIso(),
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  return {
    rescanWallet: runScan,
    runScan
  };
}
