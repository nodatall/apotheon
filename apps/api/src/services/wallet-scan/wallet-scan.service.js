import { normalizeAddressForChain } from '../shared/address-normalization.js';

function nowIso() {
  return new Date().toISOString();
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
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
    symbol: 'POL',
    wrappedContract: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    aliasContracts: ['0x0000000000000000000000000000000000001010']
  },
  bsc: {
    symbol: 'BNB',
    wrappedContract: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
  },
  avalanche: {
    symbol: 'AVAX',
    wrappedContract: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'
  },
  beam: {
    symbol: 'BEAM',
    wrappedContract: null
  },
  ronin: {
    symbol: 'RON',
    wrappedContract: null
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
  const aliasContracts = Array.isArray(native.aliasContracts)
    ? native.aliasContracts
        .map((address) =>
          normalizeAddressForChain({
            family: chain.family,
            address
          })
        )
        .filter((address) => address && address !== nativeRef)
    : [];

  return {
    contractOrMint: nativeRef,
    symbol: native.symbol,
    name: `${native.symbol} Native`,
    decimals: Number.isInteger(native.decimals) ? native.decimals : 18,
    trackedTokenId: null,
    isNative: true,
    valuationContractOrMint,
    aliasContracts
  };
}

function trimHexPrefix(value) {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function hexToUtf8(value) {
  const trimmed = trimHexPrefix(value);
  if (!trimmed || trimmed.length % 2 !== 0) {
    return null;
  }

  try {
    const bytes = Buffer.from(trimmed, 'hex');
    const decoded = bytes.toString('utf8').replace(/\u0000+$/g, '').trim();
    return decoded || null;
  } catch {
    return null;
  }
}

function decodeAbiString(hexValue) {
  if (typeof hexValue !== 'string') {
    return null;
  }

  const trimmed = trimHexPrefix(hexValue);
  if (!trimmed || trimmed.length < 64) {
    return null;
  }

  if (trimmed.length === 64) {
    return hexToUtf8(`0x${trimmed}`);
  }

  try {
    const offset = Number.parseInt(trimmed.slice(0, 64), 16);
    if (!Number.isFinite(offset) || offset < 0) {
      return null;
    }
    const lengthOffset = offset * 2;
    const lengthHex = trimmed.slice(lengthOffset, lengthOffset + 64);
    if (lengthHex.length !== 64) {
      return null;
    }
    const contentLength = Number.parseInt(lengthHex, 16);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return null;
    }
    const contentStart = lengthOffset + 64;
    const contentEnd = contentStart + contentLength * 2;
    const contentHex = trimmed.slice(contentStart, contentEnd);
    if (!contentHex) {
      return null;
    }
    return hexToUtf8(`0x${contentHex}`);
  } catch {
    return null;
  }
}

