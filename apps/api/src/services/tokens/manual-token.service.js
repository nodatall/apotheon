import { normalizeAddressForChain } from '../shared/address-normalization.js';

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

  // Some ERC20s return bytes32 instead of ABI string.
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

export function createManualTokenService({
  trackedTokensRepository,
  metadataClient = null,
  logger = console,
  fetchImpl = fetch,
  timeoutMs = 8000
}) {
  async function rpcEthCall({ chain, contractOrMint, data }) {
    const rpcUrl = typeof chain?.rpcUrl === 'string' ? chain.rpcUrl.trim() : '';
    if (!rpcUrl) {
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

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

  async function resolveMetadataFromEvmRpc({ chain, contractOrMint }) {
    if (chain?.family !== 'evm') {
      return {
        symbol: null,
        name: null,
        decimals: null
      };
    }

    try {
      const [symbolRaw, nameRaw, decimalsRaw] = await Promise.all([
        rpcEthCall({ chain, contractOrMint, data: '0x95d89b41' }), // symbol()
        rpcEthCall({ chain, contractOrMint, data: '0x06fdde03' }), // name()
        rpcEthCall({ chain, contractOrMint, data: '0x313ce567' }) // decimals()
      ]);

      const symbol = decodeAbiString(symbolRaw);
      const name = decodeAbiString(nameRaw);
      const decodedDecimals = decodeAbiUint(decimalsRaw);
      const decimals =
        Number.isInteger(decodedDecimals) && decodedDecimals >= 0 && decodedDecimals <= 36
          ? decodedDecimals
          : null;

      return {
        symbol,
        name,
        decimals
      };
    } catch {
      return {
        symbol: null,
        name: null,
        decimals: null
      };
    }
  }

  async function resolveMetadata({ chain, contractOrMint }) {
    let metadata = {
      symbol: null,
      name: null,
      decimals: null
    };

    if (metadataClient) {
      try {
        const clientMetadata = await metadataClient.fetchTokenMetadata({ chain, contractOrMint });
        metadata = {
          symbol: clientMetadata?.symbol ?? null,
          name: clientMetadata?.name ?? null,
          decimals: Number.isInteger(clientMetadata?.decimals) ? clientMetadata.decimals : null
        };
      } catch (error) {
        logger.warn?.(
          `Token metadata fetch failed for chain=${chain.slug || chain.id} contract=${contractOrMint}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (metadata.symbol || metadata.name || Number.isInteger(metadata.decimals)) {
      return {
        symbol: metadata?.symbol ?? null,
        name: metadata?.name ?? null,
        decimals: Number.isInteger(metadata?.decimals) ? metadata.decimals : null
      };
    }

    return resolveMetadataFromEvmRpc({ chain, contractOrMint });
  }

  async function registerManualToken({ chain, contractOrMint, symbol, name, decimals }) {
    const normalized = normalizeAddressForChain({
      family: chain.family,
      address: contractOrMint
    });
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