function decodeAbiUint(hexValue) {
  if (typeof hexValue !== 'string') {
    return null;
  }

  const trimmed = trimHexPrefix(hexValue);
  if (!trimmed || trimmed.length > 64) {
    return null;
  }

  try {
    return Number(BigInt(`0x${trimmed}`));
  } catch {
    return null;
  }
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
    trackingSource: existing.trackingSource ?? next.trackingSource ?? null,
    metadataSource: existing.metadataSource ?? next.metadataSource ?? null,
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
  valuationService = null,
  fetchImpl = fetch,
  tokenMetadataTimeoutMs = 8000
}) {
  async function rpcEthCall({ chain, contractOrMint, data }) {
    if (chain?.family !== 'evm') {
      return null;
    }

    const rpcUrl = typeof chain?.rpcUrl === 'string' ? chain.rpcUrl.trim() : '';
    if (!rpcUrl) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), tokenMetadataTimeoutMs);
    try {
      const response = await fetchImpl(rpcUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [
            {
              to: contractOrMint,
              data
            },
            'latest'
          ]
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        return null;
      }
      const payload = await response.json().catch(() => null);
      if (!payload || payload.error || typeof payload.result !== 'string') {
        return null;
      }
      return payload.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveEvmTokenMetadataFromRpc({ chain, contractOrMint }) {
    if (chain?.family !== 'evm') {
      return {
        symbol: null,
        name: null,
        decimals: null
      };
    }

    const [symbolRaw, nameRaw, decimalsRaw] = await Promise.all([
      rpcEthCall({ chain, contractOrMint, data: '0x95d89b41' }),
      rpcEthCall({ chain, contractOrMint, data: '0x06fdde03' }),
      rpcEthCall({ chain, contractOrMint, data: '0x313ce567' })
    ]);

    const symbol = decodeAbiString(symbolRaw);
    const name = decodeAbiString(nameRaw);
    const parsedDecimals = decodeAbiUint(decimalsRaw);
    const decimals =
      Number.isInteger(parsedDecimals) && parsedDecimals >= 0 && parsedDecimals <= 36
        ? parsedDecimals
        : null;

    return {
      symbol,
      name,
      decimals
    };
  }

  async function createCatalogBackedSnapshot({ chainId, reason }) {
    if (!tokenUniverseRepository?.upsertSnapshot) {
      return null;
    }

    const snapshot = await tokenUniverseRepository.upsertSnapshot({
      chainId,
      asOfDateUtc: todayUtcDate(),
      source: 'coingecko_fallback',
      status: 'partial',
      itemCount: 0,
      errorMessage: reason ?? null
    });
    if (tokenUniverseRepository?.replaceSnapshotItems) {
      await tokenUniverseRepository.replaceSnapshotItems(snapshot.id, []);
    }

    return snapshot;
  }

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
    if (!snapshot && trackedTokensRepository?.countTrackedTokensByChain) {
      const trackedTokenCount = await trackedTokensRepository.countTrackedTokensByChain({
        chainId,
        includeInactive: false
      });
      if (trackedTokenCount > 0) {
        const fallbackSnapshot = await createCatalogBackedSnapshot({
          chainId,
          reason: refreshError instanceof Error ? refreshError.message : null
        });
        if (fallbackSnapshot) {
          return fallbackSnapshot;
        }
      }
    }

    if (!snapshot && refreshError) {
      throw new Error(
        `No scan-eligible universe snapshot for chain: ${chainId}. Universe refresh failed: ${
          refreshError instanceof Error ? refreshError.message : String(refreshError)
        }`
      );
    }
    return snapshot;
  }

  function mergeScanTokens({ chain, discoveryTokens = [], trackedTokens }) {
    const merged = new Map();

    const nativeToken = buildNativeScanToken(chain);
    const nativeAliasContracts = new Set();
    if (nativeToken) {
      merged.set(
        nativeToken.contractOrMint,
        mergeTokenMetadata(merged.get(nativeToken.contractOrMint), nativeToken)
      );
      for (const alias of nativeToken.aliasContracts ?? []) {
        nativeAliasContracts.add(alias);
      }
    }

    for (const token of discoveryTokens) {
      const normalizedContract = normalizeAddressForChain({
        family: chain.family,
        address: token.contractOrMint
      });
      if (!normalizedContract) {
        continue;
      }
      if (nativeAliasContracts.has(normalizedContract)) {
        continue;
      }

      merged.set(
        normalizedContract,
        mergeTokenMetadata(merged.get(normalizedContract), {
          contractOrMint: normalizedContract,
          symbol: token.symbol ?? null,
          name: token.name ?? null,
          decimals: Number.isInteger(token.decimals) ? token.decimals : null,
          trackedTokenId: null,
          trackingSource: null,
          metadataSource: null,
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
      if (nativeAliasContracts.has(normalizedContract)) {
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
          trackingSource: tracked.trackingSource ?? null,
          metadataSource: tracked.metadataSource ?? null,
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
      // Ignore provider failures and continue to historical fallback below.
    }

    if (scansRepository?.getLatestKnownUsdPricesByContracts) {
      const missingContracts = [];
      const quantityByContract = new Map();

      for (const position of heldPositions) {
        const normalizedContract = normalizeAddressForChain({
          family: chain.family,
          address: position.contractOrMint
        });
        if (!normalizedContract) {
          continue;
        }

        quantityByContract.set(normalizedContract, Number(position.quantity) || 0);
        const current = valuationByContract.get(normalizedContract);
        if (!current || current.valuationStatus !== 'known' || typeof current.usdValue !== 'number') {
          missingContracts.push(normalizedContract);
        }
      }

      if (missingContracts.length > 0) {
        try {
          const latestKnownUsdPrices = await scansRepository.getLatestKnownUsdPricesByContracts({
            chainId: chain.id,
            contracts: missingContracts
          });

          for (const contract of missingContracts) {
            const price = latestKnownUsdPrices?.[contract];
            const quantity = quantityByContract.get(contract) ?? 0;
            if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
              continue;
            }
            if (!Number.isFinite(quantity) || quantity <= 0) {
              continue;
            }

            valuationByContract.set(contract, {
              usdValue: quantity * price,
              valuationStatus: 'known'
            });
          }
        } catch (_error) {
          // Keep unknown valuation when historical fallback lookup fails.
        }
      }
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
      const trackedTokens = trackedTokensRepository.listTrackedTokens
        ? await trackedTokensRepository.listTrackedTokens({ chainId: wallet.chainId })
        : [];
      const discoveryTokens =
        trackedTokens.length === 0
          ? await tokenUniverseRepository.getSnapshotItems(snapshot.id)
          : [];
      const scanTokensByAddress = mergeScanTokens({
        chain,
        discoveryTokens,
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
      let heldTokenCount = 0;
      for (const balance of balances) {
        const normalizedContract = normalizeAddressForChain({
          family: chain.family,
          address: balance.contractOrMint
        });
        if (!normalizedContract) {
          continue;
        }
        let tokenMetadata = scanTokensByAddress.get(normalizedContract);
        const heldFlag = Number(balance.balanceNormalized) > 0;
        if (heldFlag) {
          heldTokenCount += 1;
        }
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

        if (
          heldFlag &&
          tokenId &&
          !autoTrackedFlag &&
          tokenMetadata?.isNative !== true &&
          trackedTokensRepository.upsertTrackedToken &&
          !tokenMetadata?.symbol
        ) {
          const resolved = await resolveEvmTokenMetadataFromRpc({
            chain,
            contractOrMint: normalizedContract
          });
          const nextSymbol = tokenMetadata?.symbol ?? resolved.symbol ?? null;
          const nextName = tokenMetadata?.name ?? resolved.name ?? null;
          const nextDecimals = Number.isInteger(tokenMetadata?.decimals)
            ? tokenMetadata.decimals
            : Number.isInteger(resolved.decimals)
              ? resolved.decimals
              : null;
          if (nextSymbol || nextName || Number.isInteger(nextDecimals)) {
            const refreshed = await trackedTokensRepository.upsertTrackedToken({
              chainId: wallet.chainId,
              contractOrMint: normalizedContract,
              symbol: nextSymbol,
              name: nextName,
              decimals: nextDecimals,
              metadataSource: tokenMetadata?.metadataSource ?? 'auto',
              trackingSource: tokenMetadata?.trackingSource ?? 'manual'
            });
            const refreshedId = tokenId ?? refreshed?.id ?? null;
            tokenId = refreshedId;
            tokenMetadata = mergeTokenMetadata(tokenMetadata, {
              contractOrMint: normalizedContract,
              symbol: refreshed?.symbol ?? nextSymbol,
              name: refreshed?.name ?? nextName,
              decimals: Number.isInteger(refreshed?.decimals) ? refreshed.decimals : nextDecimals,
              trackedTokenId: refreshedId,
              trackingSource: refreshed?.trackingSource ?? tokenMetadata?.trackingSource ?? 'manual',
              metadataSource: refreshed?.metadataSource ?? tokenMetadata?.metadataSource ?? 'auto',
              isNative: tokenMetadata?.isNative === true,
              valuationContractOrMint: tokenMetadata?.valuationContractOrMint ?? normalizedContract
            });
            scanTokensByAddress.set(normalizedContract, tokenMetadata);
          }
        }

        if (
          heldFlag &&
          tokenId &&
          !autoTrackedFlag &&
          tokenMetadata?.isNative === true &&
          trackedTokensRepository.upsertTrackedToken &&
          (tokenMetadata?.symbol || tokenMetadata?.name || Number.isInteger(tokenMetadata?.decimals))
        ) {
          const refreshed = await trackedTokensRepository.upsertTrackedToken({
            chainId: wallet.chainId,
            contractOrMint: normalizedContract,
            symbol: tokenMetadata?.symbol ?? null,
            name: tokenMetadata?.name ?? null,
            decimals: Number.isInteger(tokenMetadata?.decimals) ? tokenMetadata.decimals : null,
            metadataSource: 'auto',
            trackingSource: 'scan'
          });
          tokenId = tokenId ?? refreshed?.id ?? null;
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
        heldTokenCount,
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
